"""Dispatch a committed ticket call to the visitor's chosen contact channel."""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
import threading
from typing import Optional

import config
from email_notifications import send_email
from sms import send_sms

logger = logging.getLogger("myturn.notifications")
_sink_lock = threading.Lock()


def _masked(contact: str) -> str:
    """Enough of the recipient to recognise the line, not enough to reuse it."""
    text = (contact or "").strip()
    if "@" in text:
        local, _, domain = text.partition("@")
        return "%s***@%s" % (local[:1] or "*", domain)
    digits = "".join(ch for ch in text if ch.isdigit())
    return "***" + digits[-3:] if len(digits) >= 3 else "***"


def _configured(channel: str) -> bool:
    if channel == "email":
        return bool(config.SMTP_HOST and config.SMTP_FROM)
    return bool(config.OPENSMS_API_KEY)


def record_development_call(ticket_label: str, desk_name: str, contact: str,
                            message: str, channel: str) -> None:
    """Write down what would have been sent when no provider is configured.

    This is a demonstration aid, not a transport: the record says so in its own
    `delivered` and `note` fields, so a log line can never be mistaken for a
    message that reached a visitor.
    """
    entry = {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "channel": channel,
        "ticket": ticket_label,
        "desk": desk_name,
        "recipient": _masked(contact),
        "message": message,
        "delivered": False,
        "note": "development record: no provider configured, nothing was sent",
    }
    try:
        path = Path(config.NOTIFY_SINK_FILE)
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(entry, ensure_ascii=False)
        with _sink_lock, path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
        logger.info("Visitor %s record written for %s; nothing was sent", channel, ticket_label)
    except OSError as exc:
        logger.warning("Development notification record failed (%s)", type(exc).__name__)


def notify_called(ticket_label: str, desk_name: str, contact: Optional[str]) -> None:
    if not contact:
        return
    channel = "email" if "@" in (contact or "") else "sms"
    message = f"MyTurn: your ticket {ticket_label} has been called. Please go to {desk_name}."
    sent = False
    try:
        if channel == "email":
            sent = send_email(contact.strip(),
                              f"MyTurn: ticket {ticket_label} is being called", message)
        else:
            sent = send_sms(contact, message)
    except Exception as exc:
        # The call is already committed: notification failure must never turn
        # it into an HTTP error that encourages staff to call twice.
        logger.warning("Visitor notification failed (%s)", type(exc).__name__)
    if not sent and config.NOTIFY_DEV_SINK and not _configured(channel):
        record_development_call(ticket_label, desk_name, contact, message, channel)
