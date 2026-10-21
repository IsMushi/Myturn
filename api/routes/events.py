"""The event stream: the queue pushed to the pages that watch it.

One open connection replaces the requests the ticket page and the waiting-room
display used to repeat every few seconds. Whenever something changes, the route
that changed it calls broadcast.signal(), the stream wakes, reads the settled
state out of the database and sends it on.

Server-Sent Events rather than WebSockets: the browser reaches the API through
the same HTTP origin, which a WebSocket upgrade would not survive the proxy in
front of it, and a queue only ever needs updates in one direction.
"""
import json
import queue

from flask import Blueprint, Response, current_app, request, stream_with_context

from broadcast import subscribe, unsubscribe
from db import connect, get_db
from routes.public import state_payload
from routes.visitor import ticket_payload

bp = Blueprint("events", __name__)

# How long a silent stream waits before proving it is still there. A comment is
# ignored by EventSource, so nothing is delivered but the socket stays warm.
HEARTBEAT_SECONDS = 15

# What the browser should wait before reconnecting, in milliseconds.
RECONNECT_SECONDS = 3


def _frame(state, ticket):
    """One SSE message: the queue, and the visitor's ticket when they have one."""
    payload = {"state": state, "ticket": ticket}
    return f"event: queue\ndata: {json.dumps(payload)}\n\n"


@bp.get("/api/events")
def events():
    """Stream the queue to whoever is watching it.

    With `?ticket=<token>` the stream also carries that one ticket, so a
    visitor's page needs a single connection to follow both their number and
    the desk around it.
    """
    token = request.args.get("ticket") or None

    # A token that is not on file is worth saying before the stream opens: a
    # 404 makes the browser stop rather than reconnect to a ticket that is gone.
    if token is not None and ticket_payload(get_db(), token) is None:
        return Response(status=404)

    def stream():
        # The stream outlives the request that started it, so it opens its own
        # connection rather than holding on to the request's.
        conn = connect(current_app.config["DATABASE"])
        channel = subscribe()
        try:
            yield f"retry: {RECONNECT_SECONDS * 1000}\n\n"
            yield _frame(state_payload(conn), ticket_payload(conn, token) if token else None)

            while True:
                try:
                    channel.get(timeout=HEARTBEAT_SECONDS)
                except queue.Empty:
                    yield ": keep-alive\n\n"
                    continue
                yield _frame(
                    state_payload(conn), ticket_payload(conn, token) if token else None
                )
        finally:
            unsubscribe(channel)
            conn.close()

    return Response(
        stream_with_context(stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
