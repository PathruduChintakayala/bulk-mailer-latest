import asyncio
import logging
import os
import glob
import json
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete
from app.database import AsyncSessionLocal
from app.models.campaign import Campaign, Recipient, UploadJob
from app.models.tracking import TrackingEvent
from app.models.settings_model import AppSettings

logger = logging.getLogger(__name__)

_shutdown_event = asyncio.Event()

UPLOAD_DIR = "./uploads"


async def start_retention_worker():
    """Background worker that enforces data retention policies. Runs once per hour."""
    logger.info("Data retention worker started")

    while not _shutdown_event.is_set():
        try:
            await _run_retention_cycle()
        except Exception as e:
            logger.error(f"Retention worker error: {e}")

        # Poll every hour
        try:
            await asyncio.wait_for(_shutdown_event.wait(), timeout=3600.0)
            break
        except asyncio.TimeoutError:
            pass


async def stop_retention_worker():
    """Signal the retention worker to stop."""
    _shutdown_event.set()
    logger.info("Retention worker stopping...")


async def _run_retention_cycle():
    """Execute one retention cleanup cycle."""
    async with AsyncSessionLocal() as db:
        # Load retention config
        result = await db.execute(select(AppSettings).where(AppSettings.key == "data_retention"))
        setting = result.scalar_one_or_none()
        if not setting or not setting.value:
            return  # No config yet

        config = json.loads(setting.value)
        if not config.get("enabled", False):
            return  # Retention disabled

        now = datetime.now(timezone.utc)
        total_deleted = {}

        # 1. Tracking events retention
        tracking_days = config.get("tracking_retention_days")
        if tracking_days:
            cutoff = now - timedelta(days=tracking_days)
            result = await db.execute(
                delete(TrackingEvent).where(TrackingEvent.created_at < cutoff)
            )
            count = result.rowcount
            if count:
                total_deleted["tracking_events"] = count
                logger.info(f"Retention: deleted {count} tracking events older than {tracking_days} days")

        # 2. Standalone recipient retention (PII cleanup for campaigns still kept)
        recipient_days = config.get("recipient_retention_days")
        if recipient_days:
            cutoff = now - timedelta(days=recipient_days)
            result = await db.execute(
                delete(Recipient).where(
                    Recipient.sent_at.isnot(None),
                    Recipient.sent_at < cutoff,
                )
            )
            count = result.rowcount
            if count:
                total_deleted["recipients"] = count
                logger.info(f"Retention: deleted {count} recipients older than {recipient_days} days")

        # 3. Upload jobs retention + disk files
        upload_days = config.get("upload_retention_days")
        if upload_days:
            cutoff = now - timedelta(days=upload_days)
            # Find jobs to delete first (for file cleanup)
            old_jobs = await db.execute(
                select(UploadJob).where(UploadJob.created_at < cutoff)
            )
            jobs = old_jobs.scalars().all()
            for job in jobs:
                # Clean up disk files
                pattern = os.path.join(UPLOAD_DIR, f"campaign_{job.campaign_id}_*")
                for f in glob.glob(pattern):
                    try:
                        os.remove(f)
                    except OSError:
                        pass

            result = await db.execute(
                delete(UploadJob).where(UploadJob.created_at < cutoff)
            )
            count = result.rowcount
            if count:
                total_deleted["upload_jobs"] = count
                logger.info(f"Retention: deleted {count} upload jobs older than {upload_days} days")

        # 4. Campaign retention (includes cascade to recipients/tracking/attachments)
        campaign_days = config.get("campaign_retention_days")
        if campaign_days:
            cutoff = now - timedelta(days=campaign_days)
            delete_recipients = config.get("campaign_delete_recipients", True)

            # Find old completed/failed campaigns
            old_campaigns = await db.execute(
                select(Campaign).where(
                    Campaign.status.in_(["completed", "failed"]),
                    Campaign.completed_at.isnot(None),
                    Campaign.completed_at < cutoff,
                )
            )
            campaigns = old_campaigns.scalars().all()

            for campaign in campaigns:
                campaign_id = campaign.id

                if delete_recipients:
                    # Cascade handles this, but let's also clean tracking explicitly
                    await db.execute(
                        delete(TrackingEvent).where(TrackingEvent.campaign_id == campaign_id)
                    )
                    await db.execute(
                        delete(Recipient).where(Recipient.campaign_id == campaign_id)
                    )

                # Clean upload files
                pattern = os.path.join(UPLOAD_DIR, f"campaign_{campaign_id}_*")
                for f in glob.glob(pattern):
                    try:
                        os.remove(f)
                    except OSError:
                        pass

                await db.delete(campaign)

            count = len(campaigns)
            if count:
                total_deleted["campaigns"] = count
                logger.info(f"Retention: deleted {count} campaigns older than {campaign_days} days")

        await db.commit()

        if total_deleted:
            logger.info(f"Retention cycle complete: {total_deleted}")
