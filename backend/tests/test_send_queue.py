"""
End-to-end checks for SMTP sending and the send queue, against a real SMTP
server (aiosmtpd) running on localhost.
"""
import socket

import pytest
import pytest_asyncio
from aiosmtpd.controller import Controller
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.models.campaign import Campaign, Recipient
from app.models.user import User
from app.routers import tracking as tracking_router
from app.routers.campaigns import get_queue_counts
from app.services import queue_worker
from app.services.email_sender import SMTPEmailSender
from app.services.provider_config import (
    apply_provider_config, public_provider_config, tracking_active,
)


class RecordingHandler:
    """Accepts mail, except for addresses starting with 'bad' (550) or 'busy' (451)."""

    def __init__(self):
        self.messages = []

    async def handle_RCPT(self, server, session, envelope, address, rcpt_options):
        if address.startswith("bad"):
            return "550 5.1.1 No such user"
        if address.startswith("busy"):
            return "451 4.3.0 Try again later"
        envelope.rcpt_tos.append(address)
        return "250 OK"

    async def handle_DATA(self, server, session, envelope):
        self.messages.append(envelope)
        return "250 Message accepted"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def smtp_server():
    handler = RecordingHandler()
    controller = Controller(handler, hostname="127.0.0.1", port=_free_port())
    controller.start()
    yield handler, controller.port
    controller.stop()


@pytest.fixture
def smtp_settings(smtp_server):
    """Point the app at the local test server, restoring the settings afterwards."""
    _, port = smtp_server
    names = ("EMAIL_PROVIDER", "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD",
             "SMTP_USE_TLS", "TRACKING_BASE_URL", "TRACKING_ENABLED", "MAX_SEND_RATE")
    saved = {n: getattr(settings, n) for n in names}
    settings.EMAIL_PROVIDER = "smtp"
    settings.SMTP_HOST = "127.0.0.1"
    settings.SMTP_PORT = port
    settings.SMTP_USERNAME = None
    settings.SMTP_PASSWORD = None
    settings.SMTP_USE_TLS = False
    queue_worker.rate_limiter.update_rate(1000)
    queue_worker.rate_limiter.tokens = 2000
    yield
    for name, value in saved.items():
        setattr(settings, name, value)


@pytest_asyncio.fixture
async def sessions(monkeypatch):
    """An in-memory database shared by the test and the code under test."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        from app.models import (  # noqa: F401
            user, campaign, template, tracking, settings_model, suppression,
            sender_identity, asset, composer,
        )
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(queue_worker, "AsyncSessionLocal", maker)
    monkeypatch.setattr(tracking_router, "AsyncSessionLocal", maker)
    yield maker
    await engine.dispose()


async def _make_campaign(maker, emails, status="sending"):
    async with maker() as db:
        user = User(email="owner@example.com", full_name="Owner", hashed_password="x", role="admin")
        db.add(user)
        await db.commit()
        campaign = Campaign(
            name="Queue test", subject="Hello {{name}}", from_email="sender@example.com",
            from_name="Sender, Test", html_body='<p>Hi {{name}} <a href="https://example.com">link</a></p>',
            created_by=user.id, status=status, total_recipients=len(emails),
            sent_count=0, failed_count=0, opened_count=0, clicked_count=0,
        )
        db.add(campaign)
        await db.commit()
        db.add_all([
            Recipient(campaign_id=campaign.id, email=e, merge_data={"name": e.split("@")[0]},
                      row_index=i, status="pending", retry_count=0, is_included=True)
            for i, e in enumerate(emails)
        ])
        await db.commit()
        return campaign.id


async def _run_worker_until_idle(maker, campaign_id, rounds=5):
    for _ in range(rounds):
        await queue_worker._process_campaigns()
        async with maker() as db:
            campaign = await db.get(Campaign, campaign_id)
            if campaign.status != "sending":
                return


async def _load(maker, campaign_id):
    async with maker() as db:
        campaign = await db.get(Campaign, campaign_id)
        rows = (await db.execute(
            select(Recipient).where(Recipient.campaign_id == campaign_id).order_by(Recipient.row_index)
        )).scalars().all()
        counts = await get_queue_counts(db, campaign_id)
        return campaign, rows, counts


@pytest.mark.asyncio
async def test_campaign_sends_over_smtp(sessions, smtp_server, smtp_settings):
    handler, _ = smtp_server
    campaign_id = await _make_campaign(sessions, ["a@example.com", "b@example.com", "c@example.com"])

    await _run_worker_until_idle(sessions, campaign_id)

    campaign, rows, counts = await _load(sessions, campaign_id)
    assert campaign.status == "completed"
    assert campaign.sent_count == 3
    assert campaign.started_at is not None and campaign.completed_at is not None
    assert [r.status for r in rows] == ["sent", "sent", "sent"]
    assert all(r.sent_at and r.ses_message_id for r in rows)
    assert counts["sent"] == 3 and counts["queued"] == 0

    assert len(handler.messages) == 3
    raw = handler.messages[0].content.decode()
    assert "Date: " in raw and "Message-ID: " in raw
    assert 'From: "Sender, Test" <sender@example.com>' in raw
    assert "Subject: Hello a" in raw


@pytest.mark.asyncio
async def test_local_tracking_url_leaves_links_untouched(sessions, smtp_server, smtp_settings):
    handler, _ = smtp_server
    settings.TRACKING_BASE_URL = "http://localhost:8000"
    settings.TRACKING_ENABLED = None
    assert tracking_active() is False

    campaign_id = await _make_campaign(sessions, ["a@example.com"])
    await _run_worker_until_idle(sessions, campaign_id)

    raw = handler.messages[0].content.decode()
    assert "localhost" not in raw
    assert "List-Unsubscribe" not in raw


@pytest.mark.asyncio
async def test_public_tracking_url_adds_tracking(sessions, smtp_server, smtp_settings):
    handler, _ = smtp_server
    settings.TRACKING_BASE_URL = "https://mail.example.org"
    settings.TRACKING_ENABLED = None
    assert tracking_active() is True

    campaign_id = await _make_campaign(sessions, ["a@example.com"])
    await _run_worker_until_idle(sessions, campaign_id)

    import email
    message = email.message_from_bytes(handler.messages[0].content)
    body = message.get_payload()[0].get_payload(decode=True).decode()
    assert "https://mail.example.org/track/click/" in body
    assert "https://mail.example.org/track/open/" in body
    assert "mail.example.org/unsubscribe/" in message["List-Unsubscribe"]


def test_uploaded_images_are_embedded_when_the_server_is_not_public(tmp_path, monkeypatch):
    import email
    from app.services import inline_images
    from app.services.email_sender import _build_mime_message

    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "logo.png").write_bytes(b"\x89PNG fake image bytes")
    (tmp_path / "secret.txt").write_text("outside uploads")
    monkeypatch.setattr(inline_images, "UPLOADS_ROOT", str(tmp_path / "assets"))
    monkeypatch.setattr(settings, "TRACKING_BASE_URL", "http://localhost:8000")

    html = (
        '<p>Hi</p><img src="http://localhost:5173/uploads/logo.png" alt="Logo">'
        '<img src="https://cdn.example.com/banner.png">'
        '<img src="http://localhost:5173/uploads/../secret.txt">'
    )
    result, images = inline_images.localize_images(html)

    assert len(images) == 1 and images[0]["content_type"] == "image/png"
    assert f'src="cid:{images[0]["content_id"]}"' in result
    assert "https://cdn.example.com/banner.png" in result  # other sites are left alone
    assert "../secret.txt" in result                        # nothing outside uploads is read

    message = _build_mime_message(
        to_email="a@example.com", subject="Hi", html_body=result,
        from_email="s@example.com", attachments=images,
    )
    parsed = email.message_from_string(message.as_string())
    related = parsed.get_payload()[0]
    assert related.get_content_type() == "multipart/related"
    image = related.get_payload()[1]
    assert image.get_content_type() == "image/png"
    assert image["Content-ID"] == f'<{images[0]["content_id"]}>'
    assert image.get_payload(decode=True) == b"\x89PNG fake image bytes"

    # With a public address the image is linked instead of embedded
    monkeypatch.setattr(settings, "TRACKING_BASE_URL", "https://mail.example.org")
    result, images = inline_images.localize_images(html)
    assert images == []
    assert 'src="https://mail.example.org/uploads/logo.png"' in result


@pytest.mark.asyncio
async def test_rejected_address_fails_without_stopping_the_rest(sessions, smtp_server, smtp_settings):
    campaign_id = await _make_campaign(sessions, ["a@example.com", "bad@example.com", "c@example.com"])

    await _run_worker_until_idle(sessions, campaign_id)

    campaign, rows, counts = await _load(sessions, campaign_id)
    assert [r.status for r in rows] == ["sent", "failed", "sent"]
    assert "550" in rows[1].error_message
    assert campaign.status == "completed"
    assert (campaign.sent_count, campaign.failed_count) == (2, 1)
    assert counts["failed"] == 1 and counts["processed"] == 3


@pytest.mark.asyncio
async def test_temporary_failure_waits_in_the_queue(sessions, smtp_server, smtp_settings):
    campaign_id = await _make_campaign(sessions, ["busy@example.com", "a@example.com"])

    await _run_worker_until_idle(sessions, campaign_id, rounds=2)

    campaign, rows, counts = await _load(sessions, campaign_id)
    assert rows[0].status == "pending"
    assert rows[0].retry_count == 1
    assert rows[0].next_attempt_at is not None
    assert "451" in rows[0].error_message
    assert rows[1].status == "sent"
    # Still sending: the campaign must not complete while a retry is waiting
    assert campaign.status == "sending"
    assert counts["pending"] == 1 and counts["retry_waiting"] == 1


@pytest.mark.asyncio
async def test_unreachable_server_pauses_and_keeps_the_queue(sessions, smtp_server, smtp_settings):
    settings.SMTP_PORT = _free_port()  # nothing listens here
    campaign_id = await _make_campaign(sessions, ["a@example.com", "b@example.com"])

    await _run_worker_until_idle(sessions, campaign_id)

    campaign, rows, counts = await _load(sessions, campaign_id)
    assert campaign.status == "paused"
    assert campaign.last_error and "Mail server problem" in campaign.last_error
    assert [r.status for r in rows] == ["pending", "pending"]
    assert all(r.retry_count == 0 for r in rows)
    assert counts["pending"] == 2


@pytest.mark.asyncio
async def test_missing_smtp_host_pauses_with_a_clear_message(sessions, smtp_server, smtp_settings):
    settings.SMTP_HOST = None
    campaign_id = await _make_campaign(sessions, ["a@example.com"])

    await _run_worker_until_idle(sessions, campaign_id)

    campaign, rows, _ = await _load(sessions, campaign_id)
    assert campaign.status == "paused"
    assert "no SMTP host" in campaign.last_error
    assert rows[0].status == "pending"


@pytest.mark.asyncio
async def test_interrupted_sends_are_requeued(sessions, smtp_server, smtp_settings):
    campaign_id = await _make_campaign(sessions, ["a@example.com", "b@example.com"])
    async with sessions() as db:
        row = (await db.execute(select(Recipient).limit(1))).scalar_one()
        row.status = "sending"
        await db.commit()

    assert await queue_worker.recover_interrupted_sends() == 1
    await _run_worker_until_idle(sessions, campaign_id)

    campaign, rows, _ = await _load(sessions, campaign_id)
    assert campaign.status == "completed"
    assert [r.status for r in rows] == ["sent", "sent"]


@pytest.mark.asyncio
async def test_smtp_connection_is_reused(smtp_server, smtp_settings):
    handler, _ = smtp_server
    sender = SMTPEmailSender()
    try:
        for address in ("a@example.com", "b@example.com"):
            result = await sender.send_email(
                to_email=address, subject="Hi", html_body="<p>Hi</p>", from_email="s@example.com",
            )
            assert result["success"], result
            client = sender._client
        assert sender._client is client and client.is_connected
    finally:
        await sender.close()
    assert len(handler.messages) == 2


@pytest.mark.asyncio
async def test_opens_and_clicks_are_counted_once_per_recipient(sessions):
    campaign_id = await _make_campaign(sessions, ["a@example.com"], status="completed")
    async with sessions() as db:
        recipient_id = (await db.execute(select(Recipient.id))).scalar_one()

    class FakeRequest:
        headers = {"user-agent": "test"}
        client = None

    for _ in range(3):
        await tracking_router.track_open(recipient_id, FakeRequest())
        await tracking_router.track_click(recipient_id, "https://example.com", request=FakeRequest())

    campaign, _, _ = await _load(sessions, campaign_id)
    assert campaign.opened_count == 1
    assert campaign.clicked_count == 1


def test_provider_config_hides_secrets_and_applies_smtp():
    names = ("EMAIL_PROVIDER", "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_USE_TLS")
    saved = {n: getattr(settings, n) for n in names}
    try:
        config = {
            "provider": "smtp", "smtp_host": "smtp.example.com", "smtp_port": 465,
            "smtp_username": "user", "smtp_password": "hunter2", "smtp_use_tls": True,
        }
        apply_provider_config(config)
        assert settings.EMAIL_PROVIDER == "smtp"
        assert (settings.SMTP_HOST, settings.SMTP_PORT) == ("smtp.example.com", 465)
        assert (settings.SMTP_USERNAME, settings.SMTP_PASSWORD) == ("user", "hunter2")

        view = public_provider_config(config)
        assert "smtp_password" not in view and "hunter2" not in str(view)
        assert view["smtp_password_set"] is True

        # Port 465 is TLS from the start; 587 upgrades with STARTTLS
        assert SMTPEmailSender()._new_client().use_tls is True
        assert SMTPEmailSender(port=587)._new_client().use_tls is False
    finally:
        for name, value in saved.items():
            setattr(settings, name, value)
