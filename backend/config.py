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
# How long an approach report counts as "a visitor is at the counter now".
APPROACH_WINDOW_SECONDS = int(os.environ.get("MYTURN_APPROACH_WINDOW_SECONDS", "10"))
# How long without a report before the board is shown as offline.
DEVICE_ONLINE_SECONDS = int(os.environ.get("MYTURN_DEVICE_ONLINE_SECONDS", "30"))

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
