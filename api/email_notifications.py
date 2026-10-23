"""Visitor call email through an explicitly configured TLS SMTP service."""
from email.message import EmailMessage
import logging
import re
import smtplib
import ssl
import threading

import config

logger = logging.getLogger("myturn.email")
EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")


def _deliver(message: EmailMessage) -> None:
    try:
        context = ssl.create_default_context()
        if config.SMTP_SECURITY == "ssl":
            client = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=10, context=context)
        else:
            client = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        with client:
            client.ehlo()
            if config.SMTP_SECURITY == "starttls":
                client.starttls(context=context)
                client.ehlo()
            if config.SMTP_USERNAME:
                client.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
            refused = client.send_message(message)
            if refused:
                logger.warning("SMTP refused the visitor notification")
            else:
                logger.info("SMTP accepted visitor notification; inbox delivery not confirmed")
    except Exception as exc:
        logger.warning("Visitor email attempt failed (%s)", type(exc).__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """Schedule email without allowing SMTP failures to break a committed call."""
    if not EMAIL.fullmatch(to or ""):
        return False
    if not config.SMTP_HOST or not EMAIL.fullmatch(config.SMTP_FROM):
        logger.warning("Email not sent: configure MYTURN_SMTP_HOST and MYTURN_SMTP_FROM")
        return False
    if config.SMTP_SECURITY not in {"starttls", "ssl"}:
        logger.warning("Email not sent: SMTP security must be starttls or ssl")
        return False
    try:
        message = EmailMessage()
        message["From"] = config.SMTP_FROM
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        threading.Thread(target=_deliver, args=(message,), daemon=True).start()
        return True
    except (ValueError, RuntimeError):
        logger.warning("Email notification could not be scheduled")
        return False
