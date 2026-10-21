"""One line in the queue's history.

`ticket_events` is the record of how a ticket reached its current state. The
desk routes and the queue rules both write to it, so the insert lives here
rather than in either of them.
"""
from util import now


def log_event(conn, ticket_id, event_type, actor, detail=None):
    conn.execute(
        "insert into ticket_events "
        "(ticket_id, event_type, detail, event_time, actor) values (?, ?, ?, ?, ?)",
        (ticket_id, event_type, detail, now(), actor or "system"),
    )
