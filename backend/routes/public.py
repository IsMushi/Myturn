"""Public route: the state shown on the screen in the waiting area.

No token and no account, so the page can sit on a tablet on the wall.
"""
from flask import Blueprint, jsonify

from db import get_db
from routes.visitor import desk_state
from util import now

bp = Blueprint("public", __name__)


@bp.get("/api/public/state")
def public_state():
    conn = get_db()
    called = conn.execute(
        "select ticket_no, called_at from tickets where status = 'called' "
        "order by called_at desc limit 1"
    ).fetchone()
    waiting = conn.execute(
        "select count(*) as c from tickets where status = 'waiting'"
    ).fetchone()["c"]

    return jsonify(
        called_no=called["ticket_no"] if called else None,
        called_at=called["called_at"] if called else None,
        waiting=waiting,
        service_state=desk_state(conn),
        server_time=now(),
    )
