"""
Bounce detection for SMTP sending.

An SMTP server accepts a message first and finds out later that it cannot be
delivered; it then emails a bounce to the sender. This worker reads the sender
mailbox over IMAP, finds those bounces and marks the recipients as bounced.

The mailbox is opened read-only and messages are fetched with PEEK: nothing is
deleted, moved or marked as read.
"""
import asyncio
import imaplib
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, update, func

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.campaign import Campaign, Recipient
from app.models.settings_model import AppSettings
from app.models.suppression import SuppressionList
from app.models.tracking import TrackingEvent
from app.services.bounce_parser import Bounce, parse_bounce

logger = logging.getLogger(__name__)

STATE_KEY = "bounce_mailbox_state"
POLL_SECONDS = 60
FIRST_RUN_DAYS = 7          # how far back the first check looks
MATCH_WINDOW_DAYS = 14      # a bounce is matched by address only to mail sent this recently
MAX_MESSAGES_PER_RUN = 200
IMAP_TIMEOUT = 30

_shutdown_event = asyncio.Event()
_check_lock = asyncio.Lock()


# ─── Settings ──────────────────────────────────────────────────────────

def mailbox_settings() -> dict:
    """The mailbox to read. Anything left blank follows the SMTP settings."""
    host = (settings.IMAP_HOST or "").strip()
    if not host and settings.SMTP_HOST:
        smtp_host = settings.SMTP_HOST.strip().lower()
        host = "imap." + smtp_host[len("smtp."):] if smtp_host.startswith("smtp.") else smtp_host
    return {
        "enabled": bool(settings.IMAP_ENABLED),
        "host": host,
        "port": int(settings.IMAP_PORT or 993),
        "username": settings.IMAP_USERNAME or settings.SMTP_USERNAME or "",
        "password": settings.IMAP_PASSWORD or settings.SMTP_PASSWORD or "",
        "folder": (settings.IMAP_FOLDER or "INBOX").strip() or "INBOX",
    }


def mailbox_problem(cfg: Optional[dict] = None) -> Optional[str]:
    cfg = cfg or mailbox_settings()
    if not cfg["host"]:
        return "No IMAP host is set."
    if not cfg["username"] or not cfg["password"]:
        return "The mailbox username or password is missing."
    return None


async def read_state(db) -> dict:
    row = (await db.execute(select(AppSettings).where(AppSettings.key == STATE_KEY))).scalar_one_or_none()
    if not row or not row.value:
        return {}
    try:
        value = json.loads(row.value)
        return value if isinstance(value, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


async def _write_state(db, state: dict) -> None:
    row = (await db.execute(select(AppSettings).where(AppSettings.key == STATE_KEY))).scalar_one_or_none()
    value = json.dumps(state)
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=STATE_KEY, value=value, description="Bounce mailbox progress"))
    await db.commit()


# ─── Mailbox (blocking, runs in a thread) ──────────────────────────────

def _quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _fetch_bounce_candidates(cfg: dict, state: dict) -> dict:
    """
    Messages that may be bounces and arrived since the last check.
    Returns {"messages": [(uid, raw)], "uidvalidity", "last_uid", "truncated"}.
    """
    conn = imaplib.IMAP4_SSL(cfg["host"], cfg["port"], timeout=IMAP_TIMEOUT)
    try:
        conn.login(cfg["username"], cfg["password"])
        folder = _quote(cfg["folder"])

        typ, data = conn.status(folder, "(UIDNEXT UIDVALIDITY)")
        if typ != "OK":
            raise imaplib.IMAP4.error(f"Folder {cfg['folder']} not found")
        text = (data[0] or b"").decode("utf-8", "replace")
        uidnext = int(re.search(r"UIDNEXT (\d+)", text).group(1))
        uidvalidity = re.search(r"UIDVALIDITY (\d+)", text).group(1)

        typ, _ = conn.select(folder, readonly=True)
        if typ != "OK":
            raise imaplib.IMAP4.error(f"Could not open folder {cfg['folder']}")

        same_mailbox = (
            state.get("uidvalidity") == uidvalidity
            and state.get("mailbox") == f"{cfg['username']}@{cfg['host']}/{cfg['folder']}"
        )
        last_uid = int(state.get("last_uid") or 0) if same_mailbox else 0

        senders = '(OR OR FROM "mailer-daemon" FROM "postmaster" SUBJECT "Undeliverable")'
        if last_uid:
            criteria = f"UID {last_uid + 1}:* {senders}"
        else:
            since = (datetime.now(timezone.utc) - timedelta(days=FIRST_RUN_DAYS)).strftime("%d-%b-%Y")
            criteria = f"SINCE {since} {senders}"

        typ, data = conn.uid("SEARCH", None, criteria)
        if typ != "OK":
            raise imaplib.IMAP4.error("Mailbox search failed")
        # "n:*" always includes the newest message, even when it is older than n
        uids = sorted(int(u) for u in (data[0] or b"").split() if int(u) > last_uid)

        truncated = len(uids) > MAX_MESSAGES_PER_RUN
        uids = uids[:MAX_MESSAGES_PER_RUN]

        messages = []
        for uid in uids:
            typ, parts = conn.uid("FETCH", str(uid), "(BODY.PEEK[])")
            if typ != "OK":
                continue
            raw = next((p[1] for p in parts if isinstance(p, tuple) and len(p) > 1), None)
            if raw:
                messages.append((uid, raw))

        # When everything was read, skip straight to the end of the mailbox
        new_last = uids[-1] if truncated else max(uidnext - 1, last_uid)
        return {"messages": messages, "uidvalidity": uidvalidity, "last_uid": new_last, "truncated": truncated}
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def describe_mailbox_error(exc: Exception) -> str:
    text = str(exc)
    if isinstance(exc, imaplib.IMAP4.error):
        if isinstance(exc.args[0] if exc.args else None, bytes):
            text = exc.args[0].decode("utf-8", "replace")
        lowered = text.lower()
        if "authenticationfailed" in lowered or "invalid credentials" in lowered or "login" in lowered:
            return (
                f"The mailbox rejected the login: {text}. "
                "Gmail and Outlook need an app password, and IMAP must be enabled for the account."
            )
        return f"Mailbox error: {text}"
    if isinstance(exc, (TimeoutError, OSError)):
        return f"Could not reach the mail server: {text or type(exc).__name__}"
    return f"{type(exc).__name__}: {text}"


# ─── Recording ─────────────────────────────────────────────────────────

async def _find_recipient(db, bounce: Bounce, address: Optional[str]) -> Optional[Recipient]:
    if bounce.message_id:
        result = await db.execute(
            select(Recipient).where(Recipient.ses_message_id == bounce.message_id).limit(1)
        )
        recipient = result.scalar_one_or_none()
        if recipient:
            return recipient
    if not address:
        return None
    # No usable Message-ID: take the latest email sent to that address
    reference = bounce.received_at or datetime.now(timezone.utc)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    reference = reference.astimezone(timezone.utc)
    result = await db.execute(
        select(Recipient)
        .where(
            func.lower(Recipient.email) == address,
            Recipient.status == "sent",
            Recipient.sent_at.isnot(None),
            Recipient.sent_at >= reference - timedelta(days=MATCH_WINDOW_DAYS),
        )
        .order_by(Recipient.sent_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def record_bounce(db, bounce: Bounce) -> int:
    """Mark the recipients of one bounce. Returns how many were newly marked."""
    marked = 0
    addresses = bounce.recipients or [None]
    for address in addresses:
        recipient = await _find_recipient(db, bounce, address)
        if not recipient or recipient.status != "sent":
            continue  # unknown, or already bounced / unsubscribed

        recipient.status = "bounced"
        recipient.error_message = bounce.diagnostic
        await db.execute(
            update(Campaign)
            .where(Campaign.id == recipient.campaign_id)
            .values(bounced_count=func.coalesce(Campaign.bounced_count, 0) + 1)
        )
        db.add(TrackingEvent(
            recipient_id=recipient.id,
            campaign_id=recipient.campaign_id,
            event_type="bounce",
            metadata_json={
                "bounce_type": "Permanent",
                "status": bounce.status,
                "diagnostic": bounce.diagnostic,
                "source": "imap",
            },
        ))

        email_address = recipient.email.lower()
        existing = await db.execute(
            select(SuppressionList.id).where(
                func.lower(SuppressionList.email) == email_address,
                SuppressionList.scope == "global",
            ).limit(1)
        )
        if existing.first() is None:
            from app.services.public_codes import generate_unique_public_code, PREFIXES
            db.add(SuppressionList(
                public_code=await generate_unique_public_code(db, SuppressionList, PREFIXES["suppression"]),
                email=email_address,
                scope="global",
                reason="bounce",
            ))
        marked += 1
        logger.info(f"Bounce recorded for recipient {recipient.id} ({bounce.status or 'no status'})")
    await db.commit()
    return marked


# ─── One check ─────────────────────────────────────────────────────────

async def check_mailbox(fetch=_fetch_bounce_candidates) -> dict:
    """Read new bounces once. Safe to call while the background loop runs."""
    async with _check_lock:
        cfg = mailbox_settings()
        now = datetime.now(timezone.utc).isoformat()
        summary = {"success": False, "checked_at": now, "messages_read": 0, "bounces_found": 0,
                   "recipients_marked": 0, "temporary": 0, "error": None}

        problem = mailbox_problem(cfg)
        if problem:
            summary["error"] = problem
            return summary

        async with AsyncSessionLocal() as db:
            state = await read_state(db)
            try:
                result = await asyncio.to_thread(fetch, cfg, state)
            except Exception as exc:
                summary["error"] = describe_mailbox_error(exc)
                state.update({"last_checked_at": now, "last_error": summary["error"]})
                await _write_state(db, state)
                logger.warning(f"Bounce mailbox check failed: {summary['error']}")
                return summary

            for _uid, raw in result["messages"]:
                summary["messages_read"] += 1
                bounce = parse_bounce(raw)
                if not bounce:
                    continue
                if not bounce.permanent:
                    summary["temporary"] += 1
                    continue
                summary["bounces_found"] += 1
                summary["recipients_marked"] += await record_bounce(db, bounce)

            state.update({
                "mailbox": f"{cfg['username']}@{cfg['host']}/{cfg['folder']}",
                "uidvalidity": result["uidvalidity"],
                "last_uid": result["last_uid"],
                "last_checked_at": now,
                "last_success_at": now,
                "last_error": None,
                "total_marked": int(state.get("total_marked") or 0) + summary["recipients_marked"],
            })
            await _write_state(db, state)

        summary["success"] = True
        summary["more_waiting"] = bool(result.get("truncated"))
        return summary


# ─── Background loop ───────────────────────────────────────────────────

async def start_bounce_worker():
    logger.info("Bounce worker started")
    while not _shutdown_event.is_set():
        if settings.IMAP_ENABLED:
            try:
                summary = await check_mailbox()
                if summary["recipients_marked"]:
                    logger.info(f"Bounce check: {summary['recipients_marked']} recipient(s) marked as bounced")
            except Exception as exc:
                logger.error(f"Bounce worker error: {exc}")
        try:
            await asyncio.wait_for(_shutdown_event.wait(), timeout=POLL_SECONDS)
            break
        except asyncio.TimeoutError:
            pass


async def stop_bounce_worker():
    _shutdown_event.set()
    logger.info("Bounce worker stopping...")
