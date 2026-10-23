"""Best-effort TextBee SMS via the office's registered Android phone.

API acceptance is not handset delivery. Network work runs off the queue request;
timeouts are not retried automatically because the phone might already be sending.
"""
import json
import logging
import re
import threading
import urllib.error
import urllib.request
from typing import Optional

import config

logger = logging.getLogger("myturn.sms")
TEXTBEE_SEND_URL = "https://api.textbee.dev/api/v1/gateway/send-sms"


def _normalise_phone(contact: str) -> Optional[str]:
    """Return E.164, defaulting local numbers to the configured country code."""
    text = str(contact or "").strip()
    if not re.fullmatch(r"\+?[0-9 ()-]+", text):
        return None
    digits = re.sub(r"\D", "", text)
    country = config.SMS_COUNTRY_CODE.strip().lstrip("+")
    if text.startswith("+"):
        pass
    elif digits.startswith("00"):
        digits = digits[2:]
    elif not digits.startswith(country):
        digits = country + digits.lstrip("0")
    if not re.fullmatch(r"[1-9][0-9]{7,14}", digits):
        return None
    return "+" + digits


def _post(payload: dict) -> None:
    request = urllib.request.Request(TEXTBEE_SEND_URL,
        data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"x-api-key": config.TEXTBEE_API_KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.loads(response.read())
        data = result.get("data", {})
        if not isinstance(data, dict) or data.get("success") is not True:
            logger.warning("TextBee did not confirm queue acceptance")
            return
        # Batch ID enables tracing in the TextBee dashboard, not proof of delivery.
        logger.info("TextBee accepted SMS; batch=%s; delivery not yet confirmed", data.get("smsBatchId", "unavailable"))
    except urllib.error.HTTPError as exc:
        logger.warning("TextBee rejected SMS (HTTP %s)", exc.code)
    except Exception as exc:
        # Do not log provider bodies, credentials or recipient numbers.
        logger.warning("TextBee SMS attempt failed (%s)", type(exc).__name__)


def send_sms(to: str, message: str, *, idempotency_key: Optional[str] = None) -> bool:
    """Start a local send worker, not a delivery guarantee.

    idempotency_key is retained for older callers; TextBee's documented endpoint
    does not promise this header, so it must not be presented as deduplication.
    """
    phone = _normalise_phone(to)
    if not phone:
        return False
    if not config.TEXTBEE_API_KEY:
        logger.warning("SMS not sent: configure MYTURN_TEXTBEE_API_KEY")
        return False
    payload = {"recipients": [phone], "message": message}
    if config.TEXTBEE_DEVICE_ID:
        payload["deviceId"] = config.TEXTBEE_DEVICE_ID
    try:
        threading.Thread(target=_post, args=(payload,), daemon=True).start()
        return True
    except RuntimeError:
        logger.warning("SMS worker could not be started")
        return False


def notify_called(ticket_label: str, desk_name: str, contact: Optional[str]) -> None:
    """Compatibility entry point; new code imports notifications.notify_called."""
    from notifications import notify_called as notify
    notify(ticket_label, desk_name, contact)
