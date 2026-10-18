"""Staff session checks and device key checks."""
import hashlib
import hmac
from functools import wraps

from flask import current_app, g, jsonify, request, session

from db import get_db


def hash_device_key(key):
    """Store only the digest of a device key, never the key itself."""
    return hashlib.sha256(str(key).encode("utf-8")).hexdigest()


def check_staff_password(password):
    expected = str(current_app.config["STAFF_PASSWORD"])
    return hmac.compare_digest(str(password or ""), expected)


def staff_required(view):
    """Any route that decides something about a ticket or the desk."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        if not session.get("staff"):
            return jsonify(error="sign in required"), 401
        return view(*args, **kwargs)

    return wrapper


def device_required(view):
    """Any route called by the ESP32, authenticated with the X-Device-Key header."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        digest = hash_device_key(request.headers.get("X-Device-Key", ""))
        row = get_db().execute(
            "select device_id, label from devices where device_key_hash = ?", (digest,)
        ).fetchone()
        if row is None:
            return jsonify(error="unknown device"), 401
        g.device_id = row["device_id"]
        g.device_label = row["label"]
        return view(*args, **kwargs)

    return wrapper
