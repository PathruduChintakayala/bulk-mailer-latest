"""
Read a bounce message (delivery status notification) out of a mailbox message.

Mail servers report an undeliverable email by sending a message back to the
sender. Most follow RFC 3464 (multipart/report with a message/delivery-status
part); a few only set headers such as X-Failed-Recipients. Both are handled.
"""
import email
import re
from dataclasses import dataclass, field
from email import policy
from email.message import Message
from email.utils import parseaddr, parsedate_to_datetime
from datetime import datetime
from typing import Optional

_BOUNCE_SENDERS = ("mailer-daemon", "postmaster", "mail delivery")
_BOUNCE_SUBJECTS = (
    "delivery status notification", "undeliverable", "undelivered", "returned mail",
    "failure notice", "delivery failure", "mail delivery failed", "delivery has failed",
    "could not be delivered", "address not found",
)
_ADDRESS = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


@dataclass
class Bounce:
    recipients: list[str] = field(default_factory=list)  # addresses that failed, lowercase
    message_id: Optional[str] = None                      # Message-ID of the email we sent
    permanent: bool = True                                # False: temporary, the server keeps trying
    status: Optional[str] = None                          # e.g. 5.1.1
    diagnostic: Optional[str] = None
    received_at: Optional[datetime] = None


def _address(value: str) -> Optional[str]:
    """'rfc822; someone@example.com' or 'Name <someone@example.com>' -> the address."""
    if not value:
        return None
    value = value.split(";", 1)[-1].strip()
    found = parseaddr(value)[1] or ""
    if "@" not in found:
        match = _ADDRESS.search(value)
        found = match.group(0) if match else ""
    return found.lower() or None


def _header_blocks(part: Message) -> list[Message]:
    """The per-message and per-recipient header groups of a delivery-status part."""
    payload = part.get_payload()
    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, Message)]
    if isinstance(payload, str):
        return [email.message_from_string(block) for block in re.split(r"\r?\n\s*\r?\n", payload) if block.strip()]
    return []


def _original_headers(part: Message) -> Optional[Message]:
    """Headers of the email that bounced, from a message/rfc822 or text/rfc822-headers part."""
    ctype = part.get_content_type()
    if ctype == "message/rfc822":
        payload = part.get_payload()
        if isinstance(payload, list) and payload and isinstance(payload[0], Message):
            return payload[0]
    if ctype == "text/rfc822-headers":
        try:
            text = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
        except Exception:
            return None
        return email.message_from_string(text)
    return None


def parse_bounce(raw: bytes) -> Optional[Bounce]:
    """The bounce described by this message, or None when it is not a bounce."""
    try:
        message = email.message_from_bytes(raw, policy=policy.compat32)
    except Exception:
        return None

    sender = (message.get("From") or "").lower()
    subject = (message.get("Subject") or "").lower()
    is_report = (
        message.get_content_type() == "multipart/report"
        and (message.get_param("report-type") or "").lower() == "delivery-status"
    )
    looks_like_bounce = (
        any(s in sender for s in _BOUNCE_SENDERS) or any(s in subject for s in _BOUNCE_SUBJECTS)
    )
    failed_header = message.get("X-Failed-Recipients")
    if not (is_report or failed_header or looks_like_bounce):
        return None

    bounce = Bounce()
    try:
        bounce.received_at = parsedate_to_datetime(message.get("Date"))
    except Exception:
        bounce.received_at = None

    actions: list[str] = []
    found_status_part = False
    for part in message.walk():
        ctype = part.get_content_type()
        if ctype == "message/delivery-status":
            found_status_part = True
            for block in _header_blocks(part):
                recipient = _address(block.get("Final-Recipient") or "") or _address(block.get("Original-Recipient") or "")
                if not recipient:
                    continue
                if recipient not in bounce.recipients:
                    bounce.recipients.append(recipient)
                if block.get("Action"):
                    actions.append(block.get("Action").strip().lower())
                if block.get("Status") and not bounce.status:
                    bounce.status = block.get("Status").strip()
                if block.get("Diagnostic-Code") and not bounce.diagnostic:
                    diagnostic = block.get("Diagnostic-Code").split(";", 1)[-1]
                    bounce.diagnostic = " ".join(diagnostic.split())[:500]
        else:
            original = _original_headers(part)
            if original is not None and not bounce.message_id and original.get("Message-ID"):
                bounce.message_id = original.get("Message-ID").strip()

    if failed_header:
        for piece in failed_header.split(","):
            recipient = _address(piece)
            if recipient and recipient not in bounce.recipients:
                bounce.recipients.append(recipient)

    if not bounce.recipients and not bounce.message_id:
        return None
    # Without a status part there is nothing to tell a real failure from a
    # "still trying" notice except the sender, so require that it looks like one.
    if not found_status_part and not failed_header and not looks_like_bounce:
        return None

    status_class = (bounce.status or "")[:1]
    if actions and all(a in ("delayed", "delivered", "relayed", "expanded") for a in actions):
        bounce.permanent = False
    elif status_class == "4" and "failed" not in actions:
        bounce.permanent = False
    elif status_class == "2":
        return None  # a success report, not a bounce

    if not bounce.diagnostic:
        bounce.diagnostic = (message.get("Subject") or "Message could not be delivered")[:500]
    return bounce
