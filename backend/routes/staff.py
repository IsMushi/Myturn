"""Staff routes: the working end of the system.

Everything that changes a ticket or the desk lives here, behind a session, so
the same rules apply whichever client calls them.
"""
from flask import Blueprint, current_app, jsonify, request, session

from db import get_db
from security import check_staff_password, staff_required
from util import now, seconds_since

bp = Blueprint("staff", __name__)

# The actions a staff member may apply to one ticket.
ACTIONS = {
    "complete": "completed",
    "skip": "skipped",
    "cancel": "cancelled",
}

SERVICE_STATES = ("active", "paused", "closed")


def log_event(conn, ticket_id, event_type, actor):
    conn.execute(
        "insert into ticket_events (ticket_id, event_type, event_time, actor) "
        "values (?, ?, ?, ?)",
        (ticket_id, event_type, now(), actor),
    )


@bp.post("/api/staff/login")
def login():
    data = request.get_json(silent=True) or {}
    if not check_staff_password(data.get("password")):
        return jsonify(error="wrong password"), 401

    name = str(data.get("name") or "staff").strip()[:40] or "staff"
    session.clear()
    session["staff"] = name
    session.permanent = True
    return jsonify(staff=name)


@bp.post("/api/staff/logout")
@staff_required
def logout():
    session.clear()
    return jsonify(ok=True)


@bp.get("/api/staff/queue")
@staff_required
def queue():
    """The waiting line, the desk state, the current call and the last report."""
    conn = get_db()

    waiting = conn.execute(
        "select ticket_id, ticket_no, created_at from tickets "
        "where status = 'waiting' order by ticket_no"
    ).fetchall()
    called = conn.execute(
        "select ticket_id, ticket_no, created_at, called_at from tickets "
        "where status = 'called' limit 1"
    ).fetchone()
    setting = conn.execute(
        "select service_state, updated_at, updated_by from desk_settings "
        "order by setting_id desc limit 1"
    ).fetchone()
    device = conn.execute(
        "select label, last_seen from devices order by device_id limit 1"
    ).fetchone()
    report = conn.execute(
        "select distance_cm, occupied, approach, led_state, reported_at "
        "from device_reports order by report_id desc limit 1"
    ).fetchone()

    info = None
    if device is not None:
        last_seen_age = seconds_since(device["last_seen"])
        report_age = seconds_since(report["reported_at"]) if report else None
        info = {
            "label": device["label"],
            "last_seen": device["last_seen"],
            "online": last_seen_age is not None
            and last_seen_age <= current_app.config["DEVICE_ONLINE_SECONDS"],
            "distance_cm": report["distance_cm"] if report else None,
            "occupied": bool(report["occupied"]) if report else False,
            "led_state": report["led_state"] if report else None,
            "reported_at": report["reported_at"] if report else None,
            # An approach only counts while the reading is fresh.
            "approach": bool(report and report["approach"])
            and report_age is not None
            and report_age <= current_app.config["APPROACH_WINDOW_SECONDS"],
        }

    hold = current_app.config["HOLD_SECONDS"]
    seconds_called = seconds_since(called["called_at"]) if called else None

    return jsonify(
        service_state=setting["service_state"] if setting else "paused",
        service_updated_by=setting["updated_by"] if setting else None,
        service_updated_at=setting["updated_at"] if setting else None,
        waiting=len(waiting),
        queue=[dict(row) for row in waiting],
        called=dict(called) if called else None,
        hold_seconds=hold,
        seconds_called=seconds_called,
        hold_remaining=(
            max(0, int(hold - seconds_called)) if seconds_called is not None else None
        ),
        device=info,
        server_time=now(),
    )


@bp.post("/api/staff/call-next")
@staff_required
def call_next():
    """Call the next waiting ticket, inside one transaction.

    A ticket that is still called keeps its place while the hold time runs, so a
    visitor who steps away does not lose the turn immediately. Once the hold time
    has passed, the missed number is re-issued at the back of the queue and the
    next ticket is called, so an absent visitor can never block the desk.
    """
    conn = get_db()
    hold = current_app.config["HOLD_SECONDS"]
    actor = session["staff"]

    conn.execute("begin immediate")
    try:
        current = conn.execute(
            "select ticket_id, ticket_no, called_at from tickets where status = 'called'"
        ).fetchone()

        if current is not None:
            waited = seconds_since(current["called_at"]) or 0
            if waited < hold:
                conn.execute("commit")
                return jsonify(
                    error="a ticket is already being called",
                    ticket_no=current["ticket_no"],
                    hold_remaining=int(hold - waited),
                ), 409

            # Back of the queue, with a fresh number so FCFS order still holds.
            seq = conn.execute(
                "select value from counters where name = 'ticket'"
            ).fetchone()["value"] + 1
            conn.execute("update counters set value = ? where name = 'ticket'", (seq,))
            conn.execute(
                "update tickets set ticket_no = ?, status = 'waiting', called_at = null "
                "where ticket_id = ?",
                (seq, current["ticket_id"]),
            )
            log_event(conn, current["ticket_id"], "requeued", "system")

        row = conn.execute(
            "select ticket_id, ticket_no from tickets where status = 'waiting' "
            "order by ticket_no limit 1"
        ).fetchone()
        if row is None:
            conn.execute("commit")
            return jsonify(error="no ticket is waiting"), 404

        conn.execute(
            "update tickets set status = 'called', called_at = ? where ticket_id = ?",
            (now(), row["ticket_id"]),
        )
        log_event(conn, row["ticket_id"], "called", actor)
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    return jsonify(ticket_no=row["ticket_no"], ticket_id=row["ticket_id"], called_by=actor)


@bp.post("/api/staff/tickets/<int:ticket_id>/action")
@staff_required
def ticket_action(ticket_id):
    """Complete, skip or cancel one ticket."""
    data = request.get_json(silent=True) or {}
    action = str(data.get("action") or "")
    if action not in ACTIONS:
        return jsonify(error="action must be complete, skip or cancel"), 400

    status = ACTIONS[action]
    actor = session["staff"]
    conn = get_db()

    conn.execute("begin immediate")
    try:
        row = conn.execute(
            "select ticket_no, status from tickets where ticket_id = ?", (ticket_id,)
        ).fetchone()
        if row is None:
            conn.execute("rollback")
            return jsonify(error="unknown ticket"), 404
        if row["status"] in ("completed", "skipped", "cancelled"):
            conn.execute("rollback")
            return jsonify(error="ticket is already closed"), 409

        conn.execute(
            "update tickets set status = ?, closed_at = ? where ticket_id = ?",
            (status, now(), ticket_id),
        )
        log_event(conn, ticket_id, status, actor)
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    return jsonify(ticket_no=row["ticket_no"], status=status, actor=actor)


@bp.post("/api/staff/service")
@staff_required
def set_service():
    """Pause, resume or close the desk and record who changed the setting."""
    data = request.get_json(silent=True) or {}
    state = str(data.get("service_state") or "")
    if state not in SERVICE_STATES:
        return jsonify(error="service_state must be active, paused or closed"), 400

    actor = session["staff"]
    conn = get_db()
    conn.execute(
        "insert into desk_settings (service_state, updated_at, updated_by) values (?, ?, ?)",
        (state, now(), actor),
    )
    return jsonify(service_state=state, updated_by=actor, updated_at=now())
