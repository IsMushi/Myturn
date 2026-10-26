"""Best-effort OpenSMS SMS through the office's paired Android gateway.

The API queues a job; a phone signed in to the OpenSMS gateway app claims it and
sends it from its own SIM. Queue acceptance is not delivery: the job is
``pending`` until a gateway claims it, ``sent`` when that phone reports it left,
and only the recipient can confirm it arrived.

Network work runs off the queue request. Timeouts are not retried automatically,
because the phone may already have sent the message.
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


def _endpoint() -> str:
    return config.OPENSMS_API_URL.rstrip("/") + "/api/v1/messages"


def _post(payload: dict) -> None:
    request = urllib.request.Request(
        _endpoint(),
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": "Bearer " + config.OPENSMS_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Cloudflare in front of opensms.dev answers urllib's default agent
            # with 403 "error code: 1010", so the client names itself.
            "User-Agent": "MyTurn/1.0 (desk queue prototype)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.loads(response.read() or b"{}")
        # The job id is how the dashboard traces the message; it proves the
        # queue accepted the work, not that a handset received it.
        logger.info("OpenSMS accepted SMS job %s (%s); delivery not yet confirmed",
                    result.get("id", "unavailable"), result.get("status", "unknown"))
    except urllib.error.HTTPError as exc:
        logger.warning("OpenSMS rejected SMS (HTTP %s)", exc.code)
    except Exception as exc:
        # Do not log provider bodies, credentials or recipient numbers.
        logger.warning("OpenSMS SMS attempt failed (%s)", type(exc).__name__)


def send_sms(to: str, message: str, *, idempotency_key: Optional[str] = None) -> bool:
    """Start a local send worker, not a delivery guarantee.

    idempotency_key is retained for older callers. The gateway API documents no
    idempotency header, so it must not be presented as deduplication.
    """
    phone = _normalise_phone(to)
    if not phone:
        return False
    if not config.OPENSMS_API_KEY:
        logger.warning("SMS not sent: configure MYTURN_OPENSMS_API_KEY")
        return False
    payload = {"to": phone, "message": message}
    if config.OPENSMS_DEVICE_ID:
        payload["deviceId"] = config.OPENSMS_DEVICE_ID
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
