"""Bounce detection: reading bounce messages and marking recipients."""
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.models.campaign import Campaign, Recipient
from app.models.suppression import SuppressionList
from app.models.tracking import TrackingEvent
from app.models.user import User
from app.services import bounce_worker
from app.services.bounce_parser import parse_bounce

SENT_ID = "<179048916625.2436.10535090981505134515@gmail.com>"


def gmail_bounce(message_id=SENT_ID, recipient="nobody.here.12345@gmail.com", action="failed", status="5.1.1"):
    """A delivery status notification shaped like the ones Gmail sends."""
    return f"""\
Return-Path: <>
From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: sender@gmail.com
Subject: Delivery Status Notification (Failure)
Date: Sun, 27 Sep 2026 06:06:20 +0000
Content-Type: multipart/report; boundary="000000000000abc"; report-type=delivery-status

--000000000000abc
Content-Type: text/plain; charset="UTF-8"

** Address not found **

Your message wasn't delivered to {recipient} because the address couldn't be found.

--000000000000abc
Content-Type: message/delivery-status

Reporting-MTA: dns; googlemail.com
Arrival-Date: Sun, 27 Sep 2026 06:06:18 +0000

Final-Recipient: rfc822; {recipient}
Action: {action}
Status: {status}
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.
 Please try double-checking the recipient's email address.

--000000000000abc
Content-Type: message/rfc822

From: Sender <sender@gmail.com>
To: {recipient}
Subject: Hello
Message-ID: {message_id}
Date: Sun, 27 Sep 2026 06:06:11 +0000

Body of the original message.

--000000000000abc--
""".replace("\n", "\r\n").encode()


def test_reads_a_standard_bounce():
    bounce = parse_bounce(gmail_bounce())
    assert bounce is not None
    assert bounce.recipients == ["nobody.here.12345@gmail.com"]
    assert bounce.message_id == SENT_ID
    assert bounce.permanent is True
    assert bounce.status == "5.1.1"
    assert "does not exist" in bounce.diagnostic
    assert "double-checking" in bounce.diagnostic  # folded header lines are joined


def test_delay_notice_is_not_a_permanent_bounce():
    bounce = parse_bounce(gmail_bounce(action="delayed", status="4.4.1"))
    assert bounce is not None and bounce.permanent is False


def test_header_only_bounce():
    raw = (
        b"From: Mail Delivery System <MAILER-DAEMON@mx.example.net>\r\n"
        b"Subject: Mail delivery failed: returning message to sender\r\n"
        b"X-Failed-Recipients: Gone@Example.com\r\n"
        b"Date: Sun, 27 Sep 2026 06:06:20 +0000\r\n"
        b"Content-Type: text/plain\r\n\r\n"
        b"A message that you sent could not be delivered.\r\n"
    )
    bounce = parse_bounce(raw)
    assert bounce is not None
    assert bounce.recipients == ["gone@example.com"]
    assert bounce.message_id is None and bounce.permanent is True


def test_ordinary_mail_is_ignored():
    raw = (
        b"From: A Friend <friend@example.com>\r\n"
        b"Subject: Lunch on Friday?\r\n"
        b"Content-Type: text/plain\r\n\r\n"
        b"My old address bounced, write to friend@example.com instead.\r\n"
    )
    assert parse_bounce(raw) is None
    assert parse_bounce(b"") is None


@pytest_asyncio.fixture
async def sessions(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        from app.models import (  # noqa: F401
            user, campaign, template, tracking, settings_model, suppression,
            sender_identity, asset, composer,
        )
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(bounce_worker, "AsyncSessionLocal", maker)
    for name, value in {
        "IMAP_ENABLED": True, "IMAP_HOST": None, "IMAP_USERNAME": None, "IMAP_PASSWORD": None,
        "IMAP_FOLDER": "INBOX", "SMTP_HOST": "smtp.gmail.com", "SMTP_USERNAME": "sender@gmail.com",
        "SMTP_PASSWORD": "app-password",
    }.items():
        monkeypatch.setattr(settings, name, value)
    yield maker
    await engine.dispose()


async def _sent_campaign(maker):
    async with maker() as db:
        user = User(email="owner@example.com", full_name="Owner", hashed_password="x", role="admin")
        db.add(user)
        await db.commit()
        campaign = Campaign(
            name="Bounce test", subject="Hello", from_email="sender@gmail.com", html_body="<p>Hi</p>",
            created_by=user.id, status="completed", total_recipients=2, sent_count=2, bounced_count=0,
        )
        db.add(campaign)
        await db.commit()
        now = datetime.now(timezone.utc)
        db.add_all([
            Recipient(campaign_id=campaign.id, email="nobody.here.12345@gmail.com", status="sent",
                      sent_at=now, ses_message_id=SENT_ID, row_index=0, is_included=True),
            Recipient(campaign_id=campaign.id, email="real.person@gmail.com", status="sent",
                      sent_at=now, ses_message_id="<other@gmail.com>", row_index=1, is_included=True),
        ])
        await db.commit()
        return campaign.id


def fake_mailbox(messages, calls):
    def fetch(cfg, state):
        calls.append({"cfg": cfg, "state": dict(state)})
        return {"messages": list(enumerate(messages, start=100)), "uidvalidity": "7", "last_uid": 150, "truncated": False}
    return fetch


def test_mailbox_follows_the_smtp_settings(sessions):
    cfg = bounce_worker.mailbox_settings()
    assert cfg["host"] == "imap.gmail.com" and cfg["port"] == 993
    assert (cfg["username"], cfg["password"]) == ("sender@gmail.com", "app-password")
    assert bounce_worker.mailbox_problem(cfg) is None


@pytest.mark.asyncio
async def test_bounce_marks_only_the_failed_recipient(sessions):
    campaign_id = await _sent_campaign(sessions)
    calls = []
    ordinary = b"From: friend@example.com\r\nSubject: Hi\r\n\r\nHello\r\n"

    summary = await bounce_worker.check_mailbox(fetch=fake_mailbox([gmail_bounce(), ordinary], calls))

    assert summary["success"] and summary["messages_read"] == 2
    assert (summary["bounces_found"], summary["recipients_marked"]) == (1, 1)

    async with sessions() as db:
        rows = (await db.execute(select(Recipient).order_by(Recipient.row_index))).scalars().all()
        campaign = await db.get(Campaign, campaign_id)
        events = (await db.execute(select(TrackingEvent))).scalars().all()
        suppressed = (await db.execute(select(SuppressionList.email))).scalars().all()

    assert [r.status for r in rows] == ["bounced", "sent"]
    assert "does not exist" in rows[0].error_message
    assert campaign.bounced_count == 1 and campaign.sent_count == 2
    assert [e.event_type for e in events] == ["bounce"]
    assert suppressed == ["nobody.here.12345@gmail.com"]

    # The same bounce seen again changes nothing, and the next check resumes after it
    summary = await bounce_worker.check_mailbox(fetch=fake_mailbox([gmail_bounce()], calls))
    assert summary["recipients_marked"] == 0
    assert calls[1]["state"]["last_uid"] == 150
    async with sessions() as db:
        assert (await db.get(Campaign, campaign_id)).bounced_count == 1


@pytest.mark.asyncio
async def test_bounce_without_message_id_matches_by_address(sessions):
    await _sent_campaign(sessions)
    raw = gmail_bounce(message_id="<rewritten-by-server@mail.gmail.com>", recipient="Real.Person@gmail.com")

    summary = await bounce_worker.check_mailbox(fetch=fake_mailbox([raw], []))

    assert summary["recipients_marked"] == 1
    async with sessions() as db:
        rows = (await db.execute(select(Recipient).order_by(Recipient.row_index))).scalars().all()
    assert [r.status for r in rows] == ["sent", "bounced"]


@pytest.mark.asyncio
async def test_temporary_delay_and_unknown_address_mark_nobody(sessions):
    await _sent_campaign(sessions)
    messages = [
        gmail_bounce(action="delayed", status="4.4.1"),
        gmail_bounce(message_id="<unknown@x>", recipient="stranger@elsewhere.org"),
    ]
    summary = await bounce_worker.check_mailbox(fetch=fake_mailbox(messages, []))

    assert summary["temporary"] == 1 and summary["recipients_marked"] == 0
    async with sessions() as db:
        rows = (await db.execute(select(Recipient))).scalars().all()
    assert all(r.status == "sent" for r in rows)


@pytest.mark.asyncio
async def test_login_failure_is_reported_not_raised(sessions):
    import imaplib

    def failing(cfg, state):
        raise imaplib.IMAP4.error(b"[AUTHENTICATIONFAILED] Invalid credentials (Failure)")

    summary = await bounce_worker.check_mailbox(fetch=failing)

    assert summary["success"] is False
    assert "app password" in summary["error"]
    async with sessions() as db:
        state = await bounce_worker.read_state(db)
    assert "rejected the login" in state["last_error"]
