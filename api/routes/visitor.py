"""Visitor routes: the services on offer, taking a ticket, and following it.

These routes are open, because the visitor page is reached from a QR code and
needs no account. They never change a ticket that is already called.

One office can offer several services, each with its own queue and its own
number sequence. The catalogue is read from the database rather than written
into the interface, so the page shows what the office actually offers.
"""
import re
import secrets

from flask import Blueprint, current_app, jsonify, request

from broadcast import signal
from db import get_db
from security import rate_limit
from util import now, parse

bp = Blueprint("visitor", __name__)

# Anything longer than this was never a single service: the ticket was probably
# left open overnight, and counting it would spoil the average.
LONGEST_SERVICE_SECONDS = 4 * 60 * 60


def ticket_label(letter, ticket_no):
    """A003, B012: the service's letter and its own three-digit number."""
    return "%s%03d" % (letter, ticket_no)


# A plain address, not the full RFC grammar: enough to catch a typo without
# refusing an address the office could actually use.
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def clean_contact(value, force_required=False):
    """A phone number or an email address the visitor left, or `None`.

    If `force_required` is True, the contact is mandatory (one method only).
    Otherwise it's optional (VIS-10, QUE-19).
    """
    text = " ".join(str(value or "").split())
    
    # If contact is not provided and it's not forced, return None (VIS-10, QUE-19)
    if not text and not force_required:
        return None, None
        
    if not text and force_required:
        return None, "a contact method (email or phone) is required"
    if len(text) > 120:
        return None, "that contact is too long"

    # Check if both email and phone indicators are present (only one method allowed)
    has_email = "@" in text
    digits = re.sub(r"[^0-9]", "", text)
    has_phone = 7 <= len(digits) <= 15
    
    if has_email and has_phone:
        return None, "enter either an email address or a phone number, not both"
    
    if has_email:
        if EMAIL_PATTERN.match(text):
            return text, None
        return None, "enter a complete email address"
    elif has_phone:
        return text, None
    else:
        if force_required:
            return None, "enter a valid email address or phone number"
        return None, "enter a phone number or an email address"


def desk_state(conn, desk_id=None):
    """The most recent setting for one desk, or paused before one is recorded."""
    if desk_id is None:
        row = conn.execute("select desk_id from desks order by desk_id limit 1").fetchone()
        if row is None:
            return "paused"
        desk_id = row["desk_id"]

    setting = conn.execute(
        "select service_state from desk_settings where desk_id = ? "
        "order by setting_id desc limit 1",
        (desk_id,),
    ).fetchone()
    return setting["service_state"] if setting else "paused"


def service_state(conn, service_id):
    """Open while at least one of the service's desks is open.

    A paused desk still takes tickets; a closed desk does not. The service is
    paused only when every desk is paused, and closed when nobody is open.
    """
    desks = conn.execute(
        "select desk_id from desks where service_id = ? and is_active = 1 "
        "order by desk_id",
        (service_id,),
    ).fetchall()
    if not desks:
        return "closed"

    states = [desk_state(conn, row["desk_id"]) for row in desks]
    if "active" in states:
        return "active"
    if "paused" in states:
        return "paused"
    return "closed"


def service_by_key(conn, key):
    """One service by its letter (A), or by its numeric id for older links."""
    if key in (None, ""):
        return conn.execute(
            "select * from services where is_active = 1 order by letter limit 1"
        ).fetchone()

    text = str(key).strip()
    if text.isdigit():
        return conn.execute(
            "select * from services where service_id = ?", (int(text),)
        ).fetchone()
    return conn.execute(
        "select * from services where letter = ?", (text.upper(),)
    ).fetchone()


def tickets_ahead(conn, service_id, ticket_no):
    return conn.execute(
        "select count(*) as c from tickets "
        "where service_id = ? and status = 'waiting' and ticket_no < ?",
        (service_id, ticket_no),
    ).fetchone()["c"]


# How many waiting numbers any page is allowed to list. Enough for a visitor to
# recognise their own place in the line, short enough for a television to keep
# its shape; the count next to it says the rest.
WAITING_LABELS_LIMIT = 8


def waiting_labels(conn, service_id, letter, before=None):
    """The next numbers a queue will call, in the order it will call them.

    Only numbers, never anything that identifies the person holding them. With
    `before`, the list is cut at a ticket, which is what "who is ahead of me"
    means for the visitor holding that ticket.
    """
    sql = "select ticket_no from tickets where service_id = ? and status = 'waiting'"
    params = [service_id]
    if before is not None:
        sql += " and ticket_no < ?"
        params.append(before)
    sql += " order by ticket_no limit ?"
    params.append(WAITING_LABELS_LIMIT)
    return [ticket_label(letter, row["ticket_no"]) for row in conn.execute(sql, params)]


def service_time(conn, service_id=None):
    """How long one service usually takes, and how many tickets say so.

    Measured from the moment a ticket was called to the moment it was closed,
    over the most recent completed tickets. Returns (None, 0) when there is not
    enough history for the number to mean anything, which is what the interface
    needs in order to say "not available" instead of guessing.
    """
    sql = (
        "select called_at, closed_at from tickets "
        "where status = 'completed' and called_at is not null and closed_at is not null "
    )
    params = ()
    if service_id is not None:
        sql += "and service_id = ? "
        params = (service_id,)
    sql += "order by closed_at desc limit 20"

    rows = conn.execute(sql, params).fetchall()

    durations = []
    for row in rows:
        called, closed = parse(row["called_at"]), parse(row["closed_at"])
        if called is None or closed is None:
            continue
        seconds = (closed - called).total_seconds()
        # A short service is a real service: the desk can finish a ticket in the
        # same second it called it, and counting only the long ones would make
        # the average read far higher than the desk really is.
        if 0 <= seconds <= LONGEST_SERVICE_SECONDS:
            durations.append(seconds)

    if len(durations) < current_app.config["ETA_MIN_SAMPLES"]:
        return None, len(durations)

    return round(sum(durations) / len(durations)), len(durations)


def service_info(conn, row):
    """One service as the pages should describe it, with its live queues."""
    state = service_state(conn, row["service_id"])
    average, samples = service_time(conn, row["service_id"])

    waiting = conn.execute(
        "select count(*) as c from tickets "
        "where service_id = ? and status = 'waiting'",
        (row["service_id"],),
    ).fetchone()["c"]

    calls = conn.execute(
        "select t.ticket_no, t.called_at, d.name as desk_name "
        "from tickets t left join desks d on d.desk_id = t.desk_id "
        "where t.service_id = ? and t.status = 'called' "
        "order by t.called_at",
        (row["service_id"],),
    ).fetchall()

    return {
        "id": row["letter"],
        "letter": row["letter"],
        "name": row["name"],
        "description": row["description"],
        # A closed service is not taking anyone; a paused one still is.
        "available": state != "closed",
        "service_state": state,
        "waiting": waiting,
        "waiting_labels": waiting_labels(conn, row["service_id"], row["letter"]),
        "now_serving": [
            {
                "ticket_no": call["ticket_no"],
                "label": ticket_label(row["letter"], call["ticket_no"]),
                "desk": call["desk_name"],
                "called_at": call["called_at"],
            }
            for call in calls
        ],
        "target_seconds": row["target_seconds"],
        "average_service_seconds": average,
        "service_samples": samples,
    }


@bp.get("/api/services")
def services():
    """The office's services, each with its own queue."""
    conn = get_db()
    rows = conn.execute(
        "select * from services where is_active = 1 order by letter"
    ).fetchall()
    listing = [service_info(conn, row) for row in rows]
    return jsonify(
        services=listing,
        single_desk=len(listing) == 1,
        server_time=now(),
    )


@bp.post("/api/tickets")
@rate_limit("tickets", "TICKET_ATTEMPTS", "TICKET_WINDOW_SECONDS")
def create_ticket():
    """Issue the next number for the chosen service, with a private token.
    
    If the browser already has an active ticket for this service (VIS-10, QUE-19),
    returns that ticket instead of issuing a duplicate.
    """
    data = request.get_json(silent=True) or {}
    source = str(data.get("source") or "qr")[:20]
    
    # Browser fingerprint for duplicate detection (VIS-10, QUE-19)
    browser_fingerprint = str(data.get("browser_fingerprint") or "")[:64]

    # Mandatory: a phone number or email address the visitor must leave (VIS-10, QUE-19)
    # Only one method allowed: email OR phone, not both
    contact, contact_error = clean_contact(data.get("contact"), force_required=True)
    if contact_error:
        return jsonify(error=contact_error), 400

    conn = get_db()

    # The page sends the service the visitor picked. No choice means the first
    # service, which keeps old links and the command line working.
    chosen = str(data.get("service") or "").strip()
    row = service_by_key(conn, chosen)
    if row is None:
        return jsonify(error="that service is not offered here"), 400
    if not row["is_active"]:
        return jsonify(error="that service is no longer offered"), 400
    if service_state(conn, row["service_id"]) == "closed":
        return jsonify(error="that service is closed"), 409

    # Check for an existing active ticket from this browser for this service (VIS-10, QUE-19)
    if browser_fingerprint:
        existing = conn.execute(
            "select t.ticket_id, t.ticket_no, t.access_token, t.created_at "
            "from tickets t "
            "where t.service_id = ? and t.browser_fingerprint = ? "
            "and t.status = 'waiting' "
            "order by t.ticket_id desc limit 1",
            (row["service_id"], browser_fingerprint),
        ).fetchone()
        if existing is not None:
            # Return the existing ticket instead of creating a duplicate
            return jsonify(
                ticket_no=existing["ticket_no"],
                label=ticket_label(row["letter"], existing["ticket_no"]),
                ahead=tickets_ahead(conn, row["service_id"], existing["ticket_no"]),
                ahead_labels=waiting_labels(conn, row["service_id"], row["letter"], before=existing["ticket_no"]),
                token=existing["access_token"],
                service_state=service_state(conn, row["service_id"]),
                service=service_info(conn, row),
                contact=None,
                created_at=existing["created_at"],
                duplicate=True,  # Flag to indicate this was an existing ticket
            ), 200

    counter = "ticket:" + row["letter"]

    # One writer at a time, so two visitors cannot receive the same number.
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
            "(ticket_no, service_id, status, source, access_token, contact, created_at, browser_fingerprint) "
            "values (?, ?, 'waiting', ?, ?, ?, ?, ?)",
            (seq, row["service_id"], source, token, contact, created, browser_fingerprint if browser_fingerprint else None),
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

    # A visitor has joined: every open page shows one more person waiting.
    signal()

    return jsonify(
        ticket_no=seq,
        label=ticket_label(row["letter"], seq),
        ahead=tickets_ahead(conn, row["service_id"], seq),
        ahead_labels=waiting_labels(conn, row["service_id"], row["letter"], before=seq),
        token=token,
        service_state=service_state(conn, row["service_id"]),
        service=service_info(conn, row),
        contact=contact,
        created_at=created,
    ), 201


def last_requeue(conn, ticket_id):
    """The most recent time this ticket was sent back to the queue, if ever.

    A repeat visitor keeps the same tracking link, and the number printed on the
    page changes underneath them when the hold rule fires. This is what the page
    reads to explain that, instead of silently showing a different number.

    `previous_label` is null for a requeue recorded before the event carried it.
    """
    row = conn.execute(
        "select detail, event_time from ticket_events "
        "where ticket_id = ? and event_type = 'requeued' "
        "order by event_id desc limit 1",
        (ticket_id,),
    ).fetchone()
    if row is None:
        return None
    found = re.search(r"\(was ([A-Z]+[0-9]+)\)\s*$", row["detail"] or "")
    return dict(
        at=row["event_time"],
        previous_label=found.group(1) if found else None,
    )


def ticket_payload(conn, token):
    """One ticket as a plain dict, or None when the token is not on file.

    Shared by the tracking route and the event stream, so a visitor following a
    ticket live and a visitor reloading the page are told the same thing.
    """
    row = conn.execute(
        "select t.ticket_id, t.ticket_no, t.service_id, t.status, t.created_at, "
        "       t.called_at, t.closed_at, t.contact, s.letter, s.name as service_name, "
        "       s.description, s.target_seconds, s.updated_at, s.updated_by, "
        "       s.is_active, d.name as desk_name "
        "from tickets t join services s on s.service_id = t.service_id "
        "left join desks d on d.desk_id = t.desk_id "
        "where t.access_token = ?",
        (token,),
    ).fetchone()
    if row is None:
        return None

    service_row = conn.execute(
        "select * from services where service_id = ?", (row["service_id"],)
    ).fetchone()

    return dict(
        ticket_no=row["ticket_no"],
        label=ticket_label(row["letter"], row["ticket_no"]),
        status=row["status"],
        ahead=tickets_ahead(conn, row["service_id"], row["ticket_no"]),
        ahead_labels=waiting_labels(
            conn, row["service_id"], row["letter"], before=row["ticket_no"]
        ),
        created_at=row["created_at"],
        called_at=row["called_at"],
        closed_at=row["closed_at"],
        desk=row["desk_name"],
        contact=row["contact"],
        last_requeue=last_requeue(conn, row["ticket_id"]),
        service_state=service_state(conn, row["service_id"]),
        service=service_info(conn, service_row),
        server_time=now(),
    )


@bp.get("/api/tickets/<token>")
def ticket_state(token):
    """The number, the state of the ticket and how many tickets are ahead."""
    payload = ticket_payload(get_db(), token)
    if payload is None:
        return jsonify(error="unknown ticket"), 404
    return jsonify(payload)
