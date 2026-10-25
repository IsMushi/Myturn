"""Account routes: sign in, invitation-based registration, password reset.

A visitor never needs any of this. These routes exist so a staff member signs in
as a person and an administrator can invite the next one, instead of everybody
sharing one password that cannot be traced and cannot be taken back.
"""
from datetime import date, datetime, time, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request, session

from broadcast import signal
from db import get_db
from routes.visitor import (
    LONGEST_SERVICE_SECONDS,
    desk_state,
    service_by_key,
    service_durations,
    service_state,
    service_time,
    ticket_label,
)
from security import (
    clean_email,
    clean_name,
    clear_attempts,
    csrf_required,
    current_user,
    ensure_csrf,
    hash_device_key,
    hash_password,
    new_token,
    password_problem,
    rate_limit,
    role_required,
    start_session,
    token_digest,
    verify_password,
)
from util import (
    KIGALI,
    is_future,
    local_date,
    local_iso,
    local_sql,
    now,
    parse,
    seconds_since,
    soon,
)

bp = Blueprint("auth", __name__)

# Waiting to be hashed, so a request for an address that does not exist costs
# about as much time as one that does. Without it, the clock alone tells an
# attacker which addresses are real.
_DUMMY_HASH = hash_password("not-a-real-password")


def public_user(row):
    """The fields a page is allowed to see. Never the password hash."""
    return {
        "user_id": row["user_id"],
        "full_name": row["full_name"],
        "email": row["email"],
        "role": row["role"],
        "desk_id": row["desk_id"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
        "last_login_at": row["last_login_at"],
    }


def find_user(conn, email):
    return conn.execute(
        "select * from users where email = ?", (email,)
    ).fetchone()


def administrator_contact(conn, exclude_user_id=None):
    """An active administrator a staff member can ask about an address change.

    The account page owns the name, but the address is the identity and stays
    with the administrator. The page needs somewhere to send that request, so
    the session carries the first active administrator. When the signed-in
    person is the only administrator, the answer is their own account rather
    than ``None``: the page then says who the administrator is without
    pretending there is somebody else to ask.
    """
    row = conn.execute(
        "select full_name, email from users "
        "where role = 'admin' and is_active = 1 and user_id <> ? "
        "order by user_id limit 1",
        (exclude_user_id or -1,),
    ).fetchone()
    if row is None:
        row = conn.execute(
            "select full_name, email from users "
            "where role = 'admin' and is_active = 1 order by user_id limit 1"
        ).fetchone()
    return dict(row) if row is not None else None


def log_account_event(conn, event_type, email, actor, detail=None):
    """One line in the account history, which is what the activity page reads.

    The queue keeps ticket_events for the same reason: the current row says what
    is true now, the log says how it got there and who did it.
    """
    conn.execute(
        "insert into account_events (event_type, email, detail, actor, event_time) "
        "values (?, ?, ?, ?, ?)",
        (event_type, email, detail, actor or "system", now()),
    )
    # Everything that writes account history goes through here, so one signal
    # here makes the activity page and the administrator's roster update at
    # once rather than waiting for their next poll.
    signal()


def _desk_text(value, limit):
    """A trimmed, single-spaced field, or None when it is empty or too long."""
    text = " ".join(str(value or "").split())
    return text if 0 < len(text) <= limit else None


def _service_words(data):
    """The editable words of a service, or the reason they are not usable."""
    name = _desk_text(data.get("name"), 60)
    if name is None:
        return None, None, None, "give the service a name of 60 characters or fewer"
    description = _desk_text(data.get("description"), 160)
    if description is None:
        return None, None, None, "give the service a description of 160 characters or fewer"
    target, problem = _target_seconds(data.get("target_seconds"))
    if problem is not None:
        return None, None, None, problem
    return name, description, target, None


def _target_seconds(raw):
    if raw in (None, ""):
        return None, None
    try:
        target = int(raw)
    except (TypeError, ValueError):
        return None, "the target time must be a whole number of seconds"
    if not 15 <= target <= 4 * 60 * 60:
        return None, "the target time must be between 15 seconds and 4 hours"
    return target, None


def _service_payload(row):
    return {
        "service_id": row["service_id"],
        "id": row["letter"],
        "letter": row["letter"],
        "name": row["name"],
        "description": row["description"],
        "target_seconds": row["target_seconds"],
        "is_active": bool(row["is_active"]),
        "updated_at": row["updated_at"],
        "updated_by": row["updated_by"],
    }


def _profile_payload(row):
    """The older desk-profile shape, kept for the settings alias."""
    return {
        "name": row["name"],
        "description": row["description"],
        "target_seconds": row["target_seconds"],
        "updated_at": row["updated_at"],
        "updated_by": row["updated_by"],
    }


def _desk_payload(conn, row):
    setting = conn.execute(
        "select service_state, updated_at, updated_by, pause_reason, paused_until "
        "from desk_settings "
        "where desk_id = ? order by setting_id desc limit 1",
        (row["desk_id"],),
    ).fetchone()
    # The board is named here so the desk list can say which counter it watches
    # instead of telling every counter without one that it has "no board". An
    # office may own fewer boards than counters, and usually does.
    device = conn.execute(
        "select label, last_seen from devices where desk_id = ? "
        "order by device_id limit 1",
        (row["desk_id"],),
    ).fetchone()
    return {
        "desk_id": row["desk_id"],
        "name": row["name"],
        "is_active": bool(row["is_active"]),
        "service_id": row["service_id"],
        "service_letter": row["service_letter"],
        "service_name": row["service_name"],
        "service_state": setting["service_state"] if setting else "paused",
        "updated_at": setting["updated_at"] if setting else None,
        "updated_by": setting["updated_by"] if setting else None,
        # The desk's own words while it is paused, so the administrator's
        # dashboard can say why a counter is not calling rather than only that it
        # is not. Written by the counter, never inferred here.
        "pause_reason": setting["pause_reason"] if setting else None,
        "paused_until": setting["paused_until"] if setting else None,
        "device_label": device["label"] if device is not None else None,
        "device_online": _board_online(device["last_seen"]) if device is not None else False,
    }


def _board_online(last_seen):
    """Whether a board has reported recently enough to be believed."""
    if last_seen is None:
        return False
    age = seconds_since(last_seen)
    return age is not None and age <= current_app.config["DEVICE_ONLINE_SECONDS"]


def _desk_rows(conn):
    return conn.execute(
        "select d.desk_id, d.name, d.is_active, d.service_id, "
        "       s.letter as service_letter, s.name as service_name "
        "from desks d join services s on s.service_id = d.service_id "
        "order by d.desk_id"
    ).fetchall()


# ---------------------------------------------------------------------------
# signing in
# ---------------------------------------------------------------------------
@bp.post("/api/auth/login")
@rate_limit("login", "LOGIN_ATTEMPTS", "LOGIN_WINDOW_SECONDS")
def login():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))
    password = str(data.get("password") or "")

    if email is None or not password:
        return jsonify(error="enter your email address and your password"), 400

    conn = get_db()
    row = find_user(conn, email)

    stored = row["password_hash"] if row is not None else _DUMMY_HASH
    correct = verify_password(stored, password)

    if row is None or not correct:
        # One message for both cases, so the answer does not say which addresses
        # have an account.
        return jsonify(error="that email address and password do not match"), 401

    if not row["is_active"]:
        return jsonify(error="this account has been switched off"), 403

    # The sign-in time is written first, so the account the session carries
    # shows this sign-in and not the one before it.
    conn.execute("update users set last_login_at = ? where user_id = ?", (now(), row["user_id"]))
    user = public_user(find_user(conn, email))
    token = start_session(user)
    clear_attempts("login")

    return jsonify(
        user=user,
        csrf_token=token,
        redirect="/admin/dashboard" if user["role"] == "admin" else "/staff/dashboard",
    )


@bp.post("/api/auth/logout")
@csrf_required
def logout():
    session.clear()
    return jsonify(ok=True)


@bp.get("/api/auth/me")
def me():
    """Who this session belongs to, for a page that has just loaded.

    An account signs in with an email address; the shared classroom password is
    reported as a shared session so the two can be told apart in the interface.
    """
    user = current_user()
    if user is not None:
        return jsonify(
            user=user,
            csrf_token=ensure_csrf(),
            shared=False,
            administrator=administrator_contact(get_db(), user["user_id"]),
        )

    name = session.get("staff")
    if name is None:
        # The browser carried a session cookie that now names nobody: the
        # account was deleted or switched off, its password was reset, or the
        # cookie was signed with a key this API no longer uses. Dropping it here
        # is what keeps the console and the sign-in page from sending the
        # browser back and forth: the console refuses the cookie, and the
        # sign-in page turns away anyone who has one.
        response = jsonify(error="not signed in")
        response.status_code = 401
        if request.cookies.get("session"):
            # `session.clear()` only reaches a cookie Flask could read; a cookie
            # it could not read still has to leave the browser, so the deletion
            # is written out explicitly as well.
            session.clear()
            response.delete_cookie(
                "session",
                path="/",
                httponly=True,
                samesite="Lax",
                secure=current_app.config["SESSION_COOKIE_SECURE"],
            )
        return response

    return jsonify(staff=name, csrf_token=ensure_csrf(), shared=True)


# ---------------------------------------------------------------------------
# the account behind the session
# ---------------------------------------------------------------------------
@bp.post("/api/auth/profile")
@csrf_required
def update_profile():
    """The name (and, with the current password, the address) on the account.

    The address is the identity: it is the one the invitation was sent to and
    the one the administrator sees, so it is not changed lightly. Changing it
    requires the current password, and the new address must not already be in
    use.
    """
    user = current_user()
    if user is None:
        return jsonify(error="sign in with an account first"), 401

    data = request.get_json(silent=True) or {}
    name = clean_name(data.get("full_name"))
    if name is None:
        return jsonify(error="add your full name"), 400

    new_email = data.get("email")
    email_changed = False
    if new_email is not None and str(new_email).strip().casefold() != user["email"].casefold():
        new_email = str(new_email).strip()
        if not new_email or "@" not in new_email:
            return jsonify(error="enter a valid email address"), 400
        password = data.get("current_password")
        conn = get_db()
        password_hash = conn.execute(
            "select password_hash from users where user_id = ?", (user["user_id"],)
        ).fetchone()["password_hash"]
        if not password or not verify_password(password_hash, password):
            return jsonify(error="enter your current password to change your email"), 403
        existing = conn.execute(
            "select user_id from users where email = ? and user_id <> ?",
            (new_email, user["user_id"]),
        ).fetchone()
        if existing is not None:
            return jsonify(error="that email address is already in use"), 409
        email_changed = True
    else:
        new_email = user["email"]
        conn = get_db()

    conn.execute(
        "update users set full_name = ?, email = ? where user_id = ?",
        (name, new_email, user["user_id"]),
    )
    if email_changed:
        log_account_event(conn, "profile", user["email"], user["email"],
                          "Email changed to %s" % new_email)
    else:
        log_account_event(conn, "profile", user["email"], user["email"], "Name changed")
    conn.commit()

    fresh = public_user(find_user(conn, new_email))
    session["user"] = fresh
    message = "Your email and name have been changed." if email_changed else "Your name has been changed."
    return jsonify(user=fresh, message=message)


@bp.get("/api/auth/account/history")
def account_history():
    """What has happened to this account, newest first.

    The administration page can read the history of every account. The person
    the account belongs to can read their own: it is their record, not a
    secret.
    """
    user = current_user()
    if user is None:
        return jsonify(error="sign in with an account first"), 401

    conn = get_db()
    entries = [
        {
            "event": row["event_type"],
            "at": row["event_time"],
            "actor": row["actor"],
            "detail": row["detail"],
        }
        for row in conn.execute(
            "select event_type, detail, actor, event_time from account_events "
            "where email = ? order by event_id desc limit 30",
            (user["email"],),
        )
    ]
    return jsonify(entries=entries)


@bp.get("/api/auth/account/work")
def account_work():
    """The decisions this person made at the counter, newest first.

    The activity page is the administrator's. A staff member can see their own
    record of the tickets they worked, which is also the quickest way to check
    that a decision was taken back.
    """
    user = current_user()
    if user is None:
        return jsonify(error="sign in with an account first"), 401

    conn = get_db()
    limit = min(int(request.args.get("limit") or 20), 50)
    entries = [
        {
            "event": row["event_type"],
            "at": row["event_time"],
            "ticket_no": row["ticket_no"],
            "label": ticket_label(row["service_letter"], row["ticket_no"]),
            "detail": row["detail"],
        }
        for row in conn.execute(
            "select e.event_type, e.event_time, e.detail, t.ticket_no, "
            "       s.letter as service_letter "
            "from ticket_events e join tickets t on t.ticket_id = e.ticket_id "
            "join services s on s.service_id = t.service_id "
            "where e.actor = ? order by e.event_id desc limit ?",
            (user["email"], limit),
        )
    ]
    return jsonify(entries=entries)


# ---------------------------------------------------------------------------
# registering from an invitation
# ---------------------------------------------------------------------------
@bp.post("/api/auth/register")
@rate_limit("register", "LOGIN_ATTEMPTS", "LOGIN_WINDOW_SECONDS")
def register():
    data = request.get_json(silent=True) or {}
    token = str(data.get("token") or "").strip()
    full_name = clean_name(data.get("full_name"))

    if not token:
        return jsonify(error="this page needs the link from your invitation"), 400
    if full_name is None:
        return jsonify(error="add your full name"), 400
    if data.get("password") != data.get("confirm_password"):
        return jsonify(error="the two passwords are not the same"), 400
    problem = password_problem(data.get("password"))
    if problem:
        return jsonify(error=problem), 400

    conn = get_db()
    row = conn.execute(
        "select * from invitations where token_hash = ? and accepted_at is null",
        (token_digest(token),),
    ).fetchone()

    if row is None:
        return jsonify(error="that invitation link is not valid, ask for a new one"), 400
    if not is_future(row["expires_at"]):
        return jsonify(error="that invitation has expired, ask for a new one"), 400
    if find_user(conn, row["email"]) is not None:
        return jsonify(error="an account already exists for that address"), 409

    # The role on the invitation is honoured, but an invitation can never carry
    # the administrator role: that is granted inside the application only.
    role = "staff" if row["role"] != "staff" else row["role"]

    conn.execute("begin immediate")
    try:
        cursor = conn.execute(
            "insert into users (full_name, email, password_hash, role, desk_id, created_at) "
            "values (?, ?, ?, ?, ?, ?)",
            (full_name, row["email"], hash_password(data["password"]), role, row["desk_id"], now()),
        )
        conn.execute(
            "update invitations set accepted_at = ? where invitation_id = ?",
            (now(), row["invitation_id"]),
        )
        log_account_event(conn, "registered", row["email"], row["email"],
                          "accepted the invitation")
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    user = public_user(conn.execute(
        "select * from users where user_id = ?", (cursor.lastrowid,)
    ).fetchone())
    token_out = start_session(user)
    clear_attempts("register")

    return jsonify(user=user, csrf_token=token_out, redirect="/staff/dashboard"), 201


@bp.get("/api/auth/invitation")
def invitation_details():
    """What the registration page shows before anything is typed."""
    token = str(request.args.get("token") or "").strip()
    if not token:
        return jsonify(error="no invitation in this link"), 400

    row = get_db().execute(
        "select email, role, expires_at, accepted_at from invitations where token_hash = ?",
        (token_digest(token),),
    ).fetchone()

    if row is None:
        return jsonify(error="that invitation link is not valid"), 404
    if row["accepted_at"] is not None:
        return jsonify(email=row["email"], role=row["role"], accepted=True)
    if not is_future(row["expires_at"]):
        return jsonify(error="that invitation has expired"), 410

    return jsonify(email=row["email"], role=row["role"], accepted=False,
                   expires_at=row["expires_at"])


# ---------------------------------------------------------------------------
# forgotten passwords
# ---------------------------------------------------------------------------
@bp.post("/api/auth/forgot-password")
@rate_limit("forgot", "RESET_ATTEMPTS", "RESET_WINDOW_SECONDS")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))

    # The answer never depends on whether the address is known.
    answer = (
        "If that address has an account, a reset link has been sent. "
        "The link can be used once and expires shortly."
    )
    body = {"message": answer}

    if email is not None:
        conn = get_db()
        row = find_user(conn, email)
        if row is not None and row["is_active"]:
            token = new_token()
            conn.execute(
                "insert into password_resets (user_id, token_hash, created_at, expires_at) "
                "values (?, ?, ?, ?)",
                (
                    row["user_id"],
                    token_digest(token),
                    now(),
                    soon(current_app.config["RESET_TTL_MINUTES"] * 60),
                ),
            )
            if current_app.config["DEV_TOKENS"]:
                # Development shortcut. There is no mail server in the
                # prototype, so the link comes back in the response and is
                # written to the log. Turn MYTURN_DEV_TOKENS off to stop it.
                body["reset_path"] = "/auth/reset-password?token=" + token
                current_app.logger.warning(
                    "development reset link for %s: /auth/reset-password?token=%s",
                    email, token,
                )

    return jsonify(**body), 202


@bp.post("/api/auth/reset-password")
@rate_limit("reset", "RESET_ATTEMPTS", "RESET_WINDOW_SECONDS")
def reset_password():
    data = request.get_json(silent=True) or {}
    token = str(data.get("token") or "").strip()

    if not token:
        return jsonify(error="this page needs the link that was sent to you"), 400
    if data.get("password") != data.get("confirm_password"):
        return jsonify(error="the two passwords are not the same"), 400
    problem = password_problem(data.get("password"))
    if problem:
        return jsonify(error=problem), 400

    conn = get_db()
    row = conn.execute(
        "select * from password_resets where token_hash = ? and used_at is null",
        (token_digest(token),),
    ).fetchone()

    if row is None:
        return jsonify(error="that reset link is not valid, ask for a new one"), 400
    if not is_future(row["expires_at"]):
        return jsonify(error="that reset link has expired, ask for a new one"), 400

    conn.execute("begin immediate")
    try:
        conn.execute(
            "update users set password_hash = ? where user_id = ?",
            (hash_password(data["password"]), row["user_id"]),
        )
        conn.execute(
            "update password_resets set used_at = ? where reset_id = ?",
            (now(), row["reset_id"]),
        )
        # Any other link that was sent to this address stops working too.
        conn.execute(
            "update password_resets set used_at = ? where user_id = ? and used_at is null",
            (now(), row["user_id"]),
        )
        owner = conn.execute(
            "select email from users where user_id = ?", (row["user_id"],)
        ).fetchone()
        log_account_event(conn, "password reset", owner["email"] if owner else "unknown",
                          "the reset link")
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    clear_attempts("reset")
    return jsonify(message="Your password has been changed. You can sign in with it now.")


# ---------------------------------------------------------------------------
# administrator
# ---------------------------------------------------------------------------
@bp.get("/api/auth/users")
@role_required("admin")
def list_users():
    rows = get_db().execute(
        "select * from users order by role, full_name"
    ).fetchall()
    pending = get_db().execute(
        "select invitation_id, email, role, desk_id, created_at, expires_at from invitations "
        "where accepted_at is null order by created_at desc"
    ).fetchall()
    return jsonify(
        users=[public_user(row) for row in rows],
        invitations=[dict(row) for row in pending],
    )


@bp.post("/api/auth/invitations")
@role_required("admin")
@csrf_required
def create_invitation():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))
    if email is None:
        return jsonify(error="enter a valid email address"), 400

    requested = str(data.get("role") or "staff").lower()
    if requested != "staff":
        # Deliberate: an invitation may never hand out administrator rights.
        return jsonify(
            error="invitations can only be sent for staff accounts, "
                  "administrator rights are granted inside the application"
        ), 400

    # An invitation may pin the new staff member to one desk. Null means any.
    desk_id = None
    raw_desk = data.get("desk_id")
    if raw_desk not in (None, ""):
        try:
            desk_id = int(raw_desk)
        except (TypeError, ValueError):
            return jsonify(error="unknown desk"), 400
        exists = conn if False else None
        desk_row = get_db().execute(
            "select desk_id from desks where desk_id = ? and is_active = 1", (desk_id,)
        ).fetchone()
        if desk_row is None:
            return jsonify(error="unknown desk"), 400

    conn = get_db()
    if find_user(conn, email) is not None:
        return jsonify(error="an account already exists for that address"), 409

    days = current_app.config["INVITATION_TTL_HOURS"]
    token = new_token()

    # One live link per address. Asking again replaces the previous link rather
    # than leaving two that both work, which is what makes "send it again" safe.
    replaced = conn.execute(
        "delete from invitations where email = ? and accepted_at is null", (email,)
    ).rowcount

    conn.execute(
        "insert into invitations (email, role, desk_id, token_hash, invited_by, created_at, expires_at) "
        "values (?, 'staff', ?, ?, ?, ?, ?)",
        (email, desk_id, token_digest(token), current_user()["email"], now(), soon(days * 60 * 60)),
    )
    log_account_event(
        conn, "invitation replaced" if replaced else "invited", email,
        current_user()["email"],
    )

    body = {
        "email": email,
        "role": "staff",
        "replaced": bool(replaced),
        "expires_in_hours": days,
        "message": "Invitation created. Send this link to the new staff member.",
    }
    if current_app.config["DEV_TOKENS"]:
        body["register_path"] = "/auth/register?token=" + token
    return jsonify(**body), 201


@bp.post("/api/auth/users/<int:user_id>/active")
@role_required("admin")
@csrf_required
def set_active(user_id):
    """Switch an account off, or back on. An administrator cannot lock themselves out."""
    data = request.get_json(silent=True) or {}
    wanted = data.get("is_active")

    if not isinstance(wanted, bool):
        return jsonify(error="is_active must be true or false"), 400

    conn = get_db()
    row = conn.execute("select * from users where user_id = ?", (user_id,)).fetchone()
    if row is None:
        return jsonify(error="unknown account"), 404
    if row["user_id"] == current_user()["user_id"] and not wanted:
        return jsonify(error="you cannot switch off your own account"), 400

    conn.execute(
        "update users set is_active = ? where user_id = ?", (1 if wanted else 0, user_id)
    )
    log_account_event(
        conn, "switched on" if wanted else "switched off", row["email"],
        current_user()["email"],
    )
    return jsonify(user_id=user_id, is_active=wanted)


@bp.delete("/api/auth/users/<int:user_id>")
@role_required("admin")
@csrf_required
def delete_user(user_id):
    """Permanently remove another account, not its queue or audit history."""
    conn = get_db()
    conn.execute("begin immediate")
    try:
        row = conn.execute("select * from users where user_id = ?", (user_id,)).fetchone()
        if row is None:
            return jsonify(error="unknown account"), 404
        actor = current_user()
        if row["user_id"] == actor["user_id"]:
            return jsonify(error="you cannot delete your own account"), 400
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict) or str(data.get("confirm_email") or "").strip().casefold() != row["email"].casefold():
            return jsonify(error="confirm the account email address before deleting"), 400
        if row["role"] == "admin" and row["is_active"]:
            remaining = conn.execute(
                "select count(*) as c from users "
                "where role = 'admin' and is_active = 1 and user_id <> ?", (user_id,)
            ).fetchone()["c"]
            if remaining == 0:
                return jsonify(error="this is the last administrator, make another one first"), 400

        # Password reset tokens cascade; account and queue event histories use
        # email/actor text rather than a foreign key, so the audit trail remains.
        conn.execute("delete from users where user_id = ?", (user_id,))
        log_account_event(conn, "account deleted", row["email"], actor["email"])
        conn.commit()
        return jsonify(deleted=user_id, email=row["email"])
    finally:
        if conn.in_transaction:
            conn.rollback()


@bp.post("/api/auth/users/batch")
@role_required("admin")
@csrf_required
def batch_users():
    """Apply one action to a verified selection, or change nothing at all."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="provide the selected accounts and an action"), 400
    action = data.get("action")
    selected = data.get("accounts")
    if action not in ("activate", "deactivate", "delete"):
        return jsonify(error="choose switch on, switch off or delete"), 400
    if not isinstance(selected, list) or not 1 <= len(selected) <= 500:
        return jsonify(error="select between 1 and 500 accounts"), 400

    # The email is part of each selection, so a stale table cannot quietly
    # operate on a different account if its id has changed in the meantime.
    ids = []
    for entry in selected:
        if (not isinstance(entry, dict) or type(entry.get("user_id")) is not int
                or not isinstance(entry.get("email"), str)):
            return jsonify(error="each selected account needs an id and email"), 400
        ids.append(entry["user_id"])
    if len(set(ids)) != len(ids):
        return jsonify(error="an account was selected more than once"), 400
    if action == "delete" and data.get("confirmation") != "DELETE %d" % len(ids):
        return jsonify(error="confirm the number of accounts to delete"), 400

    conn = get_db()
    conn.execute("begin immediate")
    try:
        actor = current_user()
        rows = []
        for entry in selected:
            row = conn.execute(
                "select user_id, email, role, is_active from users where user_id = ?",
                (entry["user_id"],),
            ).fetchone()
            if row is None or row["email"].casefold() != entry["email"].strip().casefold():
                return jsonify(error="the team has changed; refresh and select accounts again"), 409
            if row["user_id"] == actor["user_id"]:
                return jsonify(error="you cannot include your own account"), 400
            rows.append(row)

        if action in ("deactivate", "delete"):
            removing_admins = sum(row["role"] == "admin" and row["is_active"] for row in rows)
            active_admins = conn.execute(
                "select count(*) as c from users where role = 'admin' and is_active = 1"
            ).fetchone()["c"]
            if active_admins - removing_admins < 1:
                return jsonify(error="the last administrator must stay active"), 400

        changed = 0
        for row in rows:
            if action == "delete":
                conn.execute("delete from users where user_id = ?", (row["user_id"],))
                event = "account deleted"
            else:
                wanted = action == "activate"
                if bool(row["is_active"]) == wanted:
                    continue
                conn.execute("update users set is_active = ? where user_id = ?",
                             (int(wanted), row["user_id"]))
                event = "switched on" if wanted else "switched off"
            log_account_event(conn, event, row["email"], actor["email"])
            changed += 1
        conn.commit()
        return jsonify(action=action, selected=len(rows), changed=changed)
    finally:
        if conn.in_transaction:
            conn.rollback()


@bp.post("/api/auth/users/<int:user_id>/role")
@role_required("admin")
@csrf_required
def set_role(user_id):
    """Make an account an administrator, or take the rights back again.

    The invitation route can only ever create staff, so this is the single door
    to administrator rights. It will not close behind the last one: an
    installation that could demote its final administrator would lock itself out
    of the page that hands out the accounts.
    """
    data = request.get_json(silent=True) or {}
    wanted = str(data.get("role") or "").lower()
    if wanted not in ("admin", "staff"):
        return jsonify(error="role must be admin or staff"), 400

    conn = get_db()
    row = conn.execute("select * from users where user_id = ?", (user_id,)).fetchone()
    if row is None:
        return jsonify(error="unknown account"), 404
    if row["role"] == wanted:
        return jsonify(error="that account is already %s" % wanted), 409

    if row["role"] == "admin":
        remaining = conn.execute(
            "select count(*) as c from users "
            "where role = 'admin' and is_active = 1 and user_id <> ?",
            (user_id,),
        ).fetchone()["c"]
        if remaining == 0:
            return jsonify(
                error="this is the last administrator, make another one first"
            ), 400

    conn.execute("update users set role = ? where user_id = ?", (wanted, user_id))
    log_account_event(conn, "role changed", row["email"], current_user()["email"],
                      "was %s, now %s" % (row["role"], wanted))

    updated = conn.execute("select * from users where user_id = ?", (user_id,)).fetchone()
    return jsonify(user=public_user(updated), changed_by=current_user()["email"])


@bp.post("/api/auth/invitations/<int:invitation_id>/revoke")
@role_required("admin")
@csrf_required
def revoke_invitation(invitation_id):
    """Withdraw a link that has not been used yet."""
    conn = get_db()
    row = conn.execute(
        "select * from invitations where invitation_id = ?", (invitation_id,)
    ).fetchone()
    if row is None:
        return jsonify(error="unknown invitation"), 404
    if row["accepted_at"] is not None:
        return jsonify(error="that invitation has already been used"), 409

    conn.execute("delete from invitations where invitation_id = ?", (invitation_id,))
    log_account_event(conn, "invitation revoked", row["email"], current_user()["email"])
    return jsonify(revoked=invitation_id, email=row["email"])


@bp.post("/api/auth/password")
@rate_limit("password", "LOGIN_ATTEMPTS", "LOGIN_WINDOW_SECONDS")
@csrf_required
def change_password():
    """Change the password of the account this session belongs to.

    A shared classroom session has no account behind it, so it is refused: there
    would be no password to change and nobody to change it for.
    """
    user = current_user()
    if user is None:
        return jsonify(error="sign in with your own account to change its password"), 403

    data = request.get_json(silent=True) or {}
    conn = get_db()
    row = conn.execute("select * from users where user_id = ?", (user["user_id"],)).fetchone()
    if row is None:
        return jsonify(error="unknown account"), 404
    if not verify_password(row["password_hash"], data.get("current_password")):
        return jsonify(error="that is not your current password"), 401
    if data.get("password") != data.get("confirm_password"):
        return jsonify(error="the two passwords are not the same"), 400
    problem = password_problem(data.get("password"))
    if problem:
        return jsonify(error=problem), 400

    conn.execute(
        "update users set password_hash = ? where user_id = ?",
        (hash_password(data["password"]), user["user_id"]),
    )
    log_account_event(conn, "password changed", row["email"], row["email"])
    clear_attempts("password")
    return jsonify(message="Your password has been changed.")


# ---------------------------------------------------------------------------
# what has happened lately
# ---------------------------------------------------------------------------
@bp.get("/api/auth/activity")
@role_required("admin")
def activity():
    """The queue, the desk and the accounts in one time-ordered list.

    Both logs are already written by the routes that change things; this route
    only reads them back, so nothing new has to be remembered anywhere.
    """
    limit = min(int(request.args.get("limit") or 60), 200)
    conn = get_db()

    entries = []
    for row in conn.execute(
        "select e.event_type, e.detail, e.event_time, e.actor, t.ticket_no, "
        "       s.letter as service_letter "
        "from ticket_events e join tickets t on t.ticket_id = e.ticket_id "
        "join services s on s.service_id = t.service_id "
        "order by e.event_id desc limit ?",
        (limit,),
    ):
        entries.append({
            "kind": "ticket", "event": row["event_type"], "at": row["event_time"],
            "actor": row["actor"], "ticket_no": row["ticket_no"],
            "label": ticket_label(row["service_letter"], row["ticket_no"]),
            "service": row["service_letter"], "desk": None,
            "email": None, "detail": row["detail"],
        })

    for row in conn.execute(
        "select ds.service_state, ds.updated_at, ds.updated_by, "
        "       d.name as desk_name, s.letter as service_letter "
        "from desk_settings ds join desks d on d.desk_id = ds.desk_id "
        "join services s on s.service_id = d.service_id "
        "order by ds.setting_id desc limit ?",
        (limit,),
    ):
        entries.append({
            "kind": "desk", "event": "desk " + row["service_state"],
            "at": row["updated_at"], "actor": row["updated_by"],
            "ticket_no": None, "label": None,
            "service": row["service_letter"], "desk": row["desk_name"],
            "email": None, "detail": None,
        })

    for row in conn.execute(
        "select event_type, email, detail, actor, event_time from account_events "
        "order by event_id desc limit ?",
        (limit,),
    ):
        entries.append({
            "kind": "account", "event": row["event_type"], "at": row["event_time"],
            "actor": row["actor"], "ticket_no": None, "label": None,
            "service": None, "desk": None, "email": row["email"],
            "detail": row["detail"],
        })

    entries.sort(key=lambda entry: entry["at"] or "", reverse=True)
    return jsonify(entries=entries[:limit], server_time=now())


# ---------------------------------------------------------------------------
# the catalogue the administrator edits
# ---------------------------------------------------------------------------
def _flag(value, default=True):
    if value is None:
        return default
    return value in (True, 1, "1", "true", "on", "yes")


def _next_letter(used):
    for code in range(ord("A"), ord("Z") + 1):
        letter = chr(code)
        if letter not in used:
            return letter
    return None


@bp.get("/api/auth/services")
@role_required("admin")
def list_services():
    """Every service, including one that has been switched off.

    The public catalogue hides an inactive service; this one has to show it so
    an administrator can switch it back on.
    """
    conn = get_db()
    counts = {
        row["service_id"]: row["c"]
        for row in conn.execute(
            "select service_id, count(*) as c from desks group by service_id"
        )
    }
    listing = []
    for row in conn.execute("select * from services order by letter"):
        payload = _service_payload(row)
        payload["desk_count"] = counts.get(row["service_id"], 0)
        payload["service_state"] = service_state(conn, row["service_id"])
        payload["waiting"] = conn.execute(
            "select count(*) as c from tickets "
            "where service_id = ? and status = 'waiting'",
            (row["service_id"],),
        ).fetchone()["c"]
        listing.append(payload)
    return jsonify(services=listing, server_time=now())


@bp.post("/api/auth/services")
@role_required("admin")
@csrf_required
def create_service():
    """Add a service to the office, with the next free ticket letter."""
    data = request.get_json(silent=True) or {}
    name, description, target, problem = _service_words(data)
    if problem is not None:
        return jsonify(error=problem), 400

    conn = get_db()
    used = {row["letter"] for row in conn.execute("select letter from services")}
    letter = str(data.get("letter") or "").strip().upper()
    if letter:
        if len(letter) != 1 or not letter.isalpha() or letter not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            return jsonify(error="the ticket letter must be one letter, A to Z"), 400
        if letter in used:
            return jsonify(error="that ticket letter is already in use"), 409
    else:
        letter = _next_letter(used)
        if letter is None:
            return jsonify(error="there is no free ticket letter left"), 400

    actor = current_user()["email"]
    cursor = conn.execute(
        "insert into services "
        "(letter, name, description, target_seconds, is_active, updated_at, updated_by) "
        "values (?, ?, ?, ?, 1, ?, ?)",
        (letter, name, description, target, now(), actor),
    )
    log_account_event(
        conn, "service added", actor, actor, "%s — %s" % (letter, name)
    )
    signal()
    row = conn.execute(
        "select * from services where service_id = ?", (cursor.lastrowid,)
    ).fetchone()
    payload = _service_payload(row)
    payload["desk_count"] = 0
    payload["service_state"] = "closed"
    payload["waiting"] = 0
    return jsonify(service=payload), 201


@bp.post("/api/auth/services/<int:service_id>")
@role_required("admin")
@csrf_required
def update_service(service_id):
    """Change one service's words, target or availability."""
    conn = get_db()
    row = conn.execute(
        "select * from services where service_id = ?", (service_id,)
    ).fetchone()
    if row is None:
        return jsonify(error="unknown service"), 404

    data = request.get_json(silent=True) or {}
    name, description, target, problem = _service_words(data)
    if problem is not None:
        return jsonify(error=problem), 400

    active = _flag(data.get("is_active"), bool(row["is_active"]))
    if row["is_active"] and not active:
        waiting = conn.execute(
            "select count(*) as c from tickets "
            "where service_id = ? and status = 'waiting'",
            (service_id,),
        ).fetchone()["c"]
        if waiting:
            return jsonify(
                error="there are still visitors waiting for that service"
            ), 409
        remaining = conn.execute(
            "select count(*) as c from services where is_active = 1 and service_id != ?",
            (service_id,),
        ).fetchone()["c"]
        if remaining == 0:
            return jsonify(error="the office must keep at least one service"), 400

    actor = current_user()["email"]
    conn.execute(
        "update services set name = ?, description = ?, target_seconds = ?, "
        "is_active = ?, updated_at = ?, updated_by = ? where service_id = ?",
        (name, description, target, 1 if active else 0, now(), actor, service_id),
    )
    log_account_event(
        conn,
        "service settings changed" if row["is_active"] == active else (
            "service switched on" if active else "service switched off"
        ),
        actor,
        actor,
        "%s — %s" % (row["letter"], name),
    )
    signal()
    updated = conn.execute(
        "select * from services where service_id = ?", (service_id,)
    ).fetchone()
    payload = _service_payload(updated)
    payload["desk_count"] = conn.execute(
        "select count(*) as c from desks where service_id = ?", (service_id,)
    ).fetchone()["c"]
    payload["service_state"] = service_state(conn, service_id)
    payload["waiting"] = conn.execute(
        "select count(*) as c from tickets "
        "where service_id = ? and status = 'waiting'",
        (service_id,),
    ).fetchone()["c"]
    return jsonify(service=payload)


@bp.get("/api/auth/desks")
@role_required("admin")
def list_desks():
    """Every counter, including a retired one, with its live state."""
    conn = get_db()
    rows = _desk_rows(conn)
    listing = []
    for row in rows:
        payload = _desk_payload(conn, row)
        payload["waiting"] = conn.execute(
            "select count(*) as c from tickets "
            "where service_id = ? and status = 'waiting'",
            (row["service_id"],),
        ).fetchone()["c"]
        listing.append(payload)
    return jsonify(desks=listing, server_time=now())


@bp.post("/api/auth/desks")
@role_required("admin")
@csrf_required
def create_desk():
    """Add a counter and point it at one service."""
    data = request.get_json(silent=True) or {}
    name = _desk_text(data.get("name"), 60)
    if name is None:
        return jsonify(error="give the desk a name of 60 characters or fewer"), 400

    conn = get_db()
    service = service_by_key(conn, data.get("service"))
    if service is None:
        return jsonify(error="choose the service this desk serves"), 400

    actor = current_user()["email"]
    cursor = conn.execute(
        "insert into desks (name, service_id, is_active) values (?, ?, 1)",
        (name, service["service_id"]),
    )
    conn.execute(
        "insert into desk_settings (desk_id, service_state, updated_at, updated_by) "
        "values (?, 'paused', ?, ?)",
        (cursor.lastrowid, now(), actor),
    )
    log_account_event(
        conn, "desk added", actor, actor, "%s — %s" % (name, service["name"])
    )
    signal()
    row = conn.execute(
        "select d.desk_id, d.name, d.is_active, d.service_id, "
        "       s.letter as service_letter, s.name as service_name "
        "from desks d join services s on s.service_id = d.service_id "
        "where d.desk_id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    payload = _desk_payload(conn, row)
    payload["waiting"] = 0
    return jsonify(desk=payload), 201


@bp.post("/api/auth/desks/<int:desk_id>")
@role_required("admin")
@csrf_required
def update_desk(desk_id):
    """Rename a counter, point it at another service, or retire it."""
    conn = get_db()
    row = conn.execute(
        "select d.desk_id, d.name, d.is_active, d.service_id, "
        "       s.letter as service_letter, s.name as service_name "
        "from desks d join services s on s.service_id = d.service_id "
        "where d.desk_id = ?",
        (desk_id,),
    ).fetchone()
    if row is None:
        return jsonify(error="unknown desk"), 404

    data = request.get_json(silent=True) or {}
    name = _desk_text(data.get("name"), 60)
    if name is None:
        return jsonify(error="give the desk a name of 60 characters or fewer"), 400

    service = service_by_key(conn, data.get("service")) if data.get("service") not in (None, "") else service_by_key(conn, row["service_id"])
    if service is None:
        return jsonify(error="unknown service"), 400

    active = _flag(data.get("is_active"), bool(row["is_active"]))
    called = conn.execute(
        "select ticket_no from tickets where desk_id = ? and status = 'called'",
        (desk_id,),
    ).fetchone()
    if called is not None and (not active or service["service_id"] != row["service_id"]):
        return jsonify(
            error="finish or move the ticket this desk is calling first"
        ), 409

    actor = current_user()["email"]
    conn.execute(
        "update desks set name = ?, service_id = ?, is_active = ? where desk_id = ?",
        (name, service["service_id"], 1 if active else 0, desk_id),
    )
    log_account_event(
        conn,
        "desk settings changed",
        actor,
        actor,
        "%s — %s" % (name, service["name"]),
    )
    signal()
    updated = conn.execute(
        "select d.desk_id, d.name, d.is_active, d.service_id, "
        "       s.letter as service_letter, s.name as service_name "
        "from desks d join services s on s.service_id = d.service_id "
        "where d.desk_id = ?",
        (desk_id,),
    ).fetchone()
    payload = _desk_payload(conn, updated)
    payload["waiting"] = conn.execute(
        "select count(*) as c from tickets "
        "where service_id = ? and status = 'waiting'",
        (updated["service_id"],),
    ).fetchone()["c"]
    return jsonify(desk=payload)


@bp.delete("/api/auth/desks/<int:desk_id>")
@role_required("admin")
@csrf_required
def delete_desk(desk_id):
    """Permanently remove a counter, and the tickets it ever served."""
    conn = get_db()
    conn.execute("begin immediate")
    try:
        row = conn.execute(
            "select d.desk_id, d.name, d.service_id, s.letter, s.name as service_name "
            "from desks d join services s on s.service_id = d.service_id "
            "where d.desk_id = ?", (desk_id,),
        ).fetchone()
        if row is None:
            return jsonify(error="unknown desk"), 404

        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict) or str(data.get("confirm") or "").strip() != row["name"]:
            return jsonify(error="confirm the desk name before deleting"), 400

        # A board watching this counter is moved off it first, so the binding
        # is not left pointing at a counter that no longer exists.
        conn.execute("update devices set desk_id = null where desk_id = ?", (desk_id,))

        # The tickets this counter ever touched, and their event log.
        ticket_ids = [r["ticket_id"] for r in conn.execute(
            "select ticket_id from tickets where desk_id = ?", (desk_id,),
        ).fetchall()]
        for tid in ticket_ids:
            conn.execute("delete from ticket_events where ticket_id = ?", (tid,))
        conn.execute("delete from tickets where desk_id = ?", (desk_id,))

        conn.execute("delete from desk_settings where desk_id = ?", (desk_id,))
        conn.execute("delete from desks where desk_id = ?", (desk_id,))

        actor = current_user()["email"]
        log_account_event(conn, "desk deleted", actor, actor,
                          "%s — %s" % (row["name"], row["service_name"]))
        conn.commit()
        signal()
        return jsonify(deleted=desk_id, name=row["name"])
    finally:
        if conn.in_transaction:
            conn.rollback()


@bp.delete("/api/auth/services/<int:service_id>")
@role_required("admin")
@csrf_required
def delete_service(service_id):
    """Permanently remove a waiting list, and everything it ever held."""
    conn = get_db()
    conn.execute("begin immediate")
    try:
        row = conn.execute("select * from services where service_id = ?", (service_id,)).fetchone()
        if row is None:
            return jsonify(error="unknown service"), 404

        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict) or str(data.get("confirm") or "").strip() != row["name"]:
            return jsonify(error="confirm the service name before deleting"), 400

        remaining_active = conn.execute(
            "select count(*) as c from services where is_active = 1 and service_id <> ?",
            (service_id,),
        ).fetchone()["c"]
        if row["is_active"] and remaining_active == 0:
            return jsonify(error="the office must keep at least one active service"), 400

        desks = conn.execute(
            "select desk_id, name from desks where service_id = ?", (service_id,),
        ).fetchall()
        if desks:
            return jsonify(error="move or remove the desks serving this service first"), 409

        # Every ticket this service ever issued, and its event log.
        ticket_ids = [r["ticket_id"] for r in conn.execute(
            "select ticket_id from tickets where service_id = ?", (service_id,),
        ).fetchall()]
        for tid in ticket_ids:
            conn.execute("delete from ticket_events where ticket_id = ?", (tid,))
        conn.execute("delete from tickets where service_id = ?", (service_id,))

        conn.execute("delete from ticket_numbers where name = ?", ("ticket:%s" % row["letter"],))

        conn.execute("delete from services where service_id = ?", (service_id,))

        actor = current_user()["email"]
        log_account_event(conn, "service deleted", actor, actor,
                          "%s — %s" % (row["letter"], row["name"]))
        conn.commit()
        signal()
        return jsonify(deleted=service_id, letter=row["letter"], name=row["name"])
    finally:
        if conn.in_transaction:
            conn.rollback()


@bp.post("/api/auth/office/reset")
@role_required("admin")
@csrf_required
def reset_office():
    """Clear every queue, counter and reading; keep accounts and settings."""
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict) or str(data.get("confirm") or "").strip() != "RESET THE OFFICE":
        return jsonify(error="confirm with the phrase RESET THE OFFICE"), 400

    conn = get_db()
    conn.execute("begin immediate")
    try:
        # Clear the queue and its history of events.
        for tid in [r["ticket_id"] for r in conn.execute("select ticket_id from tickets").fetchall()]:
            conn.execute("delete from ticket_events where ticket_id = ?", (tid,))
        conn.execute("delete from tickets")
        # Zero every per-service counter.
        conn.execute("update ticket_numbers set value = 0")
        # Pause every desk and drop its pause words.
        conn.execute(
            "update desk_settings set service_state = 'paused', "
            "pause_reason = null, paused_until = null, updated_at = ?, updated_by = ?",
            (now(), current_user()['email']),
        )
        # Drop the readings a board took, so a stale occupancy does not survive.
        conn.execute("delete from device_reports")
        conn.execute("update devices set last_seen = null")

        actor = current_user()["email"]
        log_account_event(conn, "office reset", actor, actor, "queues cleared")
        conn.commit()
        signal()
        return jsonify(reset=True)
    finally:
        if conn.in_transaction:
            conn.rollback()

#
# The office owns one board and several counters, so this is a single movable
# binding rather than a property every counter has: `devices.desk_id` names the
# one counter the board watches, and pointing it somewhere else takes it off the
# counter it was on. Nothing else changes - a counter without a board still
# serves visitors, it simply cannot tell whether somebody is standing at it, so
# the hold rule keeps its full length there.
# ---------------------------------------------------------------------------


def _device_rows(conn, device_id=None):
    where = " where v.device_id = ?" if device_id is not None else ""
    params = (device_id,) if device_id is not None else ()
    return conn.execute(
        "select v.device_id, v.label, v.chip_id, v.mac_address, v.last_seen, "
        "       v.desk_id, d.name as desk_name, s.letter as service_letter, "
        "       s.name as service_name "
        "from devices v "
        "left join desks d on d.desk_id = v.desk_id "
        "left join services s on s.service_id = d.service_id" + where +
        " order by v.device_id",
        params,
    ).fetchall()


def _device_payload(row):
    return {
        "device_id": row["device_id"],
        "label": row["label"],
        "chip_id": row["chip_id"],
        "mac_address": row["mac_address"],
        "last_seen": row["last_seen"],
        "online": _board_online(row["last_seen"]),
        "desk_id": row["desk_id"],
        "desk_name": row["desk_name"],
        "service_letter": row["service_letter"],
        "service_name": row["service_name"],
    }


@bp.get("/api/auth/devices")
@role_required("admin")
def list_devices():
    """Every board the office owns, and the counter each one watches."""
    conn = get_db()
    return jsonify(
        devices=[_device_payload(row) for row in _device_rows(conn)],
        server_time=now(),
    )


@bp.post("/api/auth/devices")
@role_required("admin")
@csrf_required
def register_device():
    """Register a board and hand out the one key it signs in with.

    The key is in this reply and nowhere else afterwards: only its digest is
    stored, so a key that is lost is replaced rather than looked up. That is why
    the page that registers a board is also the page that replaces its key.
    """
    data = request.get_json(silent=True) or {}
    label = _desk_text(data.get("label"), 60)
    if label is None:
        return jsonify(error="give the board a name of 60 characters or fewer"), 400

    conn = get_db()
    taken = conn.execute(
        "select device_id from devices where label = ? collate nocase", (label,)
    ).fetchone()
    if taken is not None:
        return jsonify(error="a board with that name is already registered"), 400

    wanted = data.get("desk_id")
    desk = None
    if wanted not in (None, ""):
        try:
            wanted = int(wanted)
        except (TypeError, ValueError):
            return jsonify(error="choose the counter this board watches"), 400
        desk = conn.execute(
            "select desk_id, name from desks where desk_id = ?", (wanted,)
        ).fetchone()
        if desk is None:
            return jsonify(error="unknown counter"), 404

    key = new_token()
    device_id = conn.execute(
        "insert into devices (label, device_key_hash, desk_id) values (?, ?, ?)",
        (label, hash_device_key(key), desk["desk_id"] if desk is not None else None),
    ).lastrowid

    actor = current_user()["email"]
    log_account_event(
        conn,
        "board registered",
        actor,
        actor,
        "%s -> %s" % (label, desk["name"] if desk is not None else "no counter"),
    )
    signal()
    row = _device_rows(conn, device_id)[0]
    return jsonify(device=_device_payload(row), device_key=key), 201


@bp.post("/api/auth/devices/<int:device_id>/key")
@role_required("admin")
@csrf_required
def replace_device_key(device_id):
    """Give a board a new key, for a key that was lost or written down elsewhere.

    The board keeps its name and the counter it watches; the key it was signing
    in with stops working the moment this answers, so a board that is still
    running the old key falls silent until it is flashed with the new one.
    """
    conn = get_db()
    device = conn.execute(
        "select device_id, label from devices where device_id = ?", (device_id,)
    ).fetchone()
    if device is None:
        return jsonify(error="unknown board"), 404

    key = new_token()
    conn.execute(
        "update devices set device_key_hash = ? where device_id = ?",
        (hash_device_key(key), device_id),
    )
    actor = current_user()["email"]
    log_account_event(conn, "board key replaced", actor, actor, device["label"])
    signal()
    row = _device_rows(conn, device_id)[0]
    return jsonify(device=_device_payload(row), device_key=key)


@bp.delete("/api/auth/devices/<int:device_id>")
@role_required("admin")
@csrf_required
def retire_device(device_id):
    """Take a board out of service, with the readings it took.

    Its key stops working with the row. The counter it watched keeps serving
    visitors: the hold rule simply returns to its full length there.
    """
    conn = get_db()
    device = conn.execute(
        "select device_id, label from devices where device_id = ?", (device_id,)
    ).fetchone()
    if device is None:
        return jsonify(error="unknown board"), 404

    conn.execute("delete from device_reports where device_id = ?", (device_id,))
    conn.execute("delete from devices where device_id = ?", (device_id,))
    actor = current_user()["email"]
    log_account_event(conn, "board retired", actor, actor, device["label"])
    signal()
    return jsonify(ok=True)


@bp.post("/api/auth/devices/<int:device_id>")
@role_required("admin")
@csrf_required
def assign_device(device_id):
    """Point one board at a counter, or take it off every counter.

    Moving a board clears the readings it took at the counter it has left.
    Those readings describe the old service point: the obstruction rule asks
    whether an approach was seen *there*, and an occupied reading carried over
    would tell the new counter that somebody is standing at it. The board's
    next report arrives within a few seconds and starts its history afresh.
    """
    conn = get_db()
    device = conn.execute(
        "select device_id, label, desk_id from devices where device_id = ?",
        (device_id,),
    ).fetchone()
    if device is None:
        return jsonify(error="unknown board"), 404

    data = request.get_json(silent=True) or {}
    wanted = data.get("desk_id")
    desk = None
    if wanted not in (None, ""):
        try:
            wanted = int(wanted)
        except (TypeError, ValueError):
            return jsonify(error="choose the counter this board watches"), 400
        desk = conn.execute(
            "select desk_id, name from desks where desk_id = ?", (wanted,)
        ).fetchone()
        if desk is None:
            return jsonify(error="unknown counter"), 404

    watching = desk["desk_id"] if desk is not None else None
    conn.execute(
        "update devices set desk_id = ? where device_id = ?", (watching, device_id)
    )
    if watching != device["desk_id"]:
        conn.execute("delete from device_reports where device_id = ?", (device_id,))

    actor = current_user()["email"]
    log_account_event(
        conn,
        "board moved",
        actor,
        actor,
        "%s -> %s" % (device["label"], desk["name"] if desk is not None else "no counter"),
    )
    signal()
    row = _device_rows(conn, device_id)[0]
    return jsonify(device=_device_payload(row))


# The older settings page edited one desk profile. Keep the route working for
# clients that have not moved yet: it now edits the first service.
@bp.get("/api/auth/desk")
@role_required("admin")
def read_desk():
    row = get_db().execute(
        "select * from services order by letter limit 1"
    ).fetchone()
    return jsonify(profile=_profile_payload(row))


@bp.post("/api/auth/desk")
@role_required("admin")
@csrf_required
def update_desk_profile():
    """Change the first service's words and target through the old route."""
    data = request.get_json(silent=True) or {}
    name, description, target, problem = _service_words(data)
    if problem is not None:
        return jsonify(error=problem), 400

    conn = get_db()
    row = conn.execute("select * from services order by letter limit 1").fetchone()
    actor = current_user()["email"]
    conn.execute(
        "update services set name = ?, description = ?, target_seconds = ?, "
        "updated_at = ?, updated_by = ? where service_id = ?",
        (name, description, target, now(), actor, row["service_id"]),
    )
    log_account_event(
        conn,
        "desk settings changed",
        actor,
        actor,
        "target %d s" % target if target is not None else "no target time",
    )
    signal()
    updated = conn.execute(
        "select * from services where service_id = ?", (row["service_id"],)
    ).fetchone()
    return jsonify(profile=_profile_payload(updated))


@bp.post("/api/auth/notices")
@role_required("admin")
def add_notice():
    """An administrator posts a notice that the wall display shows.

    The body should be `{ "message": "some text" }`. The notice is stored
    in the process memory and piggybacked onto the public state so the
    wall display can render it without a separate request.
    """
    data = request.get_json(silent=True) or {}
    message = data.get("message")
    if not message:
        return jsonify(error="notice message required"), 400
    # Store in process‑wide memory so the display can read it.
    if not hasattr(add_notice, "_notices"):
        add_notice._notices = []
    add_notice._notices.append({"message": message, "at": now()})
    signal()
    return jsonify(ok=True)


@bp.get("/api/auth/notices")
@role_required("admin")
def list_notices():
    """Return the notices stored by the admin, for the display."""
    notices = getattr(add_notice, "_notices", []) if "add_notice" in dir() else []
    return jsonify(notices=notices)


@bp.get("/api/auth/notices/public")
def public_notices():
    """Return just the latest notice for the wall display (no auth)."""
    notices = getattr(add_notice, "_notices", []) if "add_notice" in dir() else []
    return jsonify(notices=notices[-1:] if notices else [])


# --- What the office left behind -------------------------------------------
#
# One definition of each distribution, in the order the page stacks it. Both are
# fixed here rather than in the browser, so the shape of a chart does not move
# when the data underneath it does, and so a band that nobody landed in is still
# reported as a zero instead of quietly disappearing.

SERVICE_BUCKETS = (
    ("under 30 s", 0, 30),
    ("30-60 s", 30, 60),
    ("1-2 min", 60, 120),
    ("2-5 min", 120, 300),
    ("5 min or more", 300, None),
)

WAIT_BUCKETS = (
    ("under 2 min", 0, 120),
    ("2-5 min", 120, 300),
    ("5-10 min", 300, 600),
    ("10-20 min", 600, 1200),
    ("20 min or more", 1200, None),
)


def _histogram(durations, buckets):
    """How many measurements fall in each band, the empty bands included."""
    return [
        {
            "label": label,
            "count": sum(
                1
                for seconds in durations
                if seconds >= low and (high is None or seconds < high)
            ),
        }
        for label, low, high in buckets
    ]


def _median(values):
    """The middle measurement of a sorted list, or None when there is none."""
    return values[len(values) // 2] if values else None


def _share(part, whole):
    """A percentage that counts nothing rather than dividing by zero."""
    return round(part * 100 / whole) if whole else 0


def _kigali_day_start(day):
    """The instant a Kigali calendar day begins, in the UTC the rows carry."""
    midnight = datetime.combine(day, time.min, tzinfo=KIGALI)
    return midnight.astimezone(timezone.utc).isoformat(timespec="seconds")


def stats_period():
    """The period the statistics count, and the days it covers as a person reads them.

    Three shapes, in the order the page offers them: an explicit `from`/`to` pair
    of Kigali days, `days` for "the last N days, today included", or neither for
    the whole history. The boundaries are the office's midnights, because a day of
    this office is a Kigali day, and they are turned into UTC before they meet a
    stored timestamp. An unreadable or absurd period is treated as no period at
    all rather than as an error, so a hand-edited address still shows a page.
    """
    today = local_date()
    first = (request.args.get("from") or "").strip()
    last = (request.args.get("to") or "").strip()
    days = (request.args.get("days") or "").strip()

    if first and last:
        try:
            start, end = date.fromisoformat(first), date.fromisoformat(last)
        except ValueError:
            start = end = None
        if start is not None and end is not None:
            if end < start:
                start, end = end, start
            # Longer than a year is a mistake rather than a request.
            if (end - start).days <= 366:
                return (
                    _kigali_day_start(start),
                    _kigali_day_start(end + timedelta(days=1)),
                    {
                        "from": start.isoformat(),
                        "to": end.isoformat(),
                        "days": (end - start).days + 1,
                    },
                )

    if days.isdigit() and int(days) > 0:
        length = min(int(days), 366)
        start = today - timedelta(days=length - 1)
        return (
            _kigali_day_start(start),
            _kigali_day_start(today + timedelta(days=1)),
            {"from": start.isoformat(), "to": today.isoformat(), "days": length},
        )

    return None, None, {"from": None, "to": None, "days": None}


def _stats_where(service_id=None, since=None, until=None, desk_id=None):
    """The SQL that narrows every count on the page to the same set of tickets.

    One filter, used by every query below, is what keeps the totals, the
    distribution and the per-service rows describing the same visitors. A page
    whose figures are counted over different sets is a page that cannot be read.
    """
    clauses, params = [], []
    if service_id is not None:
        clauses.append("t.service_id = ?")
        params.append(service_id)
    if desk_id is not None:
        clauses.append("t.desk_id = ?")
        params.append(desk_id)
    if since is not None:
        clauses.append("t.created_at >= ?")
        params.append(since)
    if until is not None:
        clauses.append("t.created_at < ?")
        params.append(until)
    return (" where " + " and ".join(clauses)) if clauses else "", tuple(params)


def _stats_and(service_id=None, since=None, until=None, desk_id=None):
    """The same filter, for a query that already has a `where` of its own."""
    where, params = _stats_where(service_id, since, until, desk_id)
    return (where.replace(" where ", " and ", 1) if where else ""), params


def wait_durations(conn, service_id=None, since=None, until=None, desk_id=None):
    """How long visitors stood in line: from taking a number to being called.

    A ticket that was called and not answered comes back with a fresh number and
    no call of its own, so its wait is measured to the call that finally ended
    it. That is what the visitor actually stood there for, missed turn included,
    and it is the number the office is really promising when it speaks of a wait.
    """
    sql = "select created_at, called_at from tickets t where t.called_at is not null "
    params = []
    if service_id is not None:
        sql += "and t.service_id = ? "
        params.append(service_id)
    if desk_id is not None:
        sql += "and t.desk_id = ? "
        params.append(desk_id)
    if since is not None:
        sql += "and t.created_at >= ? "
        params.append(since)
    if until is not None:
        sql += "and t.created_at < ? "
        params.append(until)

    waited = []
    for row in conn.execute(sql, params):
        taken, called = parse(row["created_at"]), parse(row["called_at"])
        if taken is None or called is None:
            continue
        seconds = (called - taken).total_seconds()
        if 0 <= seconds <= LONGEST_SERVICE_SECONDS:
            waited.append(seconds)
    return waited


def _measured(values):
    """The mean of a set of measurements, withheld until it means something.

    The same threshold the visitor page uses, for the same reason: below it the
    number would be a guess dressed as a measurement, and the page says "not
    available" instead.
    """
    if len(values) < current_app.config["ETA_MIN_SAMPLES"]:
        return None
    return round(sum(values) / len(values))


@bp.get("/api/auth/stats")
@role_required("admin")
def stats():
    """What the office has done: issued, served, missed, and how long it took.

    Every number here is counted from rows the prototype already writes. Nothing
    is estimated, a share is taken over the tickets that have been decided rather
    than over every ticket ever taken, and the service time is measured the way
    the visitor page measures it, so the two cannot disagree.

    `?service=A` narrows the page to one waiting list; `?days=7` or
    `?from=&to=` narrows it to a period of Kigali days. Without either the
    figures are the whole office over all of its history, and `window` says so.
    """
    conn = get_db()
    wanted = request.args.get("service")
    service = service_by_key(conn, wanted) if wanted not in (None, "") else None
    service_id = service["service_id"] if service is not None else None

    since, until, window = stats_period()
    where, params = _stats_where(service_id, since, until)

    totals = conn.execute(
        "select count(*) as issued, "
        "  sum(case when t.status = 'completed' then 1 else 0 end) as served, "
        "  sum(case when t.status = 'skipped' then 1 else 0 end) as no_shows, "
        "  sum(case when t.status = 'cancelled' then 1 else 0 end) as cancelled, "
        "  sum(case when t.status = 'waiting' then 1 else 0 end) as waiting "
        "from tickets t" + where,
        params,
    ).fetchone()

    issued = totals["issued"] or 0
    served = totals["served"] or 0
    no_shows = totals["no_shows"] or 0
    cancelled = totals["cancelled"] or 0
    waiting = totals["waiting"] or 0

    # What the office has decided, as opposed to what is still standing in the
    # line. Every share below is taken over this: counted over every ticket ever
    # taken, the served rate would fall simply because more people arrived and
    # were still waiting, which says nothing about the desk.
    decided = served + no_shows + cancelled

    # A turn that was given back is not a no-show — the visitor came back for it
    # under a new number — so it is counted from the events rather than from a
    # status that no longer shows it.
    requeued_and, requeued_params = _stats_and(service_id, since, until)
    requeued = conn.execute(
        "select count(*) as c from ticket_events e "
        "join tickets t on t.ticket_id = e.ticket_id "
        "where e.event_type = 'requeued'" + requeued_and,
        requeued_params,
    ).fetchone()["c"]

    counted = {
        row["day"]: row
        for row in conn.execute(
            "select substr(" + local_sql("t.created_at") + ", 1, 10) as day, "
            "count(*) as issued, "
            "  sum(case when t.status = 'completed' then 1 else 0 end) as served "
            "from tickets t" + where + " group by day",
            params,
        )
    }

    if window["days"] is not None and window["days"] <= 62:
        # A chosen period is drawn as it was, quiet days included: a gap in the
        # line is information, and dropping it would silently close the office on
        # a day that simply had no visitors.
        per_day = []
        day = date.fromisoformat(window["from"])
        last_day = date.fromisoformat(window["to"])
        while day <= last_day:
            key = day.isoformat()
            row = counted.get(key)
            per_day.append(
                {
                    "day": key,
                    "issued": row["issued"] if row else 0,
                    "served": (row["served"] or 0) if row else 0,
                }
            )
            day += timedelta(days=1)
    else:
        per_day = [
            {
                "day": key,
                "issued": counted[key]["issued"],
                "served": counted[key]["served"] or 0,
            }
            for key in sorted(counted)[-14:]
        ]

    # The hours of the Kigali day, not of the UTC one: the office opens at eight
    # in the morning, and a chart that called that hour sixteen would be a chart
    # of the night before.
    hours = [
        {"hour": int(row["hour"]), "issued": row["issued"]}
        for row in conn.execute(
            "select substr(" + local_sql("t.created_at") + ", 12, 2) as hour, "
            "count(*) as issued "
            "from tickets t" + where + " group by hour order by hour",
            params,
        )
    ]

    # The distribution, not only the mean: a desk that serves most visitors in a
    # minute and one visitor in ten is not described by its average. The average
    # is the same function the visitor page calls, over the same served tickets,
    # so the estimate the visitor is shown and the figure the office is shown
    # come from one measurement.
    durations = service_durations(conn, service_id, since, until)
    average, samples = service_time(conn, service_id, since, until)
    ordered = sorted(durations)

    waited = wait_durations(conn, service_id, since, until)
    ordered_waits = sorted(waited)
    wait_average = _measured(waited)
    average_service = average

    # Time in the office is the two halves added up, and it is withheld unless
    # both halves are known: half a journey presented as the whole is worse than
    # no figure at all.
    average_total = (
        wait_average + average_service
        if wait_average is not None and average_service is not None
        else None
    )

    # Each service's own figures, so the office page can compare queues without
    # six more requests.
    per_service = []
    for row in conn.execute("select * from services order by letter"):
        own_where, own_params = _stats_where(row["service_id"], since, until)
        counts = conn.execute(
            "select count(*) as issued, "
            "  sum(case when t.status = 'completed' then 1 else 0 end) as served, "
            "  sum(case when t.status = 'skipped' then 1 else 0 end) as no_shows, "
            "  sum(case when t.status = 'cancelled' then 1 else 0 end) as cancelled, "
            "  sum(case when t.status = 'waiting' then 1 else 0 end) as waiting "
            "from tickets t" + own_where,
            own_params,
        ).fetchone()
        own_served = counts["served"] or 0
        own_decided = own_served + (counts["no_shows"] or 0) + (counts["cancelled"] or 0)
        measured, measured_samples = service_time(conn, row["service_id"], since, until)
        own_durations = service_durations(conn, row["service_id"], since, until)
        own_target = row["target_seconds"]
        own_waited = wait_durations(conn, row["service_id"], since, until)
        per_service.append(
            {
                "id": row["letter"],
                "letter": row["letter"],
                "name": row["name"],
                "is_active": bool(row["is_active"]),
                "issued": counts["issued"] or 0,
                "served": own_served,
                "no_shows": counts["no_shows"] or 0,
                "waiting": counts["waiting"] or 0,
                "decided": own_decided,
                "served_percent": _share(own_served, own_decided),
                "no_show_percent": _share(counts["no_shows"] or 0, own_decided),
                "average_wait_seconds": _measured(own_waited),
                "wait_samples": len(own_waited),
                "average_service_seconds": measured,
                "service_samples": measured_samples,
                "target_seconds": own_target,
                "within_target_percent": (
                    _share(
                        sum(1 for seconds in own_durations if seconds <= own_target),
                        len(own_durations),
                    )
                    if own_target is not None and own_durations
                    else None
                ),
            }
        )

    # Each counter, because a counter is where a service actually happens. Two
    # desks on one service can keep up and fall behind at the same time, and
    # "the line is slow" is not something anybody can act on.
    per_desk = []
    for row in conn.execute(
        "select d.desk_id, d.name, d.service_id, s.letter, s.name as service_name "
        "from desks d join services s on s.service_id = d.service_id "
        "order by s.letter, d.name"
    ):
        if service_id is not None and row["service_id"] != service_id:
            continue
        desk_where, desk_params = _stats_where(None, since, until, row["desk_id"])
        counts = conn.execute(
            "select count(*) as issued, "
            "  sum(case when t.status = 'completed' then 1 else 0 end) as served, "
            "  sum(case when t.status = 'skipped' then 1 else 0 end) as no_shows, "
            "  sum(case when t.status = 'waiting' then 1 else 0 end) as waiting "
            "from tickets t" + desk_where,
            desk_params,
        ).fetchone()
        desk_served = counts["served"] or 0
        desk_decided = desk_served + (counts["no_shows"] or 0)
        measured, measured_samples = service_time(
            conn, None, since, until, row["desk_id"]
        )
        desk_waited = wait_durations(conn, None, since, until, row["desk_id"])
        per_desk.append(
            {
                "id": row["desk_id"],
                "name": row["name"],
                "letter": row["letter"],
                "service_name": row["service_name"],
                "issued": counts["issued"] or 0,
                "served": desk_served,
                "waiting": counts["waiting"] or 0,
                "decided": desk_decided,
                "average_wait_seconds": _measured(desk_waited),
                "wait_samples": len(desk_waited),
                "average_service_seconds": measured,
                "service_samples": measured_samples,
            }
        )

    # The target is a promise the service makes about itself, so the page can say
    # how often it was kept over the same tickets it already measured.
    profile = service or conn.execute(
        "select * from services order by letter limit 1"
    ).fetchone()
    target = profile["target_seconds"] if profile is not None else None
    within_target = None
    if target is not None and durations:
        within_target = _share(
            sum(1 for seconds in durations if seconds <= target), len(durations)
        )

    return jsonify(
        window=window,
        # What was asked for, so the page can tell whether the figures in front of
        # it belong to the controls it is showing. The `service` below is the
        # profile the targets describe; this is the filter that was applied.
        filter={"service": service["letter"] if service is not None else None},
        totals={
            "issued": issued,
            "served": served,
            "no_shows": no_shows,
            "cancelled": cancelled,
            "waiting": waiting,
            "decided": decided,
            "requeued": requeued,
            # Over the tickets that have been decided, never over every ticket
            # ever taken: a growing line must not read as a falling rate.
            "served_percent": _share(served, decided),
            "no_show_percent": _share(no_shows, decided),
        },
        wait={
            "average_seconds": wait_average,
            "median_seconds": _median(ordered_waits),
            "samples": len(waited),
            "histogram": _histogram(waited, WAIT_BUCKETS),
            "average_total_seconds": average_total,
        },
        per_day=per_day,
        hours=hours,
        histogram=_histogram(durations, SERVICE_BUCKETS),
        median_service_seconds=_median(ordered),
        average_service_seconds=average,
        service_samples=samples,
        per_service=per_service,
        per_desk=per_desk,
        desk_name=profile["name"] if profile is not None else "The office",
        service=(
            {"id": profile["letter"], "letter": profile["letter"], "name": profile["name"]}
            if profile is not None
            else None
        ),
        target_seconds=target,
        within_target_percent=within_target,
        server_time=now(),
    )


@bp.get("/api/auth/tickets")
@role_required("admin")
def list_tickets():
    """Every ticket the office has issued, as JSON, for the admin portal."""
    conn = get_db()
    service = (request.args.get("service") or "").strip().upper() or None
    status = (request.args.get("status") or "").strip().lower() or None
    search = (request.args.get("q") or "").strip()
    try:
        limit = min(200, max(1, int(request.args.get("limit", 50))))
    except (TypeError, ValueError):
        limit = 50
    try:
        offset = max(0, int(request.args.get("offset", 0)))
    except (TypeError, ValueError):
        offset = 0

    where = []
    params = []
    if service:
        where.append("s.letter = ?")
        params.append(service)
    if status:
        where.append("t.status = ?")
        params.append(status)
    if search:
        where.append("(cast(t.ticket_no as text) like ? or t.contact like ?)")
        params.extend(["%" + search + "%", "%" + search + "%"])
    clause = (" where " + " and ".join(where)) if where else ""

    rows = conn.execute(
        "select t.ticket_id, t.ticket_no, s.letter, s.name as service_name, "
        "       t.status, t.source, t.contact, t.created_at, t.called_at, "
        "       t.closed_at, t.desk_id, d.name as desk_name "
        "from tickets t join services s on s.service_id = t.service_id "
        "left join desks d on d.desk_id = t.desk_id" + clause +
        " order by t.created_at desc limit ? offset ?",
        params + [limit, offset],
    ).fetchall()

    total = conn.execute(
        "select count(*) as c from tickets t join services s on s.service_id = t.service_id" + clause,
        params,
    ).fetchone()["c"]

    items = []
    for row in rows:
        called = row["called_at"]
        closed = row["closed_at"]
        seconds = None
        if called and closed:
            try:
                from datetime import datetime
                def _p(v):
                    return datetime.fromisoformat(v.replace("Z", "+00:00"))
                seconds = int((_p(closed) - _p(called)).total_seconds())
            except Exception:
                seconds = None
        items.append({
            "ticket_id": row["ticket_id"],
            "ticket_no": row["ticket_no"],
            "label": ticket_label(row["letter"], row["ticket_no"]),
            "service": row["letter"],
            "service_name": row["service_name"],
            "status": row["status"],
            "source": row["source"],
            "contact": row["contact"],
            "desk_id": row["desk_id"],
            "desk_name": row["desk_name"],
            "created_at": row["created_at"],
            "called_at": row["called_at"],
            "closed_at": row["closed_at"],
            "service_seconds": seconds,
        })

    return jsonify(tickets=items, total=total, limit=limit, offset=offset)


@bp.get("/api/auth/tickets.csv")
@role_required("admin")
def export_tickets():
    """Every ticket as a CSV file, for a written hand-over.

    The times are Kigali's, with the offset in the value, so the file can be
    read at the desk without a second thought about which zone it is in.
    """
    conn = get_db()
    lines = [
        "ticket_no,label,service,status,source,created_at,called_at,closed_at,"
        "service_seconds"
    ]

    for row in conn.execute(
        "select t.ticket_no, s.letter, t.status, t.source, t.created_at, "
        "       t.called_at, t.closed_at "
        "from tickets t join services s on s.service_id = t.service_id "
        "order by s.letter, t.ticket_no"
    ):
        called, closed = parse(row["called_at"]), parse(row["closed_at"])
        seconds = (
            int((closed - called).total_seconds())
            if called is not None and closed is not None else ""
        )
        lines.append(",".join(
            str(value if value is not None else "")
            for value in (
                row["ticket_no"], ticket_label(row["letter"], row["ticket_no"]),
                row["letter"], row["status"], row["source"],
                local_iso(row["created_at"]), local_iso(row["called_at"]),
                local_iso(row["closed_at"]),
                seconds,
            )
        ))

    return current_app.response_class(
        "\n".join(lines) + "\n",
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=myturn-tickets.csv"},
    )
