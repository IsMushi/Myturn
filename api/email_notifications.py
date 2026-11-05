"""Email through an explicitly configured TLS SMTP service."""
from email.message import EmailMessage
from email.utils import formataddr
import logging
import re
import smtplib
import ssl
import threading

import config

logger = logging.getLogger("myturn.email")
EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
RESERVED_DOMAINS = ("example.com", "example.net", "example.org", "example", "test", "invalid", "localhost")


def _reserved_domain(address: str) -> bool:
    domain = str(address).rsplit("@", 1)[-1].lower().rstrip(".")
    return any(domain == suffix or domain.endswith("." + suffix) for suffix in RESERVED_DOMAINS)


def _from_header() -> str:
    """`MyTurn <mailbox>`: a readable name over a mailbox the account may use.

    Providers (Gmail included) refuse a sender address the authenticated
    account cannot send as, but they accept any display name, so the brand
    belongs in the name and the real mailbox stays in the address. The name is
    configuration, so line breaks are stripped rather than trusted.
    """
    name = re.sub(r"[\r\n]+", " ", str(config.SMTP_FROM_NAME or "")).strip()
    if not name:
        return config.SMTP_FROM
    return formataddr((name, config.SMTP_FROM))


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
                logger.warning("SMTP refused the message")
            else:
                logger.info("SMTP accepted the message; inbox delivery not confirmed")
    except Exception as exc:
        logger.warning("Email attempt failed (%s)", type(exc).__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """Schedule email without allowing SMTP failures to break a committed write.

    A True result means the daemon thread was started. It is not provider
    acceptance and never proof of inbox delivery.
    """
    if not EMAIL.fullmatch(to or ""):
        return False
    if _reserved_domain(to):
        logger.warning("Email not sent: recipient domain is reserved for testing")
        return False
    if not config.SMTP_HOST or not EMAIL.fullmatch(config.SMTP_FROM):
        logger.warning("Email not sent: configure MYTURN_SMTP_HOST and MYTURN_SMTP_FROM")
        return False
    if config.SMTP_SECURITY not in {"starttls", "ssl"}:
        logger.warning("Email not sent: SMTP security must be starttls or ssl")
        return False
    try:
        message = EmailMessage()
        message["From"] = _from_header()
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        threading.Thread(target=_deliver, args=(message,), daemon=True).start()
        return True
    except (ValueError, RuntimeError):
        logger.warning("Email notification could not be scheduled")
        return False
