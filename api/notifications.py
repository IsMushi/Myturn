"""Dispatch a committed ticket call to the visitor's chosen contact channel."""
import logging
from typing import Optional

from email_notifications import send_email
from sms import send_sms

logger = logging.getLogger("myturn.notifications")


def notify_called(ticket_label: str, desk_name: str, contact: Optional[str]) -> None:
    if not contact:
        return
    message = f"MyTurn: your ticket {ticket_label} has been called. Please go to {desk_name}."
    try:
        if "@" in contact:
            send_email(contact.strip(), f"MyTurn: ticket {ticket_label} is being called", message)
        else:
            send_sms(contact, message)
    except Exception as exc:
        # The call is already committed: notification failure must never turn
        # it into an HTTP error that encourages staff to call twice.
        logger.warning("Visitor notification failed (%s)", type(exc).__name__)
