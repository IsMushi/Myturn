"""Configuration for the MyTurn API.

Values come from the environment, with development defaults so the project runs
after a fresh clone. Copy .env.example to .env and edit it before the defence.
"""
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR = Path(os.environ.get("MYTURN_DATA_DIR", BASE_DIR / "data"))
DATABASE = os.environ.get("MYTURN_DB", str(DATA_DIR / "myturn.db"))

# Flask uses these names directly when the module is loaded with from_object().
SECRET_KEY = os.environ.get("MYTURN_SECRET", "dev-only-secret-change-me")
STAFF_PASSWORD = os.environ.get("MYTURN_STAFF_PASSWORD", "myturn")

# How long a called ticket keeps its place before it goes back to the queue.
HOLD_SECONDS = int(os.environ.get("MYTURN_HOLD_SECONDS", "60"))
# The floor the board may shorten that hold to when the counter is verifiably
# empty, and the grace before any shortening is allowed at all. The board is
# evidence, not authority: both fall back to HOLD_SECONDS without a fresh report.
MIN_CALL_SECONDS = int(os.environ.get("MYTURN_MIN_CALL_SECONDS", "25"))
MIN_GRACE_SECONDS = int(os.environ.get("MYTURN_MIN_GRACE_SECONDS", "10"))
# How long an approach report counts as "movement at the counter now". It
# says movement, not a person: the PIR cannot tell a visitor from anyone
# else who walks past.
APPROACH_WINDOW_SECONDS = int(os.environ.get("MYTURN_APPROACH_WINDOW_SECONDS", "10"))
# How long an object must sit still at the counter before it is treated as an
# obstruction rather than a visitor, and how far the distance may drift in
# that time and still count as still. A bag left on the desk reads as
# occupied for as long as it is there, and a desk that cannot call anybody is
# a desk that has stopped working. An object that has not moved, and that no
# approach was ever seen near, is an obstruction: it does not block the desk.
# A visitor who walked up and then stood still brought an approach with them
# and is never written off as a bag.
OBSTRUCTION_SECONDS = int(os.environ.get("MYTURN_OBSTRUCTION_SECONDS", "300"))
OBSTRUCTION_TOLERANCE_CM = float(os.environ.get("MYTURN_OBSTRUCTION_TOLERANCE_CM", "15"))
# How long without a report before the board is shown as offline.
DEVICE_ONLINE_SECONDS = int(os.environ.get("MYTURN_DEVICE_ONLINE_SECONDS", "30"))

# --- the service on offer --------------------------------------------------
# The prototype runs one desk, so it offers one service. The name and the
# description come from here rather than being invented in the interface, and
# the ticket page shows what the API reports.
DESK_NAME = os.environ.get("MYTURN_DESK_NAME", "General Service")
DESK_DESCRIPTION = os.environ.get(
    "MYTURN_DESK_DESCRIPTION", "All enquiries handled at the front desk."
)
# Tickets one address may take in a minute. It stops a reload loop or a script
# from filling the queue, and it is loose enough for a real rush at the door.
TICKET_ATTEMPTS = int(os.environ.get("MYTURN_TICKET_ATTEMPTS", "20"))
TICKET_WINDOW_SECONDS = int(os.environ.get("MYTURN_TICKET_WINDOW_SECONDS", "60"))
# An estimate of the wait is only offered once this many tickets have been
# served, because a number worked out from one visitor is not an estimate.
ETA_MIN_SAMPLES = int(os.environ.get("MYTURN_ETA_MIN_SAMPLES", "3"))

# --- accounts -------------------------------------------------------------
PASSWORD_MIN_LENGTH = int(os.environ.get("MYTURN_PASSWORD_MIN_LENGTH", "8"))
# How long an invitation to join the team stays usable.
INVITATION_TTL_HOURS = int(os.environ.get("MYTURN_INVITATION_TTL_HOURS", "72"))
# How long a password-reset link stays usable. Deliberately short.
RESET_TTL_MINUTES = int(os.environ.get("MYTURN_RESET_TTL_MINUTES", "30"))

# Failed attempts allowed per address. The limits are generous enough for a
# demonstration and tight enough to stop a script trying the whole dictionary.
LOGIN_ATTEMPTS = int(os.environ.get("MYTURN_LOGIN_ATTEMPTS", "8"))
LOGIN_WINDOW_SECONDS = int(os.environ.get("MYTURN_LOGIN_WINDOW_SECONDS", "300"))
RESET_ATTEMPTS = int(os.environ.get("MYTURN_RESET_ATTEMPTS", "5"))
RESET_WINDOW_SECONDS = int(os.environ.get("MYTURN_RESET_WINDOW_SECONDS", "900"))
# Telling the user whether an address exists is itself a leak, so the answer is
# always the same. Testing needs the token, so with this turned on the response
# carries the link and the server log says plainly that it is a development
# shortcut. It must stay off anywhere real.
DEV_TOKENS = os.environ.get("MYTURN_DEV_TOKENS", "1").lower() in {"1", "true", "yes"}

# The first administrator is created by seed_admin.py from these two values.
# Nothing in the running application reads ADMIN_PASSWORD.
ADMIN_EMAIL = os.environ.get("MYTURN_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("MYTURN_ADMIN_PASSWORD", "")
ADMIN_NAME = os.environ.get("MYTURN_ADMIN_NAME", "MyTurn administrator")


SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = os.environ.get("MYTURN_SECURE_COOKIES", "0").lower() in {"1", "true", "yes"}
PERMANENT_SESSION_LIFETIME = timedelta(hours=12)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "MYTURN_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

# The address people open in a browser. Invitation email needs an absolute
# registration link, and the API does not sit on the web app's origin.
WEB_URL = (os.environ.get("MYTURN_WEB_URL") or "http://localhost:3000").rstrip("/")


# Visitor call notifications. Secrets stay on the API, never in Next.js.
OPENSMS_API_KEY = os.environ.get("MYTURN_OPENSMS_API_KEY", "")
OPENSMS_API_URL = os.environ.get("MYTURN_OPENSMS_API_URL", "https://opensms.dev")
OPENSMS_DEVICE_ID = os.environ.get("MYTURN_OPENSMS_DEVICE_ID", "")
SMS_COUNTRY_CODE = os.environ.get("MYTURN_SMS_COUNTRY_CODE", "250")
SMTP_HOST = os.environ.get("MYTURN_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("MYTURN_SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("MYTURN_SMTP_USERNAME", "")
SMTP_PASSWORD = os.environ.get("MYTURN_SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("MYTURN_SMTP_FROM", "")
# The name the recipient sees, not the authenticated mailbox: Gmail and most
# providers refuse a sender address the account may not send as, but a display
# name is free. "MyTurn" keeps the brand in the inbox without pretending to be
# a mailbox nobody owns.
SMTP_FROM_NAME = os.environ.get("MYTURN_SMTP_FROM_NAME", "MyTurn")
SMTP_SECURITY = os.environ.get("MYTURN_SMTP_SECURITY", "starttls").lower()

# When no provider is configured, a call can still be recorded locally so the
# notification path can be followed during a demonstration. This is a record of
# what would have been sent, never a delivery, and it is off unless asked for.
NOTIFY_DEV_SINK = os.environ.get("MYTURN_NOTIFY_DEV_SINK", "0").lower() in {"1", "true", "yes"}
NOTIFY_SINK_FILE = os.environ.get(
    "MYTURN_NOTIFY_SINK_FILE", str(DATA_DIR / "notifications.log")
)
