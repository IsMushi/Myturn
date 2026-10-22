"""Session checks, account passwords, device keys, CSRF and rate limiting.

Everything that decides who may call a route lives here, so the rules are the
same whichever client asks.
"""
import hashlib
import hmac
import secrets
import time
from functools import wraps

from flask import current_app, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import config
from db import get_db


# ---------------------------------------------------------------------------
# devices
# ---------------------------------------------------------------------------
def hash_device_key(key):
    """Store only the digest of a device key, never the key itself."""
    return hashlib.sha256(str(key).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# passwords and tokens
# ---------------------------------------------------------------------------
def hash_password(password):
    """Hash an account password with the scheme Werkzeug picks for the run."""
    return generate_password_hash(str(password))


def verify_password(password_hash, password):
    return check_password_hash(str(password_hash), str(password))


def check_staff_password(password):
    """The shared demo password, kept for the classroom demonstration."""
    expected = str(current_app.config["STAFF_PASSWORD"])
    return hmac.compare_digest(str(password or ""), expected)


def new_token():
    """A value that is handed to the user. Only its digest is stored."""
    return secrets.token_urlsafe(32)


def token_digest(token):
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# who is asking
# ---------------------------------------------------------------------------
def current_user():
    """The still-active account behind this session, or None.

    A session cookie holds the sign-in snapshot. Always check the database so
    deleting, disabling or demoting an account also takes effect for sessions
    that were already open in other browsers.
    """
    user = session.get("user")
    if not isinstance(user, dict) or not isinstance(user.get("user_id"), int):
        return None
    row = get_db().execute(
        "select user_id, full_name, email, role, is_active, created_at, last_login_at "
        "from users where user_id = ? and is_active = 1", (user["user_id"],)
    ).fetchone()
    if row is None:
        return None
    fresh = dict(row)
    fresh["is_active"] = True
    return fresh


def current_actor():
    """The name written into the audit trail for this request."""
    user = current_user()
    if user:
        return user["email"]
    return session.get("staff")


def current_role():
    user = current_user()
    if user:
        return user["role"]
    return "staff" if session.get("staff") else None


def ensure_csrf():
    """Make sure this session has a token, and return it.

    Issued with the session and handed back to the page, which sends it in the
    X-CSRF-Token header on every request that changes something. A cross-site
    form cannot read it, so it cannot take part in those requests.
    """
    token = session.get("csrf")
    if not token:
        token = new_token()
        session["csrf"] = token
    return token


def start_session(user, shared=False):
    """Begin a session, either for an account or for the shared password."""
    session.clear()
    if not shared:
        session["user"] = user
    session.permanent = True
    return ensure_csrf()


# ---------------------------------------------------------------------------
# guards
# ---------------------------------------------------------------------------
def staff_required(view):
    """Any route that decides something about a ticket or the desk.

    An account session and the shared classroom password both count; the
    account is preferred, and its email is what the audit trail records.
    """

    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_actor():
            return jsonify(error="sign in required"), 401
        return view(*args, **kwargs)

    return wrapper


def role_required(*roles):
    """Routes only an account with one of these roles may call."""

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            user = current_user()
            if user is None:
                return jsonify(error="sign in required"), 401
            if user["role"] not in roles:
                return jsonify(
                    error="this action needs a %s account" % " or ".join(roles)
                ), 403
            return view(*args, **kwargs)

        return wrapper

    return decorator


def csrf_required(view):
    """State-changing routes that ride on the session cookie.

    A request that carries no session has nothing to forge, so only an
    authenticated request is asked for the token. The device routes identify
    themselves with a header key and never reach this check.
    """

    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_actor():
            sent = request.headers.get("X-CSRF-Token")
            if not sent:
                body = request.get_json(silent=True)
                if isinstance(body, dict):
                    sent = body.get("csrf_token")
            expected = session.get("csrf")
            if not expected or not sent or not hmac.compare_digest(str(sent), str(expected)):
                return jsonify(error="missing or stale security token"), 403
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


# ---------------------------------------------------------------------------
# rate limiting
# ---------------------------------------------------------------------------
# Attempts are counted in memory per bucket and per client address. That is
# enough for one server and it keeps the prototype free of a Redis dependency;
# a deployment with several workers would move this table to the database.
_ATTEMPTS = {}

# How many failures we remember, so the dictionary cannot grow without bound.
_MAX_KEYS = 4096


def client_address():
    return request.remote_addr or "unknown"


def attempt_count(bucket, address=None):
    """How many recent attempts this client still has against it."""
    return len(_recent(bucket, address or client_address(), 0))


def _recent(bucket, address, window):
    hits = [stamp for stamp in _ATTEMPTS.get((bucket, address), ()) if time.monotonic() - stamp < window]
    if hits:
        _ATTEMPTS[(bucket, address)] = hits
    else:
        _ATTEMPTS.pop((bucket, address), None)
    return hits


def clear_attempts(bucket, address=None):
    """Called after a correct password, so one bad evening does not lock out."""
    _ATTEMPTS.pop((bucket, address or client_address()), None)


def rate_limit(bucket, limit_key, window_key):
    """Refuse a request once the same client has made too many of them.

    The two limits are named by configuration key and read per request, so this
    decorator can be written next to the route instead of at start-up.
    """

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            limit = current_app.config[limit_key]
            window_seconds = current_app.config[window_key]
            address = client_address()
            hits = _recent(bucket, address, window_seconds)
            if len(hits) >= limit:
                retry = int(window_seconds - (time.monotonic() - hits[0])) + 1
                response = jsonify(
                    error="too many attempts, try again in %d seconds" % retry
                )
                response.headers["Retry-After"] = str(retry)
                return response, 429

            if len(_ATTEMPTS) > _MAX_KEYS:
                _ATTEMPTS.clear()
            hits.append(time.monotonic())
            _ATTEMPTS[(bucket, address)] = hits
            return view(*args, **kwargs)

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# validation
# ---------------------------------------------------------------------------
def clean_email(value):
    """A trimmed address, or None when it is not one."""
    text = str(value or "").strip().lower()
    if not text or len(text) > 254 or text.count("@") != 1:
        return None
    local, _, domain = text.partition("@")
    if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
        return None
    if any(character.isspace() for character in text):
        return None
    return text


def password_problem(password):
    """The reason a password is refused, or None when it is acceptable.

    The minimum length is read from config rather than the application context,
    because the same check runs from the command line when the first
    administrator is created.
    """
    text = str(password or "")
    if len(text) < config.PASSWORD_MIN_LENGTH:
        return "use at least %d characters" % config.PASSWORD_MIN_LENGTH
    if text.strip() != text:
        return "remove the spaces at the start or end"
    if text.lower() in {"password", "myturn123", "letmein", "12345678"}:
        return "that password is too easy to guess"
    return None


def clean_name(value, limit=80):
    text = " ".join(str(value or "").split())
    return text[:limit] or None
