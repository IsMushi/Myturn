"""Visitor routes: taking a ticket and following it.

These routes are open, because the visitor page is reached from a QR code and
needs no account. They never change a ticket that is already called.
"""
import secrets

from flask import Blueprint, jsonify, request

from db import get_db
from util import now

bp = Blueprint("visitor", __name__)


def desk_state(conn):
    """The most recent service setting, or paused before one is recorded."""
    row = conn.execute(
        "select service_state from desk_settings order by setting_id desc limit 1"
    ).fetchone()
    return row["service_state"] if row else "paused"


def tickets_ahead(conn, ticket_no):
    return conn.execute(
        "select count(*) as c from tickets where status = 'waiting' and ticket_no < ?",
        (ticket_no,),
    ).fetchone()["c"]


@bp.post("/api/tickets")
def create_ticket():
    """Issue the next number and return it with a private access token."""
    data = request.get_json(silent=True) or {}
    source = str(data.get("source") or "qr")[:20]
    conn = get_db()

    # One writer at a time, so two visitors cannot receive the same number.
    conn.execute("begin immediate")
    try:
        seq = conn.execute(
            "select value from counters where name = 'ticket'"
        ).fetchone()["value"] + 1
        conn.execute("update counters set value = ? where name = 'ticket'", (seq,))
        token = secrets.token_urlsafe(16)
        created = now()
        cur = conn.execute(
            "insert into tickets (ticket_no, status, source, access_token, created_at) "
            "values (?, 'waiting', ?, ?, ?)",
            (seq, source, token, created),
        )
        conn.execute(
            "insert into ticket_events (ticket_id, event_type, event_time, actor) "
            "values (?, 'created', ?, 'system')",
            (cur.lastrowid, created),
        )
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    return jsonify(
        ticket_no=seq,
        ahead=tickets_ahead(conn, seq),
        token=token,
        service_state=desk_state(conn),
    ), 201


@bp.get("/api/tickets/<token>")
def ticket_state(token):
    """The number, the state of the ticket and how many tickets are ahead."""
    conn = get_db()
    row = conn.execute(
        "select ticket_id, ticket_no, status, created_at, called_at "
        "from tickets where access_token = ?",
        (token,),
    ).fetchone()
    if row is None:
        return jsonify(error="unknown ticket"), 404

    return jsonify(
        ticket_no=row["ticket_no"],
        status=row["status"],
        ahead=tickets_ahead(conn, row["ticket_no"]),
        created_at=row["created_at"],
        called_at=row["called_at"],
        service_state=desk_state(conn),
    )
