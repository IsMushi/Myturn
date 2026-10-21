"""The hold rule, and the board's part in it.

A called number keeps its place for `MYTURN_HOLD_SECONDS`. That is the safe
default, and it is all the system promises when the board is silent.

The board may shorten it, but only with evidence: a reading since the call, a
device that is still reporting, nobody at the counter and no approach. Every
missing piece falls back to the full hold, because absence of data is not
absence of a person. The board measures; the server decides.

With several desks, the evidence is per counter. A call made at Desk 1 is not
shortened by a board at Desk 2, and a sweep works through every desk that has
left a call hanging.
"""
from datetime import datetime, timedelta, timezone

from flask import current_app

from broadcast import signal
from journal import log_event
from util import seconds_since


def counter_occupied(conn, desk_id, apply_obstruction=True):
    """Whether the counter currently reads as occupied.

    Returns True, False, or None when there is no usable reading. The board
    is evidence, not authority: an offline board or a missing report means
    "nobody knows", which is not the same as "somebody is there", and the
    caller must not block the desk on data that is not there.

    A bag left on the desk reads as occupied for as long as it sits there,
    and a desk that cannot call anybody is a desk that has stopped working.
    An object that has not moved, and that no approach was ever seen near, is
    therefore an obstruction and does not block the desk. A visitor who walked
    up and then stood still brought an approach with them, and is never
    written off as a bag.
    """
    device = conn.execute(
        "select device_id, last_seen from devices where desk_id = ? "
        "order by device_id limit 1",
        (desk_id,),
    ).fetchone()
    if device is None or device["last_seen"] is None:
        return None
    age = seconds_since(device["last_seen"])
    if age is None or age > current_app.config["DEVICE_ONLINE_SECONDS"]:
        return None
    report = conn.execute(
        "select occupied from device_reports where device_id = ? "
        "order by report_id desc limit 1",
        (device["device_id"],),
    ).fetchone()
    if report is None:
        return None
    if not report["occupied"]:
        return False
    if apply_obstruction and _is_obstruction(conn, device["device_id"]):
        return False
    return True


def _is_obstruction(conn, device_id):
    """Whether what is at the counter has sat still long enough to be an
    obstruction rather than a visitor.

    Two things have to be true together. The distance must not have moved: an
    object that is still is still, whatever it is. And no approach may have
    been seen anywhere in the window: a visitor who came to the counter and
    then stood still brought an approach with them, and the desk must not
    call the next person over them.

    A faulty sensor, a missing reading or an object that only arrived during
    the window all mean "not enough to say", and the answer is no: the
    counter stays occupied, because guessing here would let a call go out
    over somebody who is there.
    """
    window = current_app.config["OBSTRUCTION_SECONDS"]
    tolerance = current_app.config["OBSTRUCTION_TOLERANCE_CM"]
    if window <= 0:
        return False
    since = (datetime.now(timezone.utc) - timedelta(seconds=window)).isoformat(
        timespec="seconds"
    )
    readings = conn.execute(
        "select distance_cm, occupied, approach from device_reports "
        "where device_id = ? and reported_at >= ? order by report_id",
        (device_id, since),
    ).fetchall()
    if len(readings) < 3:
        return False  # not enough history to call anything an obstruction
    distances = []
    for row in readings:
        if row["distance_cm"] is None or row["distance_cm"] < 0:
            return False  # a faulty sensor says nothing about this
        if row["approach"]:
            return False  # something moved: that is a visitor, not a bag
        if not row["occupied"]:
            return False  # it only arrived during the window
        distances.append(row["distance_cm"])
    return (max(distances) - min(distances)) <= tolerance


def _evidence(conn, called):
    """Whether the calling desk's board is fresh, and its readings since the call."""
    if called["desk_id"] is None:
        return False, []

    device = conn.execute(
        "select device_id, last_seen from devices where desk_id = ? "
        "order by device_id limit 1",
        (called["desk_id"],),
    ).fetchone()
    if device is None or device["last_seen"] is None:
        return False, []

    age = seconds_since(device["last_seen"])
    if age is None or age > current_app.config["DEVICE_ONLINE_SECONDS"]:
        return False, []

    readings = conn.execute(
        "select occupied, approach, distance_cm, reported_at from device_reports "
        "where device_id = ? and reported_at >= ? order by report_id",
        (device["device_id"], called["called_at"]),
    ).fetchall()
    # A live transport does not prove a live sensor. Settings requests or socket
    # heartbeats must never make an old/faulted ultrasonic reading trustworthy.
    if readings:
        report_age = seconds_since(readings[-1]["reported_at"])
        if report_age is None or report_age > current_app.config["DEVICE_ONLINE_SECONDS"]:
            return False, []
    return True, readings


def hold_limit(conn, called):
    """How long this call may run, and why.

    Returns `(seconds, shortened, reason)`. The reason is written for the desk:
    it names what the board saw, so a shortened hold is explainable rather than
    looking like the timer changed its mind.
    """
    full = current_app.config["HOLD_SECONDS"]
    short = min(full, current_app.config["MIN_CALL_SECONDS"])
    waited = seconds_since(called["called_at"])
    if waited is None:
        return full, False, "the call time is unreadable"
    if waited < current_app.config["MIN_GRACE_SECONDS"]:
        return full, False, "the visitor is still walking up"

    fresh, readings = _evidence(conn, called)
    if not fresh:
        return full, False, "the board is not reporting"
    if not readings:
        return full, False, "no reading since the call"
    if any(row["distance_cm"] is None or row["distance_cm"] < 0 for row in readings):
        return full, False, "the sensor measurement is unavailable"
    if any(row["approach"] for row in readings):
        return full, False, "an approach was seen"
    if any(row["occupied"] for row in readings):
        return full, False, "the counter is occupied"
    if short >= full:
        return full, False, "the counter is empty"
    return short, True, "the counter is empty"


def requeue(conn, called, detail):
    """Give a called ticket a new number at the back of *its own* queue.

    The caller owns the transaction, so the new counter value, the updated
    ticket and the event that records both land together. The number comes from
    the service's own counter, so A numbers stay A numbers.
    """
    row = conn.execute(
        "select t.service_id, s.letter from tickets t "
        "join services s on s.service_id = t.service_id "
        "where t.ticket_id = ?",
        (called["ticket_id"],),
    ).fetchone()
    counter = "ticket:" + row["letter"]
    found = conn.execute(
        "select value from counters where name = ?", (counter,)
    ).fetchone()
    if found is None:
        conn.execute("insert into counters (name, value) values (?, 0)", (counter,))
        seq = 1
    else:
        seq = found["value"] + 1
    conn.execute("update counters set value = ? where name = ?", (seq, counter))
    conn.execute(
        "update tickets set ticket_no = ?, status = 'waiting', called_at = null, "
        "desk_id = null where ticket_id = ?",
        (seq, called["ticket_id"]),
    )
    log_event(conn, called["ticket_id"], "requeued", "system", detail)
    return seq


def sweep_queue(conn):
    """Requeue every expired call, even if nobody has pressed anything.

    Runs at the top of the reads that care about the queue, so a desk left
    unattended recovers by itself. Returns True when it moved a ticket.
    """
    called_rows = conn.execute(
        "select ticket_id, ticket_no, called_at, desk_id from tickets "
        "where status = 'called'"
    ).fetchall()

    moved = False
    for called in called_rows:
        limit, _, _ = hold_limit(conn, called)
        waited = seconds_since(called["called_at"])
        if waited is None or waited < limit:
            continue
        if _sweep_one(conn, called):
            moved = True

    if moved:
        # The queue moved without anyone touching a desk, so every page
        # watching it has to hear about it.
        signal()
    return moved


def _sweep_one(conn, called):
    """Move one expired call, re-reading it inside the write transaction."""
    conn.execute("begin immediate")
    try:
        current = conn.execute(
            "select ticket_id, ticket_no, called_at, desk_id from tickets "
            "where ticket_id = ? and status = 'called'",
            (called["ticket_id"],),
        ).fetchone()
        if current is None:
            conn.execute("commit")
            return False

        limit, shortened, _ = hold_limit(conn, current)
        waited = seconds_since(current["called_at"])
        if waited is None or waited < limit:
            conn.execute("commit")
            return False

        requeue(
            conn,
            current,
            "counter empty; hold ended early" if shortened else "hold time ended",
        )
        conn.execute("commit")
        return True
    except Exception:
        conn.execute("rollback")
        raise
