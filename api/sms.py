"""SMS notifications via openSMS.dev.

A visitor may leave a phone number when taking a ticket. When their number is
called, the desk can reach them by hand from the contact link on the dashboard;
this module also sends an automatic SMS so a visitor who stepped away (or who
has no phone screen in front of them) is still told to come to the counter.

The send is best-effort and never blocks the desk: it runs in a background
thread, and any failure (no key configured, bad number, network down) is
logged and swallowed. A queueing system must not stop serving because a text
message could not be delivered.
"""
import json
import logging
import os
import re
import threading
import urllib.error
import urllib.request
from typing import Optional

import config

logger = logging.getLogger("myturn.sms")

# openSMS.dev: POST https://opensms.io/api/v1/messages
#   Authorization: Bearer <api key>
#   Idempotency-Key: <unique key>
#   Body: { "to": "+E.164", "text": "..." }
OPENSMS_API_URL = os.environ.get("MYTURN_OPENSMS_API_URL", "https://opensms.io")
OPENSMS_API_KEY = os.environ.get("MYTURN_OPENSMS_API_KEY", "")
# Country code used to turn a local number into E.164. Rwanda by default.
SMS_COUNTRY_CODE = getattr(config, "OPENSMS_COUNTRY_CODE", "250")


def _normalise_phone(contact: str) -> Optional[str]:
    """Return an E.164 number, or None when the contact is not a phone."""
    text = " ".join(str(contact or "").split())
    if not text or "@" in text:
        return None
    digits = re.sub(r"[^0-9]", "", text)
    if not (7 <= len(digits) <= 15):
        return None
    if text.strip().startswith("+"):
        return "+" + digits
    return "+" + SMS_COUNTRY_CODE + digits.lstrip("0")


def _post(url: str, payload: dict, key: str) -> None:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")
    req.add_header("Idempotency-Key", payload.get("idempotency_key", ""))
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            logger.info("sms sent: %s", response.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        logger.warning("sms rejected (%s): %s", exc.code, exc.read().decode("utf-8", "replace"))
    except Exception as exc:  # network, timeout, dns, ...
        logger.warning("sms failed: %s", exc)


def send_sms(to: str, message: str, *, idempotency_key: Optional[str] = None) -> None:
    """Queue an SMS through openSMS.dev. Never raises."""
    phone = _normalise_phone(to)
    if not phone:
        return
    if not OPENSMS_API_KEY:
        logger.debug("OPENSMS_API_KEY not set; skipping SMS to %s", phone)
        return
    url = OPENSMS_API_URL.rstrip("/") + "/api/v1/messages"
    payload = {"to": phone, "text": message}
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key
    threading.Thread(target=_post, args=(url, payload, OPENSMS_API_KEY), daemon=True).start()


def notify_called(ticket_label: str, desk_name: str, contact: Optional[str]) -> None:
    """Tell a visitor their number has been called, by SMS when possible."""
    if not contact:
        return
    message = "MyTurn: your ticket %s has been called. Please proceed to %s." % (ticket_label, desk_name)
    send_sms(contact, message, idempotency_key="call-%s" % ticket_label)