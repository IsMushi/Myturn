"""Public route: the state shown on the screen in the waiting area.

No token and no account, so the page can sit on a tablet on the wall. One
screen shows every service, because one office may run several queues.
"""
from flask import Blueprint, jsonify

from db import get_db
from queue_rules import sweep_queue
from routes.visitor import service_info
from util import now

bp = Blueprint("public", __name__)


def state_payload(conn):
    """The waiting-room state as a plain dict.

    Kept apart from the route so the same answer can be sent both as JSON and
    over the event stream, from one place, rather than two that could drift.

    The first-service fields (`called_no`, `service_state`, ...) are kept for
    older pages and checks. New pages read `services`.
    """
    # This is the one read every watching page and the wall display make, so it
    # is also where an expired call is recovered when a desk is unattended.
    sweep_queue(conn)

    services = [
        service_info(conn, row)
        for row in conn.execute(
            "select * from services where is_active = 1 order by letter"
        ).fetchall()
    ]
    first = services[0] if services else None
    primary = first["now_serving"][0] if first and first["now_serving"] else None

    return dict(
        services=services,
        # Compatibility projections of the first service on the board.
        called_no=primary["ticket_no"] if primary else None,
        called_at=primary["called_at"] if primary else None,
        waiting=sum(service["waiting"] for service in services),
        service_state=first["service_state"] if first else "closed",
        average_service_seconds=first["average_service_seconds"] if first else None,
        service_samples=first["service_samples"] if first else 0,
        server_time=now(),
    )


@bp.get("/api/public/state")
def public_state():
    return jsonify(state_payload(get_db()))
