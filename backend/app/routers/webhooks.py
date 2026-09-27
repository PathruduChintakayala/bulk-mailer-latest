import json
import logging
from fastapi import APIRouter, Request
from sqlalchemy import select, update
from app.database import AsyncSessionLocal
from app.models.campaign import Recipient, Campaign
from app.models.tracking import TrackingEvent
from app.models.suppression import SuppressionList

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


@router.post("/ses")
async def ses_notification(request: Request):
    """
    Handle SES SNS notifications for bounces and complaints.
    Configure SNS to send to this endpoint.
    """
    body = await request.json()

    # Handle SNS subscription confirmation
    if body.get("Type") == "SubscriptionConfirmation":
        # In production, verify and confirm the subscription
        logger.info(f"SNS subscription confirmation: {body.get('SubscribeURL')}")
        return {"status": "ok"}

    # Handle notification
    if body.get("Type") == "Notification":
        message = json.loads(body.get("Message", "{}"))
        notification_type = message.get("notificationType")

        if notification_type == "Bounce":
            await _handle_bounce(message)
        elif notification_type == "Complaint":
            await _handle_complaint(message)

    return {"status": "ok"}


async def _handle_bounce(message: dict):
    """Process a bounce notification from SES."""
    bounce = message.get("bounce", {})
    bounce_type = bounce.get("bounceType")  # Permanent or Transient

    for recipient_info in bounce.get("bouncedRecipients", []):
        email = recipient_info.get("emailAddress", "").lower()
        if not email:
            continue

        async with AsyncSessionLocal() as db:
            # Find the recipient by SES message ID
            mail_info = message.get("mail", {})
            message_id = mail_info.get("messageId")

            if message_id:
                result = await db.execute(
                    select(Recipient).where(Recipient.ses_message_id == message_id)
                )
                recipient = result.scalar_one_or_none()
                if recipient:
                    recipient.status = "bounced"
                    await db.execute(
                        update(Campaign)
                        .where(Campaign.id == recipient.campaign_id)
                        .values(bounced_count=Campaign.bounced_count + 1)
                    )

                    # Log event
                    event = TrackingEvent(
                        recipient_id=recipient.id,
                        campaign_id=recipient.campaign_id,
                        event_type="bounce",
                        metadata_json={
                            "bounce_type": bounce_type,
                            "diagnostic": recipient_info.get("diagnosticCode"),
                        },
                    )
                    db.add(event)

            # Add to suppression list for permanent bounces
            if bounce_type == "Permanent":
                existing = await db.execute(
                    select(SuppressionList).where(
                        SuppressionList.email == email,
                        SuppressionList.scope == "global",
                    )
                )
                if not existing.scalar_one_or_none():
                    from app.services.public_codes import generate_unique_public_code, PREFIXES
                    suppression = SuppressionList(
                        public_code=await generate_unique_public_code(db, SuppressionList, PREFIXES["suppression"]),
                        email=email,
                        scope="global",
                        reason="bounce",
                    )
                    db.add(suppression)

            await db.commit()
            logger.info(f"Processed bounce for {email} (type: {bounce_type})")


async def _handle_complaint(message: dict):
    """Process a complaint notification from SES."""
    complaint = message.get("complaint", {})

    for recipient_info in complaint.get("complainedRecipients", []):
        email = recipient_info.get("emailAddress", "").lower()
        if not email:
            continue

        async with AsyncSessionLocal() as db:
            # Add to suppression list
            existing = await db.execute(
                select(SuppressionList).where(
                    SuppressionList.email == email,
                    SuppressionList.scope == "global",
                )
            )
            if not existing.scalar_one_or_none():
                from app.services.public_codes import generate_unique_public_code, PREFIXES
                suppression = SuppressionList(
                    public_code=await generate_unique_public_code(db, SuppressionList, PREFIXES["suppression"]),
                    email=email,
                    scope="global",
                    reason="complaint",
                )
                db.add(suppression)

            # Find and update recipient
            mail_info = message.get("mail", {})
            message_id = mail_info.get("messageId")
            if message_id:
                result = await db.execute(
                    select(Recipient).where(Recipient.ses_message_id == message_id)
                )
                recipient = result.scalar_one_or_none()
                if recipient:
                    event = TrackingEvent(
                        recipient_id=recipient.id,
                        campaign_id=recipient.campaign_id,
                        event_type="complaint",
                        metadata_json={
                            "feedback_type": complaint.get("complaintFeedbackType"),
                        },
                    )
                    db.add(event)

            await db.commit()
            logger.info(f"Processed complaint for {email}")
