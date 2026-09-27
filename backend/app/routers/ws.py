import asyncio
import logging
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.campaign import Campaign
from app.models.user import User
from app.routers.campaigns import _get_campaign, get_queue_counts
from app.utils.jwt import decode_token

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)

# Active WebSocket connections keyed by internal campaign id
_connections: dict[int, list[WebSocket]] = {}


@router.websocket("/ws/campaign/{campaign_code}")
async def campaign_progress_ws(websocket: WebSocket, campaign_code: str):
    """WebSocket endpoint for real-time campaign progress updates."""
    await websocket.accept()

    # Same login as the REST API: the browser sends the access_token cookie
    # with the handshake. Close codes 44xx tell the client not to reconnect.
    payload = decode_token(websocket.cookies.get("access_token") or "")
    if not payload or payload.get("type") != "access" or not payload.get("sub"):
        await websocket.close(code=4401)
        return

    code = (campaign_code or "").strip().upper()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == int(payload["sub"])))).scalar_one_or_none()
        if not user or not user.is_active:
            await websocket.close(code=4401)
            return
        try:
            campaign = await _get_campaign(code, user, db)
        except HTTPException as exc:
            await websocket.close(code=4403 if exc.status_code == 403 else 4404)
            return
        campaign_id = campaign.id

    if campaign_id not in _connections:
        _connections[campaign_id] = []
    _connections[campaign_id].append(websocket)

    try:
        while True:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
                campaign = result.scalar_one_or_none()

                if not campaign:
                    # Deleted while the page was open
                    await websocket.close(code=4404)
                    break

                if campaign:
                    counts = await get_queue_counts(db, campaign_id)
                    data = {
                        "pending_count": counts["pending"],
                        "sending_count": counts["sending"],
                        "queued_count": counts["queued"],
                        "retry_waiting_count": counts["retry_waiting"],
                        "last_error": campaign.last_error,
                        "campaign_id": campaign.public_code,
                        "public_code": campaign.public_code,
                        "status": campaign.status,
                        "total_recipients": campaign.total_recipients,
                        "sent_count": campaign.sent_count,
                        "failed_count": campaign.failed_count,
                        "opened_count": campaign.opened_count,
                        "clicked_count": campaign.clicked_count,
                        "bounced_count": campaign.bounced_count,
                        "unsubscribed_count": campaign.unsubscribed_count,
                        "progress_pct": round(
                            (campaign.sent_count + campaign.failed_count) / max(campaign.total_recipients, 1) * 100, 1
                        ),
                    }
                    await websocket.send_json(data)

                    if campaign.status in ("completed", "failed"):
                        await websocket.close(code=1000)
                        break

            await asyncio.sleep(2)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if campaign_id in _connections:
            _connections[campaign_id].remove(websocket)
            if not _connections[campaign_id]:
                del _connections[campaign_id]


async def broadcast_campaign_update(campaign_id: int, data: dict):
    """Broadcast update to all connected WebSocket clients for a campaign."""
    if campaign_id not in _connections:
        return

    dead_connections = []
    for ws in _connections[campaign_id]:
        try:
            await ws.send_json(data)
        except Exception:
            dead_connections.append(ws)

    for ws in dead_connections:
        _connections[campaign_id].remove(ws)
