"""End to end check of the MyTurn API.

Run it while the API is up:

    .venv\\Scripts\\python.exe smoke_test.py

It follows the same order a real session would: visitors take tickets, staff
sign in, call and close a ticket, the board sends readings, and the hold rule is
exercised by back-dating the call time in the database.
"""
import http.cookiejar
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

import config

BASE = "http://127.0.0.1:5000"
DEVICE_KEY = (Path(config.DATA_DIR) / "device_key.txt").read_text(encoding="utf-8").strip()

passed = 0
failed = 0


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
    """Clear the transactional tables so the run starts from a known state."""
    conn = sqlite3.connect(config.DATABASE)
    conn.execute("delete from ticket_events")
    conn.execute("delete from tickets")
    conn.execute("delete from device_reports")
    conn.execute("delete from desk_settings")
    conn.execute("update counters set value = 0 where name = 'ticket'")
    conn.execute("delete from sqlite_sequence")
    conn.execute(
        "insert into desk_settings (service_state, updated_at, updated_by) "
        "values ('paused', '2026-01-01T00:00:00+00:00', 'smoke-test')"
    )
    conn.commit()
    conn.close()


def main():
    reset()
    print("Visitors")
    status, health = call("GET", "/api/health")
    check("health", status, 200)

    status, first = call("POST", "/api/tickets", {"source": "qr"})
    check("first ticket is number 1", first.get("ticket_no"), 1)
    check("first ticket has nothing ahead", first.get("ahead"), 0)

    _, second = call("POST", "/api/tickets", {"source": "qr"})
    _, third = call("POST", "/api/tickets", {"source": "qr"})
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

    print("Staff")
    status, _ = call("POST", "/api/staff/call-next")
    check("call-next needs a session", status, 401)
    status, _ = call("POST", "/api/staff/login", {"name": "Leah", "password": "wrong"})
    check("wrong password is refused", status, 401)

    jar = http.cookiejar.CookieJar()
    staff = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, login = call("POST", "/api/staff/login", {"name": "Leah", "password": config.STAFF_PASSWORD}, staff)
    check("sign in succeeds", (status, login.get("staff")), (200, "Leah"))

    _, queue = call("GET", "/api/staff/queue", opener=staff)
    check("queue shows three waiting", queue["waiting"], 3)
    check("queue shows the board label", queue["device"]["label"], "Service desk 1")
    check("board counts as offline before any report", queue["device"]["online"], False)

    status, service = call("POST", "/api/staff/service", {"service_state": "active"}, staff)
    check("desk can be set active", (status, service["service_state"]), (200, "active"))
    status, _ = call("POST", "/api/staff/service", {"service_state": "busy"}, staff)
    check("unknown service state is refused", status, 400)

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

    _, queue = call("GET", "/api/staff/queue", opener=staff)
    device = queue["device"]
    check("dashboard sees the board online", device["online"], True)
    check("dashboard sees the distance", device["distance_cm"], 41.5)
    check("dashboard sees the approach", device["approach"], True)
    check("dashboard sees the light the board applied", device["led_state"], "red")

    print("Hold rule")
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
        "select ticket_no, status from tickets where ticket_no = 4"
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

    print("Persistence")
    status, _ = call("POST", "/api/staff/logout", opener=staff)
    check("sign out works", status, 200)
    status, _ = call("GET", "/api/staff/queue", opener=staff)
    check("the session is really closed", status, 401)

    print()
    print("%d checks passed, %d failed" % (passed, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
