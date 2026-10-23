"""Account routes: sign in, invitation-based registration, password reset.

A visitor never needs any of this. These routes exist so a staff member signs in
as a person and an administrator can invite the next one, instead of everybody
sharing one password that cannot be traced and cannot be taken back.
"""
from flask import Blueprint, current_app, jsonify, request, session

from broadcast import signal
from db import get_db
from routes.visitor import (
    LONGEST_SERVICE_SECONDS,
    desk_state,
    service_by_key,
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
    hash_password,
    new_token,
    password_problem,
    rate_limit,
    role_required,
    start_session,
    token_digest,
    verify_password,
)
from util import is_future, local_iso, local_sql, now, parse, seconds_since, soon

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
        "select service_state, updated_at, updated_by from desk_settings "
        "where desk_id = ? order by setting_id desc limit 1",
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
    }


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
        return jsonify(error="not signed in"), 401

    return jsonify(staff=name, csrf_token=ensure_csrf(), shared=True)


# ---------------------------------------------------------------------------
# the account behind the session
# ---------------------------------------------------------------------------
@bp.post("/api/auth/profile")
@csrf_required
def update_profile():
    """The name on the account, corrected by the person it belongs to.

    The address is the identity: it is the one the invitation was sent to and
    the one the administrator sees, so it is not changed from here. The name is
    only a label, and a misspelled one is worth fixing.
    """
    user = current_user()
    if user is None:
        return jsonify(error="sign in with an account first"), 401

    data = request.get_json(silent=True) or {}
    name = clean_name(data.get("full_name"))
    if name is None:
        return jsonify(error="add your full name"), 400

    conn = get_db()
    conn.execute(
        "update users set full_name = ? where user_id = ?",
        (name, user["user_id"]),
    )
    log_account_event(conn, "profile", user["email"], user["email"], "Name changed")
    conn.commit()

    fresh = public_user(find_user(conn, user["email"]))
    # The session carries a copy of the account, so it is refreshed here: the
    # name at the foot of the sidebar changes with the page.
    session["user"] = fresh
    return jsonify(user=fresh, message="Your name has been changed.")


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
            "insert into users (full_name, email, password_hash, role, created_at) "
            "values (?, ?, ?, ?, ?)",
            (full_name, row["email"], hash_password(data["password"]), role, now()),
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
        "select invitation_id, email, role, created_at, expires_at from invitations "
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
        "insert into invitations (email, role, token_hash, invited_by, created_at, expires_at) "
        "values (?, 'staff', ?, ?, ?, ?)",
        (email, token_digest(token), current_user()["email"], now(), soon(days * 60 * 60)),
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
        payload["device_online"] = False
        last = conn.execute(
            "select last_seen from devices where desk_id = ? order by device_id limit 1",
            (row["desk_id"],),
        ).fetchone()
        if last is not None and last["last_seen"] is not None:
            age = seconds_since(last["last_seen"])
            payload["device_online"] = (
                age is not None
                and age <= current_app.config["DEVICE_ONLINE_SECONDS"]
            )
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
    payload["device_online"] = False
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
    payload["device_online"] = False
    return jsonify(desk=payload)


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


@bp.get("/api/auth/stats")
@role_required("admin")
def stats():
    """What the office has done: issued, served, missed, and how long it took.

    Every number here is counted from rows the prototype already writes. Nothing
    is estimated, and the service-time measurement is the same one the visitor
    page shows, so the two can never disagree. `?service=A` narrows the page to
    one queue; without it the figures are for the whole office.
    """
    conn = get_db()
    wanted = request.args.get("service")
    service = service_by_key(conn, wanted) if wanted not in (None, "") else None
    service_id = service["service_id"] if service is not None else None

    where = " where t.service_id = ?" if service_id is not None else ""
    params = (service_id,) if service_id is not None else ()

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

    per_day = [
        {"day": row["day"], "issued": row["issued"], "served": row["served"] or 0}
        for row in conn.execute(
            "select substr(" + local_sql("t.created_at") + ", 1, 10) as day, "
            "count(*) as issued, "
            "  sum(case when t.status = 'completed' then 1 else 0 end) as served "
            "from tickets t" + where + " group by day order by day desc limit 14",
            params,
        )
    ]
    per_day.reverse()

    # The hours of the Kigali day, not of the UTC one: the office opens at
    # eight in the morning, and a chart that called that hour sixteen would be
    # a chart of the night before.
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
    # minute and one visitor in ten is not described by its average.
    durations = []
    for row in conn.execute(
        "select t.called_at, t.closed_at from tickets t "
        "where t.status = 'completed' "
        "and t.called_at is not null and t.closed_at is not null"
        + (" and t.service_id = ?" if service_id is not None else ""),
        params,
    ):
        called, closed = parse(row["called_at"]), parse(row["closed_at"])
        if called is None or closed is None:
            continue
        seconds = (closed - called).total_seconds()
        if 0 <= seconds <= LONGEST_SERVICE_SECONDS:
            durations.append(seconds)

    buckets = (
        ("under 30 s", 0, 30),
        ("30-60 s", 30, 60),
        ("1-2 min", 60, 120),
        ("2-5 min", 120, 300),
        ("5 min or more", 300, None),
    )
    histogram = [
        {
            "label": label,
            "count": sum(
                1 for seconds in durations
                if seconds >= low and (high is None or seconds < high)
            ),
        }
        for label, low, high in buckets
    ]

    ordered = sorted(durations)
    average, samples = service_time(conn, service_id)

    # Each service's own figures, so the office page can compare queues without
    # six more requests.
    per_service = []
    for row in conn.execute("select * from services order by letter"):
        counts = conn.execute(
            "select count(*) as issued, "
            "  sum(case when status = 'completed' then 1 else 0 end) as served, "
            "  sum(case when status = 'waiting' then 1 else 0 end) as waiting "
            "from tickets where service_id = ?",
            (row["service_id"],),
        ).fetchone()
        measured, measured_samples = service_time(conn, row["service_id"])
        per_service.append({
            "id": row["letter"],
            "letter": row["letter"],
            "name": row["name"],
            "is_active": bool(row["is_active"]),
            "issued": counts["issued"] or 0,
            "served": counts["served"] or 0,
            "waiting": counts["waiting"] or 0,
            "average_service_seconds": measured,
            "service_samples": measured_samples,
        })

    # The target is a promise the service makes about itself, so the page can say
    # how often it was kept over the same tickets it already measured.
    profile = service or conn.execute(
        "select * from services order by letter limit 1"
    ).fetchone()
    target = profile["target_seconds"] if profile is not None else None
    within_target = None
    if target is not None and durations:
        within_target = round(
            sum(1 for seconds in durations if seconds <= target) * 100 / len(durations)
        )

    return jsonify(
        totals={
            "issued": issued,
            "served": served,
            "no_shows": no_shows,
            "cancelled": totals["cancelled"] or 0,
            "waiting": totals["waiting"] or 0,
            # Only over the tickets that were actually decided, so a queue that
            # is still standing does not read as a rate of anything.
            "no_show_percent": round(no_shows * 100 / issued) if issued else 0,
        },
        per_day=per_day,
        hours=hours,
        histogram=histogram,
        median_service_seconds=ordered[len(ordered) // 2] if ordered else None,
        average_service_seconds=average,
        service_samples=samples,
        per_service=per_service,
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
