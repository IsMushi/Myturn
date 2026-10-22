"""Staff routes: the working end of the system.

Everything that changes a ticket or a desk lives here, behind a session, so the
same rules apply whichever client calls them. Committed changes signal the
shared broadcast; browser streams and device WebSockets read the settled state.
"""
import secrets
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request, session

from broadcast import signal
from db import get_db
from journal import log_event
from queue_rules import (
    counter_occupied,
    hold_limit,
    is_obstruction,
    requeue,
    sweep_queue,
)
from routes.visitor import desk_state, service_info, service_time, ticket_label
from security import (
    check_staff_password,
    csrf_required,
    current_actor,
    ensure_csrf,
    rate_limit,
    staff_required,
)
from util import local_date, local_midnight, local_sql, now, seconds_since, soon
from sms import notify_called

bp = Blueprint("staff", __name__)

# The actions a staff member may apply to one ticket.
ACTIONS = {
    "complete": "completed",
    "skip": "skipped",
    "cancel": "cancelled",
}

SERVICE_STATES = ("active", "paused", "closed")

# How long a desk may take back its last decision. Short on purpose: it is there
# for a misclick, not for rewriting the afternoon.
UNDO_SECONDS = 10

# ---------------------------------------------------------------------------
# reading the desk
# ---------------------------------------------------------------------------
def _desk_id(conn):
    """The counter this request is about.

    The dashboard sends the chosen counter; a command line or an older client
    that sends nothing gets the first counter, which is what the single-desk
    prototype used to be.
    """
    data = request.get_json(silent=True) or {}
    raw = data.get("desk", request.args.get("desk"))
    if raw not in (None, ""):
        try:
            wanted = int(raw)
        except (TypeError, ValueError):
            return None
        row = conn.execute(
            "select desk_id from desks where desk_id = ?", (wanted,)
        ).fetchone()
        return row["desk_id"] if row is not None else None

    row = conn.execute("select desk_id from desks order by desk_id limit 1").fetchone()
    return row["desk_id"] if row is not None else None


def _desk_row(conn, desk_id):
    return conn.execute(
        "select d.desk_id, d.name, d.is_active, d.service_id, "
        "       s.letter as service_letter, s.name as service_name "
        "from desks d join services s on s.service_id = d.service_id "
        "where d.desk_id = ?",
        (desk_id,),
    ).fetchone()


def _desk_occupied(conn, desk_id):
    """Whether the desk's board currently reports the counter as occupied.

    Returns True when a fresh report says someone is at the counter, False when
    a fresh report says it is free, and None when there is no board or the
    board is offline -- in which case the caller must not be blocked on data
    that is not there.

    An object that has sat still at the counter, with no approach ever seen
    near it, is an obstruction rather than a visitor and does not block the
    desk. The rule lives in `queue_rules.counter_occupied`.

    The hold rule keeps its own, stricter reading: there, an occupied counter
    is evidence *for* keeping the number, and shortening a hold is the
    generous act, so nothing is relaxed there.
    """
    return counter_occupied(conn, desk_id)


def _setting(conn, desk_id):
    """The most recent state this counter was set to, or paused before one."""
    return conn.execute(
        "select service_state, updated_at, updated_by, pause_reason, paused_until "
        "from desk_settings where desk_id = ? order by setting_id desc limit 1",
        (desk_id,),
    ).fetchone()


def _device_online(conn, desk_id):
    device = conn.execute(
        "select last_seen from devices where desk_id = ? order by device_id limit 1",
        (desk_id,),
    ).fetchone()
    if device is None or device["last_seen"] is None:
        return False
    age = seconds_since(device["last_seen"])
    return age is not None and age <= current_app.config["DEVICE_ONLINE_SECONDS"]


def _desk_payload(conn, row):
    """One counter as both the picker and the queue header describe it."""
    setting = _setting(conn, row["desk_id"])
    waiting = conn.execute(
        "select count(*) as c from tickets where service_id = ? and status = 'waiting'",
        (row["service_id"],),
    ).fetchone()["c"]
    return {
        "desk_id": row["desk_id"],
        "name": row["name"],
        "is_active": bool(row["is_active"]),
        "service_id": row["service_id"],
        "service_letter": row["service_letter"],
        "service_name": row["service_name"],
        "service_state": setting["service_state"] if setting else "paused",
        "pause_reason": setting["pause_reason"] if setting else None,
        "paused_until": setting["paused_until"] if setting else None,
        "waiting": waiting,
        "device_online": _device_online(conn, row["desk_id"]),
    }


def _device_payload(conn, desk_id):
    """The board attached to this counter, with its latest reading."""
    device = conn.execute(
        "select * from devices where desk_id = ? order by device_id limit 1",
        (desk_id,),
    ).fetchone()
    if device is None:
        return None

    report = conn.execute(
        "select * from device_reports where device_id = ? "
        "order by report_id desc limit 1",
        (device["device_id"],),
    ).fetchone()

    online_age = seconds_since(device["last_seen"])
    online = (
        online_age is not None
        and online_age <= current_app.config["DEVICE_ONLINE_SECONDS"]
    )

    # An approach is news for a few seconds only. A report that said "somebody
    # is walking up" a minute ago says nothing about the counter now.
    approach = False
    if report is not None and report["approach"]:
        approach_age = seconds_since(report["reported_at"])
        approach = (
            approach_age is not None
            and approach_age <= current_app.config["APPROACH_WINDOW_SECONDS"]
        )

    # The desk can be told *why* an occupied counter is still callable. Without
    # this the person at the counter sees red and cannot explain why the call
    # went through - or why it did not.
    obstruction = False
    if report is not None and report["occupied"]:
        obstruction = is_obstruction(conn, device["device_id"])

    return {
        "label": device["label"],
        "chip_id": device["chip_id"],
        "mac_address": device["mac_address"],
        "last_seen": device["last_seen"],
        "online": online,
        "distance_cm": report["distance_cm"] if report is not None else None,
        "occupied": bool(report["occupied"]) if report is not None else False,
        "led_state": report["led_state"] if report is not None else None,
        "reported_at": report["reported_at"] if report is not None else None,
        "approach": approach,
        "obstruction": obstruction,
        "obstruction_seconds": current_app.config["OBSTRUCTION_SECONDS"],
    }


def _chart_range():
    """The days the two dashboard charts cover, and their labels.

    A preset is a number of days ending today; a custom range is two dates the
    page sent. Anything unreadable falls back to the week, so a mistyped query
    still draws a chart rather than an error. Today is Kigali's today, because
    the office is in Kigali.
    """
    today = local_date()
    raw_from = (request.args.get("from") or "").strip()
    raw_to = (request.args.get("to") or "").strip()

    if raw_from and raw_to:
        try:
            start = date.fromisoformat(raw_from)
            end = date.fromisoformat(raw_to)
        except ValueError:
            start = end = None
        if start is not None and end is not None and start <= end:
            if (end - start).days <= 366:
                return (
                    {"days": None, "from": start.isoformat(), "to": end.isoformat()},
                    start,
                    end,
                )

    try:
        days = int(request.args.get("days") or 7)
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(days, 90))
    end = today
    start = today - timedelta(days=days - 1)
    return (
        {"days": days, "from": start.isoformat(), "to": end.isoformat()},
        start,
        end,
    )


def _charts(conn, service_id):
    """The two figures for one queue, counted from the rows already written."""
    outcomes = conn.execute(
        "select "
        "  sum(case when status = 'completed' then 1 else 0 end) as served, "
        "  sum(case when status = 'skipped' then 1 else 0 end) as no_shows, "
        "  sum(case when status = 'cancelled' then 1 else 0 end) as cancelled, "
        "  sum(case when status = 'waiting' then 1 else 0 end) as waiting "
        "from tickets where service_id = ?",
        (service_id,),
    ).fetchone()

    described, start, end = _chart_range()

    single_day = start == end

    if single_day:
        # A single day is shown by the hour, so the person at the desk can see
        # when the queue was busy instead of one flat bar for the whole day.
        counted = {
            row["hour"]: row
            for row in conn.execute(
                "select substr(" + local_sql("created_at") + ", 1, 13) as hour, "
                "count(*) as issued, "
                "  sum(case when status = 'completed' then 1 else 0 end) as served "
                "from tickets where service_id = ? "
                "  and substr(" + local_sql("created_at") + ", 1, 10) = ? "
                "group by hour",
                (service_id, start.isoformat()),
            )
        }
        per_day = []
        for hour in range(24):
            key = "%s %02d:00" % (start.isoformat(), hour)
            short = "%02d:00" % hour
            row = counted.get("%s %02d" % (start.isoformat(), hour))
            per_day.append(
                {
                    "day": short,
                    "issued": row["issued"] if row is not None else 0,
                    "served": (row["served"] or 0) if row is not None else 0,
                }
            )
    else:
        counted = {
            row["day"]: row
            for row in conn.execute(
                "select substr(" + local_sql("created_at") + ", 1, 10) as day, "
                "count(*) as issued, "
                "  sum(case when status = 'completed' then 1 else 0 end) as served "
                "from tickets where service_id = ? "
                "  and substr(" + local_sql("created_at") + ", 1, 10) between ? and ? "
                "group by day",
                (service_id, start.isoformat(), end.isoformat()),
            )
        }

        per_day = []
        day = start
        while day <= end:
            key = day.isoformat()
            row = counted.get(key)
            per_day.append(
                {
                    "day": key,
                    "issued": row["issued"] if row is not None else 0,
                    "served": (row["served"] or 0) if row is not None else 0,
                }
            )
            day += timedelta(days=1)

    described["granularity"] = "hour" if single_day else "day"

    return {
        "outcomes": {
            "served": outcomes["served"] or 0,
            "no_shows": outcomes["no_shows"] or 0,
            "cancelled": outcomes["cancelled"] or 0,
            "waiting": outcomes["waiting"] or 0,
        },
        "per_day": per_day,
        "range": described,
    }


def _tally(conn, actor):
    """What this person has worked through since midnight.

    Counted from the event log rather than the ticket rows, so taking a
    mistaken decision back also takes it back out of the tally. Midnight is
    Kigali's midnight, not UTC's, so a shift that starts at one in the morning
    is counted from there.
    """
    midnight = local_midnight()
    if actor:
        counts = conn.execute(
            "select "
            "  sum(case when event_type = 'completed' then 1 else 0 end) as served, "
            "  sum(case when event_type = 'skipped' then 1 else 0 end) as no_shows "
            "from ticket_events where actor = ? and event_time >= ?",
            (actor, midnight),
        ).fetchone()
    else:
        counts = None
    return {
        "actor": actor,
        "served": (counts["served"] or 0) if counts is not None else 0,
        "no_shows": (counts["no_shows"] or 0) if counts is not None else 0,
    }


# ---------------------------------------------------------------------------
# signing in and out
# ---------------------------------------------------------------------------
@bp.post("/api/staff/login")
@rate_limit("staff-login", "LOGIN_ATTEMPTS", "LOGIN_WINDOW_SECONDS")
def login():
    data = request.get_json(silent=True) or {}
    if not check_staff_password(data.get("password")):
        return jsonify(error="that password is not right"), 401

    name = str(data.get("name") or "").strip()[:60] or "Desk"

    session.clear()
    session["staff"] = name
    session.permanent = True
    token = ensure_csrf()

    return jsonify(staff=name, csrf_token=token)


@bp.post("/api/staff/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# the desk's view
# ---------------------------------------------------------------------------
@bp.get("/api/staff/desks")
@staff_required
def desks():
    """Every counter, so the dashboard can ask which one this is."""
    conn = get_db()
    rows = conn.execute(
        "select d.desk_id, d.name, d.is_active, d.service_id, "
        "       s.letter as service_letter, s.name as service_name "
        "from desks d join services s on s.service_id = d.service_id "
        "order by d.desk_id"
    ).fetchall()
    return jsonify(
        desks=[_desk_payload(conn, row) for row in rows],
        server_time=now(),
    )


@bp.get("/api/staff/queue")
@staff_required
def queue():
    """One counter's queue: its waiting line, its call, its board.

    Reading the queue also gives the hold rule its chance to run, so a call
    nobody answered recovers by itself even when the desk is untouched.
    """
    conn = get_db()
    sweep_queue(conn)

    desk_id = _desk_id(conn)
    if desk_id is None:
        return jsonify(error="unknown desk"), 404

    row = _desk_row(conn, desk_id)
    if row is None:
        return jsonify(error="unknown desk"), 404

    service_row = conn.execute(
        "select * from services where service_id = ?", (row["service_id"],)
    ).fetchone()
    state = desk_state(conn, desk_id)
    setting = _setting(conn, desk_id)

    waiting = conn.execute(
        "select count(*) as c from tickets where service_id = ? and status = 'waiting'",
        (row["service_id"],),
    ).fetchone()["c"]

    line = conn.execute(
        "select ticket_id, ticket_no, created_at, contact from tickets "
        "where service_id = ? and status = 'waiting' order by ticket_no limit 100",
        (row["service_id"],),
    ).fetchall()

    called = conn.execute(
        "select ticket_id, ticket_no, called_at, desk_id, contact from tickets "
        "where desk_id = ? and status = 'called' order by called_at desc limit 1",
        (desk_id,),
    ).fetchone()

    hold_seconds = current_app.config["HOLD_SECONDS"]
    if called is not None:
        limit, shortened, reason = hold_limit(conn, called)
        waited = seconds_since(called["called_at"])
        seconds_called = max(0, round(waited)) if waited is not None else None
        hold_remaining = (
            max(0, round(limit - waited)) if waited is not None else None
        )
    else:
        limit, shortened, reason = hold_seconds, False, None
        seconds_called = None
        hold_remaining = None

    average, samples = service_time(conn, row["service_id"])

    return jsonify(
        desk=_desk_payload(conn, row),
        service=service_info(conn, service_row),
        service_state=state,
        service_updated_by=setting["updated_by"] if setting else None,
        service_updated_at=setting["updated_at"] if setting else None,
        waiting=waiting,
        queue=[
            {
                "ticket_id": ticket["ticket_id"],
                "ticket_no": ticket["ticket_no"],
                "label": ticket_label(row["service_letter"], ticket["ticket_no"]),
                "created_at": ticket["created_at"],
                "contact": ticket["contact"],
            }
            for ticket in line
        ],
        called=(
            {
                "ticket_id": called["ticket_id"],
                "ticket_no": called["ticket_no"],
                "label": ticket_label(row["service_letter"], called["ticket_no"]),
                "created_at": None,
                "called_at": called["called_at"],
                "contact": called["contact"],
            }
            if called is not None
            else None
        ),
        hold_seconds=hold_seconds,
        effective_hold_seconds=limit,
        hold_shortened=shortened,
        hold_reason=reason,
        undo_seconds=UNDO_SECONDS,
        seconds_called=seconds_called,
        hold_remaining=hold_remaining,
        tally=_tally(conn, current_actor()),
        charts=_charts(conn, row["service_id"]),
        average_service_seconds=average,
        service_samples=samples,
        device=_device_payload(conn, desk_id),
        server_time=now(),
    )


# ---------------------------------------------------------------------------
# calling and deciding
# ---------------------------------------------------------------------------
def _clear_expired_call(conn, desk_id):
    """Put an expired call back in its queue before this desk calls again.

    The caller owns the transaction. Returns a refusal while the desk is still
    inside a live call, and None when there was no call or it has been requeued.
    Shared by calling the next number and calling a chosen one, so the two can
    never disagree about when a call has run out.
    """
    called = conn.execute(
        "select ticket_id, ticket_no, called_at, desk_id from tickets "
        "where desk_id = ? and status = 'called'",
        (desk_id,),
    ).fetchone()
    if called is None:
        return None

    limit, shortened, _ = hold_limit(conn, called)
    waited = seconds_since(called["called_at"])
    if waited is None or waited < limit:
        remaining = max(0, round(limit - waited)) if waited is not None else 0
        return (
            jsonify(
                error="this desk is already calling a number",
                hold_remaining=remaining,
            ),
            409,
        )

    requeue(
        conn,
        called,
        "counter empty; hold ended early" if shortened else "hold time ended",
    )
    return None


@bp.post("/api/staff/call-next")
@staff_required
@csrf_required
def call_next():
    """Call the next number of this desk's service, inside one transaction.

    A call that has outlived its hold is put back at the end of its own queue
    first, so the desk is never blocked by somebody who walked away.
    """
    conn = get_db()
    desk_id = _desk_id(conn)
    if desk_id is None:
        return jsonify(error="unknown desk"), 404

    row = _desk_row(conn, desk_id)
    if row is None:
        return jsonify(error="unknown desk"), 404

    state = desk_state(conn, desk_id)
    if state != "active":
        return (
            jsonify(error="that desk is %s" % state),
            409,
        )

    # A desk that still has someone at the counter must not call the next
    # visitor: the person being served has not left yet. The board is evidence,
    # not authority, so when it is offline or has not reported we fall back to
    # allowing the call rather than blocking the desk on missing data.
    occupied = _desk_occupied(conn, desk_id)
    if occupied is True:
        return (
            jsonify(error="the counter is occupied; wait for it to clear"),
            409,
        )

    # A desk may only hold one call at a time, so calling the next is only
    # possible once the current one has been closed. When nothing is being
    # called yet, the first waiting ticket becomes the call.
    current = conn.execute(
        "select ticket_id, ticket_no, status from tickets "
        "where desk_id = ? and status = 'called'",
        (desk_id,),
    ).fetchone()
    if current is not None:
        return (
            jsonify(error="finish the current ticket before calling the next"),
            409,
        )

    conn.execute("begin immediate")
    try:
        conflict = _clear_expired_call(conn, desk_id)
        if conflict is not None:
            conn.execute("rollback")
            return conflict

        nxt = conn.execute(
            "select ticket_id, ticket_no, contact from tickets "
            "where service_id = ? and status = 'waiting' order by ticket_no limit 1",
            (row["service_id"],),
        ).fetchone()

        if nxt is None:
            conn.execute("rollback")
            return jsonify(error="nobody is waiting"), 409

        conn.execute(
            "update tickets set status = 'called', desk_id = ?, called_at = ? "
            "where ticket_id = ?",
            (desk_id, now(), nxt["ticket_id"]),
        )
        log_event(conn, nxt["ticket_id"], "called", current_actor())
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    signal()
    label = ticket_label(row["service_letter"], nxt["ticket_no"])
    notify_called(label, row["name"], nxt["contact"])
    return jsonify(
        ticket_no=nxt["ticket_no"],
        label=label,
        ticket_id=nxt["ticket_id"],
    )


@bp.get("/api/staff/tickets/search")
@staff_required
def search_tickets():
    """Find one of this service's tickets by the number on the visitor's phone.

    A number is only unique inside its service, so the search never crosses
    into another queue: the desk's own letter is accepted as typed and a number
    belonging to a different letter returns nothing. The window is today (the
    office's day) plus anything still waiting from an earlier day, because a
    ticket nobody has served is still findable. A bare number is read as a
    prefix, so "12" finds 12, 120 and 121.
    """
    conn = get_db()
    desk_id = _desk_id(conn)
    if desk_id is None:
        return jsonify(error="unknown desk"), 404
    row = _desk_row(conn, desk_id)
    if row is None:
        return jsonify(error="unknown desk"), 404

    query = str(request.args.get("q") or "").strip().upper()
    today = local_date().isoformat()
    answer = {
        "query": query,
        "service": {"id": row["service_letter"], "name": row["service_name"]},
        "today": today,
        "tickets": [],
    }

    letter = ""
    digits = query
    if query[:1].isalpha():
        letter, digits = query[:1], query[1:]
    if not digits.isdigit() or len(digits) > 6:
        return jsonify(ok=True, data=answer)
    if letter and letter != row["service_letter"]:
        return jsonify(ok=True, data=answer)

    found = conn.execute(
        "select t.ticket_id, t.ticket_no, t.status, t.created_at, t.called_at, "
        "       t.closed_at, d.name as desk_name "
        "from tickets t left join desks d on d.desk_id = t.desk_id "
        "where t.service_id = ? "
        "  and (substr(" + local_sql("t.created_at") + ", 1, 10) = ? "
        "       or t.status = 'waiting') "
        "  and cast(t.ticket_no as text) like ? "
        "order by t.ticket_no limit 20",
        (row["service_id"], today, str(int(digits)) + "%"),
    ).fetchall()

    answer["tickets"] = [
        {
            "ticket_id": ticket["ticket_id"],
            "ticket_no": ticket["ticket_no"],
            "label": ticket_label(row["service_letter"], ticket["ticket_no"]),
            "status": ticket["status"],
            "created_at": ticket["created_at"],
            "called_at": ticket["called_at"],
            "closed_at": ticket["closed_at"],
            "desk_name": ticket["desk_name"],
        }
        for ticket in found
    ]
    return jsonify(ok=True, server_time=now(), data=answer)


@bp.post("/api/staff/call")
@staff_required
@csrf_required
def call_chosen():
    """Call a chosen waiting ticket instead of the next one.

    The guards are the same as call-next, because the rules do not depend on
    how the number was picked: the desk must be open, the counter free, and a
    desk holds one call at a time. The ticket must be waiting for this desk's
    service; a number from another queue is refused rather than pulled across.
    """
    data = request.get_json(silent=True) or {}
    try:
        ticket_id = int(data.get("ticket_id"))
    except (TypeError, ValueError):
        return jsonify(error="choose a ticket to call"), 400

    conn = get_db()
    desk_id = _desk_id(conn)
    if desk_id is None:
        return jsonify(error="unknown desk"), 404
    row = _desk_row(conn, desk_id)
    if row is None:
        return jsonify(error="unknown desk"), 404

    state = desk_state(conn, desk_id)
    if state != "active":
        return jsonify(error="that desk is %s" % state), 409

    if _desk_occupied(conn, desk_id) is True:
        return (
            jsonify(error="the counter is occupied; wait for it to clear"),
            409,
        )

    # Service rule: a desk cannot call a ticket if it doesn't have a
    # current ticket being served. This ensures every desk is serving someone
    # before taking the next from the queue.
    current = conn.execute(
        "select ticket_id, ticket_no, status from tickets "
        "where desk_id = ? and status = 'called'",
        (desk_id,),
    ).fetchone()
    if current is None:
        return (
            jsonify(error="this desk has no current ticket; call first"),
            409,
        )

    conn.execute("begin immediate")
    try:
        conflict = _clear_expired_call(conn, desk_id)
        if conflict is not None:
            conn.execute("rollback")
            return conflict

        ticket = conn.execute(
            "select ticket_id, ticket_no, service_id, status, contact from tickets "
            "where ticket_id = ?",
            (ticket_id,),
        ).fetchone()
        if ticket is None:
            conn.execute("rollback")
            return jsonify(error="unknown ticket"), 404
        if ticket["service_id"] != row["service_id"]:
            conn.execute("rollback")
            return jsonify(error="that ticket is for another service"), 409

        words = {
            "called": "already being called",
            "completed": "already served",
            "skipped": "already marked as a no-show",
            "cancelled": "cancelled",
        }
        if ticket["status"] != "waiting":
            conn.execute("rollback")
            return (
                jsonify(
                    error="that ticket is %s"
                    % words.get(ticket["status"], ticket["status"]),
                    status=ticket["status"],
                ),
                409,
            )

        conn.execute(
            "update tickets set status = 'called', desk_id = ?, called_at = ? "
            "where ticket_id = ?",
            (desk_id, now(), ticket_id),
        )
        log_event(conn, ticket_id, "called", current_actor())
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    signal()
    label = ticket_label(row["service_letter"], ticket["ticket_no"])
    notify_called(label, row["name"], ticket["contact"])
    return jsonify(
        ticket_no=ticket["ticket_no"],
        label=label,
        ticket_id=ticket["ticket_id"],
    )


@bp.post("/api/staff/tickets/<int:ticket_id>/action")
@staff_required
@csrf_required
def ticket_action(ticket_id):
    """Complete, skip or cancel the ticket a desk is calling."""
    data = request.get_json(silent=True) or {}
    action = str(data.get("action") or "").strip()
    if action not in ACTIONS:
        return jsonify(error="unknown action"), 400

    conn = get_db()
    conn.execute("begin immediate")
    try:
        row = conn.execute(
            "select ticket_id, ticket_no, status from tickets where ticket_id = ?",
            (ticket_id,),
        ).fetchone()
        if row is None:
            conn.execute("rollback")
            return jsonify(error="unknown ticket"), 404
        if row["status"] != "called":
            conn.execute("rollback")
            return jsonify(error="that ticket is not being called"), 409

        outcome = ACTIONS[action]
        conn.execute(
            "update tickets set status = ?, closed_at = ? where ticket_id = ?",
            (outcome, now(), ticket_id),
        )
        log_event(conn, ticket_id, outcome, current_actor())
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    signal()
    return jsonify(ticket_no=row["ticket_no"], status=outcome)


@bp.post("/api/staff/tickets/<int:ticket_id>/recall")
@staff_required
@csrf_required
def recall(ticket_id):
    """Announce the current number again, and restart its hold time."""
    conn = get_db()
    conn.execute("begin immediate")
    try:
        row = conn.execute(
            "select ticket_id, ticket_no, status, contact, desk_id from tickets where ticket_id = ?",
            (ticket_id,),
        ).fetchone()
        if row is None:
            conn.execute("rollback")
            return jsonify(error="unknown ticket"), 404
        if row["status"] != "called":
            conn.execute("rollback")
            return jsonify(error="that ticket is not being called"), 409

        conn.execute(
            "update tickets set called_at = ? where ticket_id = ?",
            (now(), ticket_id),
        )
        log_event(conn, ticket_id, "recalled", current_actor())
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    # Notify the visitor again, by SMS when a phone was left.
    desk = conn.execute(
        "select d.name, s.letter as service_letter "
        "from desks d join services s on s.service_id = d.service_id "
        "where d.desk_id = ?",
        (row["desk_id"],),
    ).fetchone()
    label = ticket_label(desk["service_letter"] if desk else "A", row["ticket_no"])
    notify_called(label, desk["name"] if desk else "the desk", row["contact"])

    signal()
    return jsonify(ticket_no=row["ticket_no"], status="called")


@bp.post("/api/staff/tickets/<int:ticket_id>/undo")
@staff_required
@csrf_required
def undo(ticket_id):
    """Take back the last decision while the desk has not moved on.

    Two limits, both about honesty: the decision has to be recent, and no other
    number may have been called at this counter since. Restoring a ticket behind
    a call that already replaced it would make the queue lie.
    """
    conn = get_db()
    conn.execute("begin immediate")
    try:
        row = conn.execute(
            "select ticket_id, ticket_no, status, desk_id from tickets "
            "where ticket_id = ?",
            (ticket_id,),
        ).fetchone()
        if row is None:
            conn.execute("rollback")
            return jsonify(error="unknown ticket"), 404

        last = conn.execute(
            "select event_id, event_type, event_time from ticket_events "
            "where ticket_id = ? "
            "  and event_type in ('completed', 'skipped', 'cancelled') "
            "order by event_id desc limit 1",
            (ticket_id,),
        ).fetchone()
        if last is None:
            conn.execute("rollback")
            return jsonify(error="there is no decision to take back"), 409

        age = seconds_since(last["event_time"])
        if age is None or age > UNDO_SECONDS:
            conn.execute("rollback")
            return jsonify(error="that decision is too late to take back"), 409

        if row["desk_id"] is not None:
            overtaken = conn.execute(
                "select ticket_id from tickets "
                "where desk_id = ? and status = 'called' and ticket_id <> ?",
                (row["desk_id"], ticket_id),
            ).fetchone()
            if overtaken is not None:
                conn.execute("rollback")
                return (
                    jsonify(
                        error="another number has been called since; "
                        "this decision is overtaken"
                    ),
                    409,
                )

        conn.execute("delete from ticket_events where event_id = ?", (last["event_id"],))
        conn.execute(
            "update tickets set status = 'called', called_at = ?, closed_at = null "
            "where ticket_id = ?",
            (now(), ticket_id),
        )
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    signal()
    return jsonify(ticket_no=row["ticket_no"], status="called")


@bp.post("/api/staff/tickets")
@staff_required
@csrf_required
def walk_in():
    """A ticket for somebody standing at the desk without a phone.

    It joins the same service queue as everyone else, from the same counter, so
    it is not a second line and it cannot jump the people already waiting.
    """
    conn = get_db()
    desk_id = _desk_id(conn)
    if desk_id is None:
        return jsonify(error="unknown desk"), 404

    row = _desk_row(conn, desk_id)
    if row is None:
        return jsonify(error="unknown desk"), 404

    if desk_state(conn, desk_id) == "closed":
        return jsonify(error="that desk is closed"), 409

    counter = "ticket:" + row["service_letter"]

    conn.execute("begin immediate")
    try:
        found = conn.execute(
            "select value from ticket_numbers where name = ?", (counter,)
        ).fetchone()
        if found is None:
            conn.execute("insert into ticket_numbers (name, value) values (?, 0)", (counter,))
            seq = 1
        else:
            seq = found["value"] + 1
        conn.execute("update ticket_numbers set value = ? where name = ?", (seq, counter))

        token = secrets.token_urlsafe(16)
        created = now()
        cur = conn.execute(
            "insert into tickets "
            "(ticket_no, service_id, status, source, access_token, created_at) "
            "values (?, ?, 'waiting', 'desk', ?, ?)",
            (seq, row["service_id"], token, created),
        )
        log_event(conn, cur.lastrowid, "created", current_actor())
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    signal()
    return (
        jsonify(
            ticket_no=seq,
            label=ticket_label(row["service_letter"], seq),
            token=token,
            source="desk",
            created_at=created,
        ),
        201,
    )


# ---------------------------------------------------------------------------
# the desk itself
# ---------------------------------------------------------------------------
@bp.post("/api/staff/service")
@staff_required
@csrf_required
def set_service():
    """Open, pause or close one counter.

    Changing the state always clears a manual LED colour: the automatic rule is
    the truth, and an override is only ever a temporary exception to it.
    """
    data = request.get_json(silent=True) or {}
    state = str(data.get("service_state") or "").strip()
    if state not in SERVICE_STATES:
        return jsonify(error="unknown desk state"), 400

    # A pause may say why and for how long. Both are the desk's own words: no
    # reason is guessed from the time of day, and no return time is invented.
    reason = str(data.get("pause_reason") or "").strip()
    if len(reason) > 80:
        return jsonify(error="the reason is longer than 80 characters"), 400
    minutes = data.get("pause_minutes")
    if minutes in (None, ""):
        minutes = None
    else:
        try:
            minutes = int(minutes)
        except (TypeError, ValueError):
            return jsonify(error="pause_minutes must be a whole number"), 400
        if not 5 <= minutes <= 240:
            return jsonify(error="a pause can last between 5 and 240 minutes"), 400
    if state != "paused":
        # Opening or closing clears the note: a return time on an open desk
        # would be read as an estimate nobody made.
        reason, minutes = "", None
    until = soon(minutes * 60) if minutes else None

    conn = get_db()
    desk_id = _desk_id(conn)
    if desk_id is None:
        return jsonify(error="unknown desk"), 404

    actor = current_actor()
    stamped = now()

    conn.execute("begin immediate")
    try:
        conn.execute(
            "insert into desk_settings "
            "(desk_id, service_state, updated_at, updated_by, pause_reason, "
            "paused_until) values (?, ?, ?, ?, ?, ?)",
            (desk_id, state, stamped, actor, reason or None, until),
        )
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise

    signal()
    return jsonify(
        service_state=state,
        updated_at=stamped,
        updated_by=actor,
        pause_reason=reason or None,
        paused_until=until,
    )
