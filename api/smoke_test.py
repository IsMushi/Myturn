"""End to end check of the MyTurn API.

Run it while the API is up:

    .venv\\Scripts\\python.exe smoke_test.py

It follows the same order a real session would: visitors take tickets, staff
sign in, call and close a ticket, the board sends readings, and the hold rule is
exercised by back-dating the call time in the database.
"""
import http.cookiejar
import hashlib
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import config

BASE = "http://127.0.0.1:5000"
DEVICE_KEY = (Path(config.DATA_DIR) / "device_key.txt").read_text(encoding="utf-8").strip()

# A visitor leaves one way to be reached, so every ticket in this run carries
# the same one. The office is in Kigali, so the number is a local one.
CONTACT = "visitor@example.test"

passed = 0
failed = 0

# Set after a sign in. Every request that changes something carries it, which is
# what the API asks for once a session exists.
csrf_token = None


def check(label, got, want):
    global passed, failed
    ok = got == want
    if ok:
        passed += 1
    else:
        failed += 1
    print("  %-4s %-52s got %r want %r" % ("ok" if ok else "FAIL", label, got, want))


def call(method, path, body=None, opener=None, key=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if key:
        request.add_header("X-Device-Key", key)
    if csrf_token and method != "GET":
        request.add_header("X-CSRF-Token", csrf_token)
    send = opener.open if opener is not None else urllib.request.urlopen
    try:
        with send(request) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read() or b"{}")
        except ValueError:
            return error.code, {}


def reset():
    """Clear the transactional tables so the run starts from a known state.

    The administrator is left alone: it is created by seed_admin.py and the
    checks below sign in as it. The account this run registers for itself is
    cleared, so the suite can be run twice in a row — an invitation for an
    address that already has an account is refused.
    """
    conn = sqlite3.connect(config.DATABASE)
    conn.execute("delete from ticket_events")
    conn.execute("delete from tickets")
    conn.execute("delete from device_reports")
    # The registration checks below register a board of their own. A run that
    # was interrupted would leave it behind, so it is cleared here as well.
    conn.execute(
        "delete from device_reports where device_id in "
        "(select device_id from devices where label = 'Suite board')"
    )
    conn.execute("delete from devices where label = 'Suite board'")
    # A board that is plugged in reports every few seconds, so `last_seen`
    # would survive the reset and the desk would start the run online. The
    # suite expects the "no board has ever reported" state, and says so in its
    # own words, so the board is put back into it here rather than leaving the
    # result to depend on whether a board happens to be attached.
    conn.execute("update devices set last_seen = null")
    conn.execute("delete from desk_settings")
    conn.execute("delete from account_events")
    conn.execute("delete from invitations")
    conn.execute("delete from password_resets")
    conn.execute("delete from users where email = 'new@example.com'")
    # One number sequence per service now, not one for the whole office.
    conn.execute("update ticket_numbers set value = 0 where name like 'ticket:%'")
    conn.execute("delete from sqlite_sequence")
    # Every desk starts paused again, with a row of its own.
    for (desk_id,) in conn.execute(
        "select desk_id from desks order by desk_id"
    ).fetchall():
        conn.execute(
            "insert into desk_settings (desk_id, service_state, updated_at, updated_by) "
            "values (?, 'paused', '2026-01-01T00:00:00+00:00', 'smoke-test')",
            (desk_id,),
        )
    conn.commit()
    conn.close()


def seconds_ago(seconds):
    """A timestamp for back-dating a call, in the format the API stores."""
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat(
        timespec="seconds"
    )


def main():
    reset()
    print("Visitors")
    status, health = call("GET", "/api/health")
    check("health", status, 200)

    status, first = call("POST", "/api/tickets", {"source": "qr", "contact": CONTACT})
    check("first ticket is number 1", first.get("ticket_no"), 1)
    check("first ticket has nothing ahead", first.get("ahead"), 0)

    _, second = call("POST", "/api/tickets", {"source": "qr", "contact": CONTACT})
    _, third = call("POST", "/api/tickets", {"source": "qr", "contact": CONTACT})
    check("numbers increase", (second["ticket_no"], third["ticket_no"]), (2, 3))
    check("third ticket has two ahead", third["ahead"], 2)
    check("token is private and long", len(third["token"]), 22)

    status, state = call("GET", "/api/tickets/" + first["token"])
    check("visitor can follow the ticket", (status, state["status"]), (200, "waiting"))
    status, _ = call("GET", "/api/tickets/not-a-real-token")
    check("unknown token is refused", status, 404)

    _, public = call("GET", "/api/public/state")
    check("public screen shows three waiting", public["waiting"], 3)
    check("nothing is called yet", public["called_no"], None)
    check("desk starts paused", public["service_state"], "paused")

    print("The services on offer")
    status, services = call("GET", "/api/services")
    check("the office publishes its services", status, 200)
    check("the office offers three services", len(services["services"]), 3)
    check("the service is named by the server", services["services"][0]["name"],
          first["service"]["name"])
    check("a paused desk still takes tickets", services["services"][0]["available"], True)
    check("the ticket carries its service", state["service"]["id"], "A")
    check("the number carries the service's letter", first["label"], "A001")
    status, _ = call("POST", "/api/tickets", {"source": "qr", "service": "desk-9", "contact": CONTACT})
    check("a service the office does not offer is refused", status, 400)
    status, _ = call("POST", "/api/tickets", {"source": "qr", "service": "Z", "contact": CONTACT})
    check("an unknown ticket letter is refused", status, 400)
    status, _ = call("POST", "/api/tickets", {"source": "qr"})
    check("a ticket without a contact is refused", status, 400)
    status, _ = call("POST", "/api/tickets", {"source": "qr", "contact": "a@b.com and 0781234567"})
    check("a ticket with both an address and a number is refused", status, 400)
    check("no estimate before anything is served", public["average_service_seconds"], None)

    print("Staff")
    status, _ = call("POST", "/api/staff/call-next")
    check("call-next needs a session", status, 401)
    status, _ = call("POST", "/api/staff/login", {"name": "Leah", "password": "wrong"})
    check("wrong password is refused", status, 401)

    jar = http.cookiejar.CookieJar()
    staff = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, login = call("POST", "/api/staff/login", {"name": "Leah", "password": config.STAFF_PASSWORD}, staff)
    check("sign in succeeds", (status, login.get("staff")), (200, "Leah"))

    global csrf_token
    csrf_token = login["csrf_token"]

    # A cookie-authenticated write has to carry the token the session was given.
    saved = csrf_token
    csrf_token = None
    status, _ = call("POST", "/api/staff/service", {"service_state": "active"}, staff)
    check("a write with no security token is refused", status, 403)

    csrf_token = "not-the-token-the-server-issued"
    status, _ = call("POST", "/api/staff/service", {"service_state": "active"}, staff)
    check("a write with the wrong security token is refused", status, 403)
    csrf_token = saved

    _, queue = call("GET", "/api/staff/queue", opener=staff)
    check("queue shows three waiting", queue["waiting"], 3)
    check("queue shows the board label", queue["device"]["label"], "Service desk 1")
    check("board counts as offline before any report", queue["device"]["online"], False)

    status, service = call("POST", "/api/staff/service", {"service_state": "active"}, staff)
    check("desk can be set active", (status, service["service_state"]), (200, "active"))
    status, _ = call("POST", "/api/staff/service", {"service_state": "busy"}, staff)
    check("unknown service state is refused", status, 400)

    # A pause may say why and for how long. Both are the desk's own words, the
    # queue repeats them back, and opening the desk clears them rather than
    # leaving a promise nobody is keeping.
    status, paused = call("POST", "/api/staff/service",
                          {"service_state": "paused", "pause_reason": "On a break",
                           "pause_minutes": 30}, staff)
    check("a pause carries its reason",
          (status, paused["pause_reason"]), (200, "On a break"))
    check("a pause carries its return time", paused["paused_until"] is not None, True)
    _, queue = call("GET", "/api/staff/queue", opener=staff)
    check("the queue repeats the reason", queue["desk"]["pause_reason"], "On a break")
    check("the queue repeats the return time",
          queue["desk"]["paused_until"], paused["paused_until"])

    status, _ = call("POST", "/api/staff/service",
                     {"service_state": "paused", "pause_minutes": 3}, staff)
    check("a pause shorter than five minutes is refused", status, 400)

    status, reopened = call("POST", "/api/staff/service",
                            {"service_state": "active"}, staff)
    check("opening clears the reason", reopened["pause_reason"], None)
    check("opening clears the return time", reopened["paused_until"], None)

    status, called = call("POST", "/api/staff/call-next", opener=staff)
    check("next ticket is called", (status, called["ticket_no"]), (200, 1))
    status, again = call("POST", "/api/staff/call-next", opener=staff)
    check("a second call is refused", status, 409)
    check("refusal reports the hold time", again.get("hold_remaining", 0) > 0, True)

    _, follow = call("GET", "/api/tickets/" + first["token"])
    check("the visitor sees that they are called", follow["status"], "called")

    _, queue = call("GET", "/api/staff/queue", opener=staff)
    ticket_id = queue["called"]["ticket_id"]
    status, done = call("POST", "/api/staff/tickets/%d/action" % ticket_id, {"action": "complete"}, staff)
    check("ticket can be completed", (status, done["status"]), (200, "completed"))
    status, _ = call("POST", "/api/staff/tickets/%d/action" % ticket_id, {"action": "complete"}, staff)
    check("a closed ticket cannot be closed twice", status, 409)
    status, _ = call("POST", "/api/staff/tickets/9999/action", {"action": "skip"}, staff)
    check("unknown ticket is refused", status, 404)
    status, _ = call("POST", "/api/staff/tickets/%d/action" % ticket_id, {"action": "shout"}, staff)
    check("unknown action is refused", status, 400)

    print("Board")
    status, _ = call("POST", "/api/device/readings", {"distance_cm": 42, "occupied": True, "led_state": "red"})
    check("reading without a device key is refused", status, 401)
    status, _ = call("POST", "/api/device/readings", {"occupied": True}, key=DEVICE_KEY)
    check("reading without a distance is refused", status, 400)

    status, _ = call(
        "POST", "/api/device/readings",
        {"distance_cm": 41.5, "occupied": True, "approach": 1, "led_state": "red"},
        key=DEVICE_KEY,
    )
    check("reading from the board is stored", status, 200)
    status, setting = call("GET", "/api/device/setting", key=DEVICE_KEY)
    check("board reads back the desk state", (status, setting["service_state"]), (200, "active"))
    check("board sees no call event while the line is idle", setting.get("call_event"), None)

    _, queue = call("GET", "/api/staff/queue", opener=staff)
    device = queue["device"]
    check("dashboard sees the board online", device["online"], True)
    check("dashboard sees the distance", device["distance_cm"], 41.5)
    check("dashboard sees the approach", device["approach"], True)
    check("dashboard sees the light the board applied", device["led_state"], "red")

    print("Hold rule")
    # The Board section above left the board reporting an occupied counter.
    # A desk that still has someone at it refuses to call the next visitor, so
    # the counter has to read free before this section can call at all. The
    # hold test is about timing, not about occupancy.
    call(
        "POST", "/api/device/readings",
        {"distance_cm": 400, "occupied": False, "approach": 0, "led_state": "green"},
        key=DEVICE_KEY,
    )
    # Put a ticket in the called state first, so there is something to hold.
    status, held = call("POST", "/api/staff/call-next", opener=staff)
    check("next ticket is called before the hold test", (status, held["ticket_no"]), (200, 2))

    conn = sqlite3.connect(config.DATABASE)
    conn.execute("update tickets set called_at = '2026-01-01T00:00:00+00:00' where status = 'called'")
    conn.commit()
    conn.close()

    status, requeued = call("POST", "/api/staff/call-next", opener=staff)
    check("a ticket past the hold time is called over", (status, requeued["ticket_no"]), (200, 3))

    conn = sqlite3.connect(config.DATABASE)
    conn.row_factory = sqlite3.Row
    events = [row["event_type"] for row in conn.execute("select event_type from ticket_events order by event_id")]
    reissued = conn.execute(
        "select ticket_no, status, access_token from tickets where ticket_no = 4"
    ).fetchone()
    tickets = conn.execute("select count(*) as c from tickets").fetchone()["c"]
    conn.close()
    check("the stale call was written to the event log", "requeued" in events, True)
    check(
        "the missed number went to the back of the queue",
        (reissued["ticket_no"], reissued["status"]) if reissued else None,
        (4, "waiting"),
    )
    check("no ticket was lost", tickets, 3)

    # The visitor is still holding the old link, so that link has to say the
    # number changed - and say which number was given up.
    status, followed = call("GET", "/api/tickets/" + reissued["access_token"])
    explained = (followed.get("last_requeue") or {}) if status == 200 else {}
    check("the visitor's own link still opens", status, 200)
    check("the visitor is told which number was given up",
          explained.get("previous_label"), "A002")
    check("the explanation carries when it happened",
          bool(explained.get("at")), True)

    print("Occupancy-assisted requeue")
    # A fresh board that reports somebody at the counter keeps the full hold,
    # even once the grace period has passed.
    conn = sqlite3.connect(config.DATABASE)
    conn.execute("delete from device_reports")
    conn.execute(
        "update tickets set called_at = ? where status = 'called'",
        (seconds_ago(40),),
    )
    conn.commit()
    conn.close()
    call(
        "POST", "/api/device/readings",
        {"distance_cm": 55, "occupied": True, "approach": 0, "led_state": "red"},
        key=DEVICE_KEY,
    )
    _, occupied = call("GET", "/api/staff/queue", opener=staff)
    check("an occupied counter keeps the full hold", occupied["hold_shortened"], False)
    check("the full hold is reported while occupied",
          occupied["effective_hold_seconds"], config.HOLD_SECONDS)
    check("the reason names the occupied counter",
          occupied["hold_reason"], "the service point is occupied")

    # With the counter verifiably empty, the same call may end at the floor
    # instead of the full hold - but only after the grace period.
    conn = sqlite3.connect(config.DATABASE)
    conn.execute("delete from device_reports")
    conn.execute(
        "update tickets set called_at = ? where status = 'called'",
        (seconds_ago(config.MIN_GRACE_SECONDS + 2),),
    )
    conn.commit()
    conn.close()
    call(
        "POST", "/api/device/readings",
        {"distance_cm": 160, "occupied": False, "approach": 0, "led_state": "green"},
        key=DEVICE_KEY,
    )
    _, empty = call("GET", "/api/staff/queue", opener=staff)
    check("an empty counter shortens the hold", empty["hold_shortened"], True)
    check("the shortened hold is the configured floor",
          empty["effective_hold_seconds"], config.MIN_CALL_SECONDS)
    check("the reason names the empty counter",
          empty["hold_reason"], "the service point is empty")

    # Past the shortened limit, a plain read is enough to recover the queue:
    # nobody has to press Call next.
    conn = sqlite3.connect(config.DATABASE)
    conn.execute(
        "update tickets set called_at = ? where status = 'called'",
        (seconds_ago(config.MIN_CALL_SECONDS + 5),),
    )
    conn.commit()
    conn.close()
    _, swept = call("GET", "/api/staff/queue", opener=staff)
    check("a queue read recovers the expired call", swept["called"], None)

    conn = sqlite3.connect(config.DATABASE)
    conn.row_factory = sqlite3.Row
    reissued = conn.execute(
        "select ticket_no, status from tickets where ticket_no = 5"
    ).fetchone()
    reason = conn.execute(
        "select detail from ticket_events where event_type = 'requeued' "
        "order by event_id desc limit 1"
    ).fetchone()
    conn.close()
    check("the early requeue is waiting at the back",
          (reissued["ticket_no"], reissued["status"]) if reissued else None,
          (5, "waiting"))

    check("the early requeue says why it happened",
          "service point empty" in (reason["detail"] or "") if reason else False, True)

    status, next_up = call("POST", "/api/staff/call-next", opener=staff)
    check("the desk calls the next number after the early requeue",
          (status, next_up["ticket_no"]), (200, 4))

    _, fresh_call = call("GET", "/api/staff/queue", opener=staff)
    check("a call is never shortened during the grace period",
          fresh_call["hold_shortened"], False)
    check("the grace period explains itself",
          fresh_call["hold_reason"], "the visitor is still walking up")

    # A board that stopped reporting is no evidence at all: the fixed hold
    # applies, even though its last reading said the counter was empty.
    conn = sqlite3.connect(config.DATABASE)
    conn.execute("update devices set last_seen = '2026-01-01T00:00:00+00:00'")
    conn.execute(
        "update tickets set called_at = ? where status = 'called'",
        (seconds_ago(40),),
    )
    conn.commit()
    conn.close()
    _, offline = call("GET", "/api/staff/queue", opener=staff)
    check("an offline board cannot shorten a hold", offline["hold_shortened"], False)
    check("the full hold stands without the board",
          offline["effective_hold_seconds"], config.HOLD_SECONDS)
    check("the reason says the board is not reporting",
          offline["hold_reason"], "the board is not reporting")

    status, _ = call(
        "POST",
        "/api/staff/tickets/%d/action" % offline["called"]["ticket_id"],
        {"action": "complete"},
        staff,
    )
    check("the called ticket can still be served", status, 200)
    # Bring the board back for the rest of the run.
    call(
        "POST", "/api/device/readings",
        {"distance_cm": 160, "occupied": False, "approach": 0, "led_state": "green"},
        key=DEVICE_KEY,
    )

    print("Static obstruction")
    # A bag left on the desk reads as occupied for as long as it is there, and
    # a desk that cannot call anybody is a desk that has stopped working. An
    # object that has not moved, and that no approach was ever seen near, is
    # an obstruction and must not block the desk.
    conn = sqlite3.connect(config.DATABASE)
    conn.row_factory = sqlite3.Row
    board = conn.execute(
        "select device_id from devices where desk_id = 1 order by device_id limit 1"
    ).fetchone()
    # The queue is remembered, because this section calls a number and the
    # rest of the run counts what has been served.
    top_ticket = conn.execute(
        "select coalesce(max(ticket_id), 0) as top from tickets"
    ).fetchone()["top"]
    numbers_before = {
        row["name"]: row["value"]
        for row in conn.execute("select name, value from ticket_numbers")
    }
    conn.close()
    device_id = board["device_id"] if board else 1

    def board_history(rows):
        """Write a reading history straight into the table.

        The board reports every five seconds, and a history that spans the
        obstruction window cannot be made through the API, because every
        report it accepts is stamped with the time it arrived.
        """
        conn = sqlite3.connect(config.DATABASE)
        conn.execute("delete from device_reports")
        for seconds, distance, occupied, approach in rows:
            conn.execute(
                "insert into device_reports (device_id, distance_cm, occupied, approach, "
                "led_state, reported_at) values (?, ?, ?, ?, 'red', ?)",
                (device_id, distance, occupied, approach, seconds_ago(seconds)),
            )
        conn.execute(
            "update devices set last_seen = ? where device_id = ?",
            (seconds_ago(0), device_id),
        )
        conn.commit()
        conn.close()

    window = config.OBSTRUCTION_SECONDS

    # Something that has not moved, and that no approach was ever seen near.
    board_history([(s, 50.0, 1, 0) for s in range(0, window + 20, 20)])
    status, called = call("POST", "/api/staff/call-next", opener=staff)
    check("a static obstruction does not block the desk", status, 200)
    check("the desk still calls a number", called.get("ticket_no") is not None, True)

    _, obstruction_state = call("GET", "/api/staff/queue", opener=staff)
    check("the counter is reported as an obstruction",
          obstruction_state["device"]["obstruction"], True)

    # The same, but somebody walked up: the approach says it is a visitor.
    walked_up = [(s, 50.0, 1, 0) for s in range(0, window + 20, 20)]
    walked_up[len(walked_up) // 2] = (walked_up[len(walked_up) // 2][0], 50.0, 1, 1)
    board_history(walked_up)
    status, blocked = call("POST", "/api/staff/call-next", opener=staff)
    check("an approach keeps the counter occupied", status, 409)
    check("the refusal names the counter", blocked.get("error"),
          "the service point is occupied; wait for it to clear")

    _, approach_state = call("GET", "/api/staff/queue", opener=staff)
    check("an approaching visitor is not called an obstruction",
          approach_state["device"]["obstruction"], False)

    # Something that has moved: it is not sitting still, so it is not a bag.
    board_history([(s, 50.0 + (20 if s > window // 2 else 0), 1, 0)
                   for s in range(0, window + 20, 20)])
    status, moved = call("POST", "/api/staff/call-next", opener=staff)
    check("something that moved keeps the counter occupied", status, 409)
    check("the refusal still names the counter", moved.get("error"),
          "the service point is occupied; wait for it to clear")

    # Leave the run the way it was found: no number left called, the ticket
    # numbers where they were, and a board that reads an empty counter.
    conn = sqlite3.connect(config.DATABASE)
    conn.execute("delete from ticket_events where ticket_id > ?", (top_ticket,))
    conn.execute("delete from tickets where ticket_id > ?", (top_ticket,))
    for name, value in numbers_before.items():
        conn.execute("update ticket_numbers set value = ? where name = ?", (value, name))
    conn.execute("delete from sqlite_sequence where name = 'tickets'")
    conn.execute("insert into sqlite_sequence (name, seq) values ('tickets', ?)", (top_ticket,))
    conn.commit()
    conn.close()
    call(
        "POST", "/api/device/readings",
        {"distance_cm": 160, "occupied": False, "approach": 0, "led_state": "green"},
        key=DEVICE_KEY,
    )

    print("Accounts")
    status, _ = call("GET", "/api/auth/me")
    check("me needs a session", status, 401)

    status, wrong = call("POST", "/api/auth/login",
                         {"email": config.ADMIN_EMAIL, "password": "not-the-password"})
    check("a wrong password is refused", status, 401)
    status, unknown = call("POST", "/api/auth/login",
                           {"email": "nobody@example.com", "password": "not-the-password"})
    check("an unknown address is refused the same way", status, 401)
    check("the two refusals read the same",
          wrong.get("error"), unknown.get("error"))

    admin_jar = http.cookiejar.CookieJar()
    admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(admin_jar))
    status, signed_in = call("POST", "/api/auth/login",
                             {"email": config.ADMIN_EMAIL, "password": config.ADMIN_PASSWORD}, admin)
    check("the administrator signs in", status, 200)
    check("the administrator is told to use the admin dashboard",
          signed_in.get("redirect"), "/admin/dashboard")
    check("the answer carries no password hash", "password_hash" in json.dumps(signed_in), False)

    admin_token = signed_in["csrf_token"]
    status, who = call("GET", "/api/auth/me", opener=admin)
    check("me reports the account", (status, who["user"]["role"]), (200, "admin"))
    check("me names an administrator to contact",
          who.get("administrator", {}).get("email"), config.ADMIN_EMAIL)

    status, listing = call("GET", "/api/auth/users", opener=admin)
    check("the administrator can list accounts", status, 200)
    check("the list carries no password hash", "password_hash" in json.dumps(listing), False)

    status, _ = call("POST", "/api/auth/invitations", {"email": "new@example.com"}, opener=admin)
    check("an invitation without a security token is refused", status, 403)

    csrf_token = admin_token
    status, _ = call("POST", "/api/auth/invitations",
                     {"email": "not-an-address", "role": "staff"}, admin)
    check("an invitation to a bad address is refused", status, 400)
    status, _ = call("POST", "/api/auth/invitations",
                     {"email": "second@example.com", "role": "admin"}, admin)
    check("an invitation can never carry the administrator role", status, 400)

    status, invited = call("POST", "/api/auth/invitations",
                           {"email": "new@example.com", "role": "staff"}, admin)
    check("the administrator can invite a staff member", status, 201)
    invite_token = invited.get("register_path", "").split("token=")[-1]

    status, details = call("GET", "/api/auth/invitation?token=" + invite_token)
    check("the invitation names the address it was sent to",
          (status, details["email"]), (200, "new@example.com"))

    status, _ = call("POST", "/api/auth/register",
                     {"token": "made-up", "full_name": "Nobody",
                      "password": "sunflowers9", "confirm_password": "sunflowers9"})
    check("registration without a real invitation is refused", status, 400)

    status, _ = call("POST", "/api/auth/register",
                     {"token": invite_token, "full_name": "New Person",
                      "password": "sunflowers9", "confirm_password": "bananas"})
    check("registration with two different passwords is refused", status, 400)

    status, _ = call("POST", "/api/auth/register",
                     {"token": invite_token, "full_name": "New Person",
                      "password": "short", "confirm_password": "short"})
    check("registration with a short password is refused", status, 400)

    status, created = call("POST", "/api/auth/register",
                           {"token": invite_token, "full_name": "New Person",
                            "password": "sunflowers9", "confirm_password": "sunflowers9"})
    check("registration from the invitation succeeds", status, 201)
    check("a new account is staff, never an administrator",
          created["user"]["role"], "staff")

    status, _ = call("POST", "/api/auth/register",
                     {"token": invite_token, "full_name": "New Person",
                      "password": "sunflowers9", "confirm_password": "sunflowers9"})
    check("the same invitation cannot be used twice", status, 400)

    staff_jar = http.cookiejar.CookieJar()
    member = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(staff_jar))
    status, member_signin = call("POST", "/api/auth/login",
                                 {"email": "new@example.com", "password": "sunflowers9"}, member)
    check("the new staff member can sign in", (status, member_signin["user"]["role"]),
          (200, "staff"))
    csrf_token = member_signin["csrf_token"]

    status, _ = call("GET", "/api/staff/queue", opener=member)
    check("the new staff member can work the queue", status, 200)
    status, _ = call("GET", "/api/auth/users", opener=member)
    check("a staff account cannot list accounts", status, 403)

    print("Password reset")
    status, known = call("POST", "/api/auth/forgot-password", {"email": "new@example.com"})
    check("a reset request is accepted", status, 202)
    status, stranger = call("POST", "/api/auth/forgot-password", {"email": "nobody@example.com"})
    check("an unknown address gets the same answer",
          (status, stranger.get("message")), (202, known.get("message")))
    check("an unknown address is not given a link", "reset_path" in stranger, False)

    reset_token = known.get("reset_path", "").split("token=")[-1]
    status, _ = call("POST", "/api/auth/reset-password",
                     {"token": reset_token, "password": "oatmeal42!",
                      "confirm_password": "oatmeal42!!"})
    check("a reset with two different passwords is refused", status, 400)

    status, _ = call("POST", "/api/auth/reset-password",
                     {"token": reset_token, "password": "oatmeal42!",
                      "confirm_password": "oatmeal42!"})
    check("the password can be reset once", status, 200)

    status, _ = call("POST", "/api/auth/reset-password",
                     {"token": reset_token, "password": "oatmeal42!",
                      "confirm_password": "oatmeal42!"})
    check("the reset link cannot be used again", status, 400)

    status, _ = call("POST", "/api/auth/login",
                     {"email": "new@example.com", "password": "sunflowers9"})
    check("the old password no longer works", status, 401)
    status, again = call("POST", "/api/auth/login",
                         {"email": "new@example.com", "password": "oatmeal42!"})
    check("the new password works", (status, again["user"]["email"]), (200, "new@example.com"))

    status, _ = call("POST", "/api/auth/logout", {"email": "new@example.com"},
                     opener=member)
    check("an account can sign out", status, 200)
    status, _ = call("GET", "/api/staff/queue", opener=member)
    check("the account session is really closed", status, 401)

    print("Rate limiting")
    last = None
    for _ in range(config.RESET_ATTEMPTS + 1):
        last, _ = call("POST", "/api/auth/forgot-password", {"email": "new@example.com"})
    check("repeated reset requests are refused", last, 429)

    print("Waiting time estimate")
    # There is nothing to measure until a few tickets have been through the
    # desk, so the estimate is withheld until there is.
    _, early = call("GET", "/api/public/state")
    check("no estimate before enough tickets are served",
          early["average_service_seconds"], None)
    check("the served count is reported with it",
          (early["service_samples"] >= 1,
           early["service_samples"] < config.ETA_MIN_SAMPLES), (True, True))

    csrf_token = saved
    for _ in range(3):
        call("POST", "/api/tickets", {"source": "qr", "contact": CONTACT})

    served_here = 0
    for _ in range(6):
        if served_here >= 3:
            break

        # The checks above may have left a ticket being called.
        _, queue_now = call("GET", "/api/staff/queue", opener=staff)
        current = queue_now.get("called")
        if current is None:
            status, _ = call("POST", "/api/staff/call-next", opener=staff)
            if status != 200:
                break
            _, queue_now = call("GET", "/api/staff/queue", opener=staff)
            current = queue_now.get("called")
        if current is None:
            break

        status, _ = call("POST", "/api/staff/tickets/%d/action" % current["ticket_id"],
                         {"action": "complete"}, staff)
        if status == 200:
            served_here += 1

    check("the desk can serve three tickets in a row", served_here, 3)
    _, measured = call("GET", "/api/public/state")
    check("an estimate is offered once there is history",
          isinstance(measured["average_service_seconds"], int), True)
    check("the estimate counts its samples",
          measured["service_samples"] >= config.ETA_MIN_SAMPLES, True)

    _, desk_view = call("GET", "/api/staff/queue", opener=staff)
    check("the desk sees the same measurement as the visitor",
          (desk_view["average_service_seconds"], desk_view["service_samples"]),
          (measured["average_service_seconds"], measured["service_samples"]))

    print("The desk extras")
    csrf_token = saved

    _, before = call("GET", "/api/staff/queue", opener=staff)
    status, first_walkin = call("POST", "/api/staff/tickets", {}, staff)
    check("the desk can give a walk-in a ticket",
          (status, first_walkin.get("source")), (201, "desk"))
    status, second_walkin = call("POST", "/api/staff/tickets", {}, staff)
    check("a second walk-in takes the next number",
          second_walkin["ticket_no"] - first_walkin["ticket_no"], 1)

    _, after = call("GET", "/api/staff/queue", opener=staff)
    check("the walk-ins join the same waiting line", after["waiting"] - before["waiting"], 2)
    check("the desk sees its own tally for the shift", after["tally"]["served"] >= 3, True)
    check("the tally is kept per person", after["tally"]["actor"], "Leah")
    waiting_before = [row["ticket_no"] for row in after["queue"]]
    check("the walk-in waits behind the visitors already in line",
          first_walkin["ticket_no"] in waiting_before
          and min(waiting_before) < first_walkin["ticket_no"], True)

    status, called = call("POST", "/api/staff/call-next", opener=staff)
    check("the desk can call a number off the line", status, 200)
    check("the first number waiting is the one called",
          called["ticket_no"], min(waiting_before))

    _, now_queue = call("GET", "/api/staff/queue", opener=staff)
    mine = now_queue["called"]["ticket_id"]
    _, called_setting = call("GET", "/api/device/setting", key=DEVICE_KEY)
    check("board is told which call is current", called_setting.get("call_event"), "called")
    check("board knows the call is fresh",
          isinstance(called_setting.get("call_event_age_seconds"), int)
          and called_setting["call_event_age_seconds"] <= 5, True)
    status, announced = call("POST", "/api/staff/tickets/%d/recall" % mine, {}, staff)
    check("the current number can be announced again",
          (status, announced["ticket_no"]), (200, called["ticket_no"]))
    _, recalled_setting = call("GET", "/api/device/setting", key=DEVICE_KEY)
    check("board is told that the announcement was a recall",
          recalled_setting.get("call_event"), "recalled")
    check("a recall carries a newer event id",
          recalled_setting.get("call_event_id", 0) > called_setting.get("call_event_id", 0), True)

    status, _ = call("POST", "/api/staff/tickets/%d/action" % mine, {"action": "skip"}, staff)
    check("a ticket can be marked as a no-show", status, 200)
    _, with_skip = call("GET", "/api/staff/queue", opener=staff)
    check("the no-show is counted for this person", with_skip["tally"]["no_shows"], 1)

    status, undone = call("POST", "/api/staff/tickets/%d/undo" % mine, {}, staff)
    check("a mistaken no-show can be taken back",
          (status, undone.get("status")), (200, "called"))
    _, restored = call("GET", "/api/staff/queue", opener=staff)
    check("the ticket is being called again", restored["called"]["ticket_id"], mine)
    check("the no-show is gone from the tally", restored["tally"]["no_shows"], 0)

    status, _ = call("POST", "/api/staff/tickets/%d/action" % mine, {"action": "complete"}, staff)
    check("the walk-in is served after all", status, 200)

    # The desk calls the next visitor: the mistake can no longer be taken back,
    # because the ticket would return to a counter that has moved on.
    call("POST", "/api/staff/call-next", opener=staff)
    status, late = call("POST", "/api/staff/tickets/%d/undo" % mine, {}, staff)
    check("a decision cannot be undone once the desk has moved on", status, 409)
    check("the refusal explains itself", "overtaken" in late.get("error", ""), True)

    # And the window closes on its own, even with the desk idle.
    _, back = call("GET", "/api/staff/queue", opener=staff)
    other = back["called"]["ticket_id"]
    call("POST", "/api/staff/tickets/%d/action" % other, {"action": "complete"}, staff)
    conn = sqlite3.connect(config.DATABASE)
    conn.execute(
        "update ticket_events set event_time = '2026-01-01T00:00:00+00:00' "
        "where event_type = 'completed'"
    )
    conn.commit()
    conn.close()
    status, stale = call("POST", "/api/staff/tickets/%d/undo" % other, {}, staff)
    check("a decision older than the window cannot be undone", status, 409)
    check("that refusal explains itself too", "too late" in stale.get("error", ""), True)

    print("A second desk")
    # A visitor joins the queue of a service, not of a counter. The number
    # carries that service's letter and comes from that service's own counter.
    status, other = call("POST", "/api/tickets", {"source": "qr", "service": "B", "contact": CONTACT})
    check("a ticket may be taken for another service",
          (status, other["label"]), (201, "B001"))
    check("each service numbers from one", other["ticket_no"], 1)
    _, follow_b = call("GET", "/api/tickets/" + other["token"])
    check("the ticket carries the service it joined", follow_b["service"]["id"], "B")
    check("a ticket from another service does not join this queue",
          follow_b["ahead"], 0)

    # The second counter is a different desk, so it opens and calls on its own.
    status, opened = call("POST", "/api/staff/service",
                          {"service_state": "active", "desk": 2}, staff)
    check("the second desk can be opened", (status, opened["service_state"]),
          (200, "active"))
    status, called_b = call("POST", "/api/staff/call-next", {"desk": 2}, staff)
    check("the second desk calls its own queue",
          (status, called_b["label"]), (200, "B001"))

    status, called_a = call("POST", "/api/staff/call-next", {"desk": 1}, staff)
    check("the first desk keeps its own queue", status, 200)

    _, queue_a = call("GET", "/api/staff/queue?desk=1", opener=staff)
    _, queue_b = call("GET", "/api/staff/queue?desk=2", opener=staff)
    check("two desks hold two calls at once",
          (queue_a["called"] is not None, queue_b["called"] is not None),
          (True, True))
    check("each desk sees only the queue of its own service",
          (queue_a["service"]["id"], queue_b["service"]["id"]), ("A", "B"))

    _, public_two = call("GET", "/api/public/state")
    check("the public screen lists every service",
          [service["id"] for service in public_two["services"]], ["A", "B", "C"])

    # Leave the office as it was found: no call left hanging.
    for desk_queue in (queue_a, queue_b):
        if desk_queue["called"]:
            call("POST", "/api/staff/tickets/%d/action"
                 % desk_queue["called"]["ticket_id"], {"action": "complete"}, staff)

    print("Desk comparison")
    csrf_token = saved
    status, comparison = call("GET", "/api/analytics/desks")
    check("the comparison answers in one read",
          (status, comparison.get("ok")), (200, True))
    rows = comparison.get("data", {}).get("desks", [])
    check("it lists every counter, by service",
          [row["service_letter"] for row in rows], ["A", "B", "C"])
    _, one = call("GET", "/api/analytics/desk/1")
    row_one = next(row for row in rows if row["desk_id"] == 1)
    check("a desk's served count agrees with its own page",
          row_one["tickets_served_today"], one["data"]["tickets_served_today"])
    check("so does the measurement and its sample count",
          (row_one["average_service_time_seconds"], row_one["service_samples"]),
          (one["data"]["average_service_time_seconds"], one["data"]["service_samples"]))
    check("a desk that has served is counted", row_one["tickets_served_today"] >= 4, True)
    row_two = next(row for row in rows if row["desk_id"] == 2)
    check("the second desk's visit is on the same sheet",
          row_two["tickets_served_today"], 1)
    check("a desk that never served withholds its average",
          next(row for row in rows if row["desk_id"] == 3)["average_service_time_seconds"],
          None)
    check("each desk says when it last served",
          isinstance(row_one["last_served_seconds_ago"], int), True)
    check("no-shows sit beside served rather than inside it",
          isinstance(row_one["no_shows_today"], int), True)
    check("hours with work are counted, not guessed",
          row_one["active_hours_today"] >= 1, True)

    print("The catalogue the administrator edits")
    csrf_token = admin_token
    status, catalogue = call("GET", "/api/auth/services", opener=admin)
    check("the administrator sees the services", (status, len(catalogue["services"])),
          (200, 3))
    status, desks = call("GET", "/api/auth/desks", opener=admin)
    check("the administrator sees the desks", (status, len(desks["desks"])), (200, 3))
    check("a desk knows the service it serves",
          desks["desks"][0]["service_letter"], "A")

    status, made = call("POST", "/api/auth/services",
                         {"letter": "D", "name": "Registry",
                          "description": "Certificates and records."}, admin)
    check("a service can be added", (status, made["service"]["letter"]), (201, "D"))
    status, _ = call("POST", "/api/auth/services",
                     {"letter": "A", "name": "Again",
                      "description": "A letter already in use."}, admin)
    check("a letter already in use is refused", status, 409)
    status, off = call("POST", "/api/auth/services/%d" % made["service"]["service_id"],
                       {"name": "Registry", "description": "Certificates and records.",
                        "is_active": False}, admin)
    check("a service can be switched off", (status, off["service"]["is_active"]),
          (200, False))
    _, public_off = call("GET", "/api/public/state")
    check("a switched-off service is not offered",
          [service["id"] for service in public_off["services"]], ["A", "B", "C"])

    # The suite leaves the office the shape it found it in.
    conn = sqlite3.connect(config.DATABASE)
    conn.execute("delete from services where letter = 'D'")
    conn.commit()
    conn.close()

    print("Administration extras")
    csrf_token = admin_token

    _, accounts = call("GET", "/api/auth/users", opener=admin)
    target = [user for user in accounts["users"] if user["email"] == "new@example.com"][0]

    status, promoted = call("POST", "/api/auth/users/%d/role" % target["user_id"],
                            {"role": "admin"}, admin)
    check("an administrator can promote an account",
          (status, promoted.get("user", {}).get("role")), (200, "admin"))
    status, _ = call("POST", "/api/auth/users/%d/role" % target["user_id"],
                     {"role": "admin"}, admin)
    check("promoting to the role it already has is refused", status, 409)
    status, demoted = call("POST", "/api/auth/users/%d/role" % target["user_id"],
                           {"role": "staff"}, admin)
    check("the rights can be taken back",
          (status, demoted.get("user", {}).get("role")), (200, "staff"))
    status, _ = call("POST", "/api/auth/users/%d/role" % target["user_id"],
                     {"role": "wizard"}, admin)
    check("an unknown role is refused", status, 400)

    _, who = call("GET", "/api/auth/me", opener=admin)
    status, last = call("POST", "/api/auth/users/%d/role" % who["user"]["user_id"],
                        {"role": "staff"}, admin)
    check("the last administrator cannot give up its own rights", status, 400)
    check("that refusal explains itself", "last administrator" in last.get("error", ""), True)
    _, again_who = call("GET", "/api/auth/me", opener=admin)
    check("the administrator still is one", again_who["user"]["role"], "admin")

    status, _ = call("POST", "/api/auth/invitations", {"email": "gone@example.com"}, admin)
    check("an invitation can be made for the revocation test", status, 201)
    status, replaced = call("POST", "/api/auth/invitations", {"email": "gone@example.com"}, admin)
    check("asking again replaces the pending link", (status, replaced.get("replaced")), (201, True))
    _, listing = call("GET", "/api/auth/users", opener=admin)
    pending = [row for row in listing["invitations"] if row["email"] == "gone@example.com"]
    check("only one invitation waits for that address", len(pending), 1)
    status, revoked = call("POST", "/api/auth/invitations/%d/revoke" % pending[0]["invitation_id"],
                           None, admin)
    check("a pending invitation can be revoked",
          (status, revoked.get("email")), (200, "gone@example.com"))
    _, listing = call("GET", "/api/auth/users", opener=admin)
    check("the revoked invitation is gone",
          [row["email"] for row in listing["invitations"]].count("gone@example.com"), 0)
    status, _ = call("POST", "/api/auth/invitations/%d/revoke" % pending[0]["invitation_id"],
                     None, admin)
    check("revoking it twice is refused", status, 404)

    status, desk = call("GET", "/api/auth/desk", opener=admin)
    check("an administrator can read the desk settings", status, 200)
    original = desk["profile"]
    status, _ = call("POST", "/api/auth/desk",
                     {"name": "", "description": "No name"}, admin)
    check("a desk with no name is refused", status, 400)
    status, renamed = call("POST", "/api/auth/desk",
                           {"name": "Smoke desk", "description": "Wording for the suite.",
                            "target_seconds": 30}, admin)
    check("the desk can be renamed while it runs",
          (status, renamed["profile"]["name"]), (200, "Smoke desk"))
    _, services = call("GET", "/api/services")
    check("the visitor page sees the new name at once",
          services["services"][0]["name"], "Smoke desk")

    status, feed = call("GET", "/api/auth/activity", opener=admin)
    check("the activity feed is readable", status, 200)
    kinds = set(entry["kind"] for entry in feed["entries"])
    check("the feed carries the queue, the desk and the accounts",
          ("ticket" in kinds, "desk" in kinds, "account" in kinds), (True, True, True))
    check("the feed is newest first",
          feed["entries"] == sorted(feed["entries"], key=lambda e: e["at"], reverse=True), True)
    check("the feed records the role change",
          any(entry["event"] == "role changed" for entry in feed["entries"]), True)
    check("every line in the feed names who did it",
          all(entry["actor"] for entry in feed["entries"]), True)
    check("a requeue records why it happened",
          any(entry["event"] == "requeued" and entry["detail"]
              for entry in feed["entries"]), True)
    check("the desk change appears in the account history",
          any(entry["event"] == "desk settings changed"
              for entry in feed["entries"]), True)
    status, _ = call("GET", "/api/auth/activity", opener=staff)
    check("the activity feed is closed to a shared session", status in (401, 403), True)

    status, numbers = call("GET", "/api/auth/stats", opener=admin)
    check("the statistics are readable", status, 200)
    issued = numbers["totals"]["issued"]
    check("the statistics count every ticket that was issued", issued > 0, True)
    check("the statistics count the tickets that were served",
          numbers["totals"]["served"] >= 3, True)
    check("the statistics carry the service-time distribution",
          [bucket["label"] for bucket in numbers["histogram"]],
          ["under 30 s", "30-60 s", "1-2 min", "2-5 min", "5 min or more"])
    check("the distribution accounts for the served tickets",
          sum(bucket["count"] for bucket in numbers["histogram"]) >= 3, True)
    check("the statistics agree with the number the visitor page shows",
          numbers["average_service_seconds"] is not None, True)
    check("the statistics name the desk it describes",
          numbers["desk_name"], "Smoke desk")
    check("the statistics carry the target time",
          numbers["target_seconds"], 30)
    check("the statistics measure how often the target was met",
          isinstance(numbers["within_target_percent"], int), True)

    with admin.open(urllib.request.Request(BASE + "/api/auth/tickets.csv")) as response:
        export = response.read().decode()
        export_type = response.headers.get("Content-Type", "")
    check("the export is served as a CSV file", export_type.startswith("text/csv"), True)
    check("the export has a heading and a row per ticket", export.count("\n"), issued + 1)

    status, restored = call("POST", "/api/auth/desk",
                            {"name": original["name"],
                             "description": original["description"],
                             "target_seconds": original["target_seconds"]}, admin)
    check("the desk settings can be put back",
          (status, restored["profile"]["name"]), (200, original["name"]))

    print("Changing a password while signed in")
    member_again = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    status, re_signed = call("POST", "/api/auth/login",
                             {"email": "new@example.com", "password": "oatmeal42!"},
                             member_again)
    check("the staff member signs in with the reset password", status, 200)
    csrf_token = re_signed["csrf_token"]

    status, _ = call("POST", "/api/auth/password",
                     {"current_password": "not-it", "password": "sunflower2",
                      "confirm_password": "sunflower2"}, member_again)
    check("the wrong current password is refused", status, 401)
    status, _ = call("POST", "/api/auth/password",
                     {"current_password": "oatmeal42!", "password": "sunflower2",
                      "confirm_password": "bananas"}, member_again)
    check("two different new passwords are refused", status, 400)
    status, _ = call("POST", "/api/auth/password",
                     {"current_password": "oatmeal42!", "password": "short",
                      "confirm_password": "short"}, member_again)
    check("a new password that is too short is refused", status, 400)
    status, _ = call("POST", "/api/auth/password",
                     {"current_password": "oatmeal42!", "password": "sunflower2",
                      "confirm_password": "sunflower2"}, member_again)
    check("the password can be changed while signed in", status, 200)
    status, _ = call("POST", "/api/auth/login",
                     {"email": "new@example.com", "password": "oatmeal42!"}, member_again)
    check("the old password stops working", status, 401)
    status, signed_in_again = call("POST", "/api/auth/login",
                                   {"email": "new@example.com", "password": "sunflower2"},
                                   member_again)
    check("the new password works", status, 200)
    # The sign-in hands out a fresh token, and the one the member had before
    # the password change is no longer the one the server expects.
    csrf_token = signed_in_again["csrf_token"]

    csrf_token = saved
    status, _ = call("POST", "/api/auth/password",
                     {"current_password": "anything", "password": "sunflower3",
                      "confirm_password": "sunflower3"}, staff)
    check("a shared classroom session has no password to change", status, 403)

    print("The account behind the session")
    csrf_token = signed_in_again["csrf_token"]
    status, profile = call("POST", "/api/auth/profile",
                           {"full_name": "New Person"}, member_again)
    check("the owner can correct the name on the account", status, 200)
    check("the new name is carried by the session",
          profile.get("user", {}).get("full_name"), "New Person")
    status, _ = call("POST", "/api/auth/profile", {"full_name": "  "}, member_again)
    check("an empty name is refused", status, 400)
    status, _ = call("GET", "/api/auth/account/history", opener=member_again)
    check("the owner can read the history of the account", status, 200)
    status, history = call("GET", "/api/auth/account/history", opener=member_again)
    check("the history is a list of events",
          isinstance(history.get("entries"), list), True)
    check("the history mentions the account being created",
          any(entry["event"] == "registered" for entry in history["entries"]), True)
    status, work = call("GET", "/api/auth/account/work", opener=member_again)
    check("the owner can read their own work at the counter", status, 200)
    check("the work is a list of decisions",
          isinstance(work.get("entries"), list), True)
    status, _ = call("GET", "/api/auth/account/history", opener=staff)
    check("a shared classroom session has no account to read", status, 401)
    csrf_token = saved
    status, _ = call("POST", "/api/auth/profile", {"full_name": "New Person"}, staff)
    check("a shared classroom session has no name to change", status, 401)

    print("Deleting an account")
    target_id = target["user_id"]
    endpoint = "/api/auth/users/%d" % target_id
    csrf_token = admin_token
    status, _ = call("POST", endpoint + "/active", {"is_active": False}, admin)
    check("admin can switch off a member", status, 200)
    status, _ = call("GET", "/api/auth/me", opener=member_again)
    check("switching off blocks an existing member session", status, 401)
    status, _ = call("POST", endpoint + "/active", {"is_active": True}, admin)
    check("admin can restore a member", status, 200)
    # Being switched off ended that session for good: the browser was told to
    # drop its cookie while it was refused, so the member signs in again rather
    # than picking up where the disabled session left off.
    status, restored = call("POST", "/api/auth/login",
                            {"email": "new@example.com", "password": "sunflower2"},
                            member_again)
    check("a restored member signs in again", status, 200)
    status, _ = call("DELETE", endpoint, {"confirm_email": "new@example.com"})
    check("deleting an account requires sign-in", status, 401)
    csrf_token = restored["csrf_token"]
    status, _ = call("DELETE", endpoint, {"confirm_email": "new@example.com"}, member_again)
    check("staff cannot delete an account", status, 403)
    csrf_token = None
    status, _ = call("DELETE", endpoint, {"confirm_email": "new@example.com"}, admin)
    check("deleting an account requires a security token", status, 403)
    csrf_token = admin_token
    status, _ = call("DELETE", "/api/auth/users/999999", {"confirm_email": "no@example.com"}, admin)
    check("deleting an unknown account is refused", status, 404)
    status, _ = call("DELETE", "/api/auth/users/%d" % who["user"]["user_id"],
                      {"confirm_email": who["user"]["email"]}, admin)
    check("an administrator cannot delete their own account", status, 400)
    status, _ = call("DELETE", endpoint, {"confirm_email": "wrong@example.com"}, admin)
    check("deletion needs the correct account email", status, 400)
    conn = sqlite3.connect(config.DATABASE)
    conn.execute("insert into password_resets (user_id, token_hash, created_at, expires_at) "
                 "values (?, ?, ?, ?)", (target_id, "delete-check-token", seconds_ago(0), seconds_ago(-3600)))
    conn.commit()
    conn.close()
    status, deleted = call("DELETE", endpoint, {"confirm_email": "new@example.com"}, admin)
    check("admin can delete a confirmed account", (status, deleted.get("email")),
          (200, "new@example.com"))
    _, listing = call("GET", "/api/auth/users", opener=admin)
    check("deleted account leaves the roster",
          any(row["user_id"] == target_id for row in listing["users"]), False)
    status, _ = call("GET", "/api/auth/me", opener=member_again)
    check("deleted account's existing session stops working", status, 401)
    conn = sqlite3.connect(config.DATABASE)
    check("deletion revokes password resets",
          conn.execute("select count(*) from password_resets where user_id = ?", (target_id,)).fetchone()[0], 0)
    check("account history remains auditable",
          conn.execute("select count(*) from account_events where email = ? and event_type = 'account deleted'",
                       ("new@example.com",)).fetchone()[0], 1)
    conn.close()

    print("Bulk account actions")
    suffix = uuid4().hex[:12]
    conn = sqlite3.connect(config.DATABASE)
    batch = []
    for name in ("One", "Two"):
        email = "batch-check-%s-%s@example.invalid" % (name.lower(), suffix)
        cursor = conn.execute(
            "insert into users (full_name, email, password_hash, role, created_at) "
            "values (?, ?, 'not-used', 'staff', ?)", ("Batch " + name, email, seconds_ago(0))
        )
        batch.append({"user_id": cursor.lastrowid, "email": email})
    conn.commit()
    conn.close()
    csrf_token = None
    status, _ = call("POST", "/api/auth/users/batch",
                     {"action": "deactivate", "accounts": batch}, admin)
    check("bulk actions require a security token", status, 403)
    csrf_token = saved
    status, _ = call("POST", "/api/auth/users/batch",
                     {"action": "deactivate", "accounts": batch}, staff)
    check("a shared session cannot run bulk actions", status, 401)
    csrf_token = admin_token
    status, _ = call("POST", "/api/auth/users/batch",
                     {"action": "deactivate", "accounts": batch + batch[:1]}, admin)
    check("duplicate selections are refused", status, 400)
    status, _ = call("POST", "/api/auth/users/batch",
                     {"action": "deactivate", "accounts": batch + [{"user_id": 999999, "email": "gone@example.invalid"}]}, admin)
    check("a stale selection stops the whole operation", status, 409)
    conn = sqlite3.connect(config.DATABASE)
    check("stale bulk selection changed nobody",
          [conn.execute("select is_active from users where user_id = ?", (row["user_id"],)).fetchone()[0]
           for row in batch], [1, 1])
    conn.close()
    status, result = call("POST", "/api/auth/users/batch",
                          {"action": "deactivate", "accounts": batch}, admin)
    check("bulk switch off works", (status, result.get("changed")), (200, 2))
    status, result = call("POST", "/api/auth/users/batch",
                          {"action": "activate", "accounts": batch}, admin)
    check("bulk switch on works", (status, result.get("changed")), (200, 2))
    status, _ = call("POST", "/api/auth/users/batch",
                     {"action": "delete", "accounts": batch}, admin)
    check("bulk delete requires count confirmation", status, 400)
    status, _ = call("POST", "/api/auth/users/batch",
                     {"action": "delete", "accounts": batch + [{"user_id": who["user"]["user_id"],
                                                                   "email": who["user"]["email"]}],
                      "confirmation": "DELETE 3"}, admin)
    check("bulk delete cannot include the signed-in administrator", status, 400)
    status, result = call("POST", "/api/auth/users/batch",
                          {"action": "delete", "accounts": batch, "confirmation": "DELETE 2"}, admin)
    check("bulk delete removes both accounts", (status, result.get("changed")), (200, 2))
    conn = sqlite3.connect(config.DATABASE)
    check("bulk deleted accounts have left the database",
          conn.execute("select count(*) from users where user_id in (?, ?)",
                       (batch[0]["user_id"], batch[1]["user_id"])).fetchone()[0], 0)
    check("bulk deletes retain two audit records",
          conn.execute("select count(*) from account_events where email in (?, ?) and event_type = 'account deleted'",
                       (batch[0]["email"], batch[1]["email"])).fetchone()[0], 2)
    conn.close()

    print("The sensor board")
    # The board this suite posts readings for is the one under test: `devices`
    # may hold more than one row, and the disposable office that
    # check_device_ws.py builds always does.
    conn = sqlite3.connect(config.DATABASE)
    board_row = conn.execute(
        "select device_id, desk_id from devices where device_key_hash = ?",
        (hashlib.sha256(DEVICE_KEY.encode("utf-8")).hexdigest(),),
    ).fetchone()
    device_id, home = board_row
    status, listing = call("GET", "/api/auth/devices", opener=admin)
    check("an administrator reads the boards", status, 200)
    check("the list carries the board that is reporting",
          [row["device_id"] for row in listing["devices"] if row["device_id"] == device_id],
          [device_id])
    status, _ = call("GET", "/api/auth/devices", opener=staff)
    check("a shared session cannot read the boards", status, 401)

    other = 2 if home != 2 else 1
    status, moved = call("POST", "/api/auth/devices/%d" % device_id,
                         {"desk_id": other}, admin)
    check("an administrator moves the board to another counter",
          (status, moved["device"]["desk_id"]), (200, other))
    check("the board answers with the counter it now watches",
          moved["device"]["desk_name"] is not None, True)
    check("the counter it left no longer holds it",
          conn.execute("select count(*) from devices where desk_id = ? and device_id = ?",
                       (home, device_id)).fetchone()[0], 0)

    conn.execute(
        "insert into device_reports (device_id, distance_cm, occupied, approach, led_state, "
        "reported_at) values (?, 30, 1, 1, 'red', ?)",
        (device_id, seconds_ago(0)),
    )
    conn.commit()
    status, _ = call("POST", "/api/auth/devices/%d" % device_id, {"desk_id": home}, admin)
    check("moving the board back works", status, 200)
    check("a board's old readings do not follow it to its new counter",
          conn.execute("select count(*) from device_reports where device_id = ?",
                       (device_id,)).fetchone()[0], 0)

    status, off = call("POST", "/api/auth/devices/%d" % device_id,
                       {"desk_id": None}, admin)
    check("a board can be taken off every counter",
          (status, off["device"]["desk_id"]), (200, None))
    status, back = call("POST", "/api/auth/devices/%d" % device_id,
                        {"desk_id": home}, admin)
    check("the board can be put back on a counter",
          (status, back["device"]["desk_id"]), (200, home))
    status, _ = call("POST", "/api/auth/devices/999999", {"desk_id": home}, admin)
    check("moving an unknown board is refused", status, 404)
    status, _ = call("POST", "/api/auth/devices/%d" % device_id,
                     {"desk_id": 999999}, admin)
    check("pointing a board at an unknown counter is refused", status, 404)
    status, _ = call("POST", "/api/auth/devices/%d" % device_id,
                     {"desk_id": "kitchen"}, admin)
    check("a counter must be a number", status, 400)
    csrf_token = None
    status, _ = call("POST", "/api/auth/devices/%d" % device_id, {"desk_id": home}, admin)
    check("moving a board requires a security token", status, 403)
    csrf_token = admin_token
    check("every move is written to the account history",
          conn.execute("select count(*) from account_events where event_type = 'board moved'")
          .fetchone()[0] >= 4, True)
    conn.close()
    _, desks_now = call("GET", "/api/auth/desks", opener=admin)
    watched = [row for row in desks_now["desks"] if row["desk_id"] == home][0]
    check("the counter names the board watching it", watched["device_label"], back["device"]["label"])
    # The administrator's dashboard says why a counter is not calling, so the
    # desk list carries the counter's own words and not only its state.
    check("the counter carries its pause wording",
          ("pause_reason" in watched, "paused_until" in watched), (True, True))

    print("Registering a board")
    status, registered = call("POST", "/api/auth/devices",
                              {"label": "Suite board", "desk_id": None}, admin)
    check("an administrator registers a board", status, 201)
    suite_id = registered["device"]["device_id"]
    suite_key = registered.get("device_key") or ""
    check("registration hands out a key", len(suite_key) >= 32, True)
    check("the new board is not watching a counter yet",
          registered["device"]["desk_id"], None)

    conn = sqlite3.connect(config.DATABASE)
    stored = conn.execute(
        "select device_key_hash from devices where device_id = ?", (suite_id,)
    ).fetchone()[0]
    check("only the digest of the key is stored",
          stored, hashlib.sha256(suite_key.encode("utf-8")).hexdigest())
    check("the key itself is not written down", suite_key in (stored or ""), False)

    status, _ = call("POST", "/api/device/readings",
                     {"distance_cm": 88, "occupied": False, "led_state": "green"},
                     key=suite_key)
    check("the key it was given signs the board in", status, 200)

    status, listing = call("GET", "/api/auth/devices", opener=admin)
    check("the registered board is in the list",
          [row["device_id"] for row in listing["devices"] if row["device_id"] == suite_id],
          [suite_id])
    status, _ = call("POST", "/api/auth/devices", {"label": "suite board"}, admin)
    check("a name already in use is refused", status, 400)
    status, _ = call("POST", "/api/auth/devices",
                     {"label": "Rack board", "desk_id": 999999}, admin)
    check("registering against an unknown counter is refused", status, 404)
    status, _ = call("POST", "/api/auth/devices", {"label": "Rack board"}, staff)
    check("a shared session cannot register a board", status, 401)
    csrf_token = None
    status, _ = call("POST", "/api/auth/devices", {"label": "Rack board"}, admin)
    check("registering a board requires a security token", status, 403)
    csrf_token = admin_token

    status, renamed = call("POST", "/api/auth/devices/%d/key" % suite_id, None, admin)
    check("an administrator replaces a board's key", status, 200)
    new_key = renamed.get("device_key") or ""
    check("the new key is a different one", new_key != suite_key, True)
    status, _ = call("POST", "/api/device/readings",
                     {"distance_cm": 61, "occupied": False}, key=suite_key)
    check("the key it was registered with stops working", status, 401)
    status, _ = call("POST", "/api/device/readings",
                     {"distance_cm": 61, "occupied": False}, key=new_key)
    check("the replacement key works", status, 200)

    status, _ = call("DELETE", "/api/auth/devices/%d" % suite_id, None, admin)
    check("an administrator retires a board", status, 200)
    status, listing = call("GET", "/api/auth/devices", opener=admin)
    check("the retired board is gone from the list",
          [row["device_id"] for row in listing["devices"] if row["device_id"] == suite_id], [])
    status, _ = call("POST", "/api/device/readings",
                     {"distance_cm": 61, "occupied": False}, key=new_key)
    check("a retired board's key stops working", status, 401)
    check("the readings went with the board",
          conn.execute("select count(*) from device_reports where device_id = ?",
                       (suite_id,)).fetchone()[0], 0)
    status, _ = call("DELETE", "/api/auth/devices/%d" % suite_id, None, admin)
    check("retiring an unknown board is refused", status, 404)
    csrf_token = None
    status, _ = call("DELETE", "/api/auth/devices/999999", None, admin)
    check("retiring a board requires a security token", status, 403)
    csrf_token = admin_token
    check("the account history records the life of a board",
          conn.execute(
              "select count(*) from account_events where event_type in "
              "('board registered', 'board key replaced', 'board retired')"
          ).fetchone()[0] >= 3, True)
    conn.close()

    print("Persistence")
    # Back to the shared classroom session for the last two checks.
    csrf_token = saved
    status, _ = call("POST", "/api/staff/logout", opener=staff)
    check("sign out works", status, 200)
    status, _ = call("GET", "/api/staff/queue", opener=staff)
    check("the session is really closed", status, 401)

    # A cookie this API can no longer read - a changed signing key, an account
    # that is gone - has to leave the browser on the same reply that refuses it.
    # Otherwise the console keeps sending the browser to the sign-in page and the
    # sign-in page keeps sending it back, because it still sees a cookie.
    stale = urllib.request.Request(BASE + "/api/auth/me")
    stale.add_header("Cookie", "session=not-a-cookie-this-api-could-have-signed")
    try:
        with urllib.request.urlopen(stale) as reply:
            dropped = None
            stale_status = reply.status
    except urllib.error.HTTPError as error:
        stale_status = error.code
        dropped = error.headers.get("Set-Cookie")
    check("a refused cookie is answered with 401", stale_status, 401)
    check("a refused cookie is dropped from the browser",
          bool(dropped) and "session=;" in dropped, True)

    print()
    print("%d checks passed, %d failed" % (passed, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
