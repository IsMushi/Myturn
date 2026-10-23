"""Real WebSocket/HTTP integration checks in a disposable office.

Run with the API venv. No live server, accounts, keys or database are touched.
--smoke also runs the existing HTTP suite against this disposable server.
"""
import argparse
from http.cookiejar import CookieJar
import json
import logging
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--smoke", action="store_true")
    args = parser.parse_args()
    root = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "Temp" / "opencode"
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="device-ws-", dir=root) as folder:
        key = secrets.token_urlsafe(24)
        password = secrets.token_urlsafe(24)
        admin_password = secrets.token_urlsafe(24)
        database = str(Path(folder) / "check.db")
        os.environ.update({"MYTURN_DB": database, "MYTURN_DATA_DIR": folder,
                           "MYTURN_SECRET": secrets.token_urlsafe(32), "MYTURN_STAFF_PASSWORD": password,
                           "MYTURN_ADMIN_EMAIL": "ws-verification@example.com", "MYTURN_ADMIN_PASSWORD": admin_password,
                           "MYTURN_SECURE_COOKIES": "0", "MYTURN_DEV_TOKENS": "1"})
        # Imports happen only AFTER isolating every persistent path.
        from app import app
        from db import connect
        from security import hash_device_key, hash_password
        from util import now
        from werkzeug.serving import make_server
        import routes.device_ws as device_ws

        conn = connect(database)
        conn.execute("insert into devices (label, device_key_hash, desk_id) values (?, ?, 1)",
                     ("Service desk 1", hash_device_key(key)))
        key2 = secrets.token_urlsafe(24)
        conn.execute("insert into devices (label, device_key_hash, desk_id) values (?, ?, 2)",
                     ("Socket check 2", hash_device_key(key2)))
        conn.execute("insert into users (full_name, email, password_hash, role, created_at) values (?, ?, ?, 'admin', ?)",
                     ("WS verification", app.config["ADMIN_EMAIL"], hash_password(admin_password), now()))
        conn.close()
        Path(folder, "device_key.txt").write_text(key, encoding="utf-8")
        logging.getLogger("werkzeug").setLevel(logging.ERROR)
        app.logger.setLevel(logging.ERROR)  # Do not print development reset links from the HTTP suite.
        server = make_server("127.0.0.1", 0, app, threaded=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = f"http://127.0.0.1:{server.server_port}"
        try:
            verify(app, origin, database, key, key2, password)
            if args.smoke:
                # No socket remains to sweep tickets while the legacy suite backdates them.
                import smoke_test
                smoke_test.BASE = origin
                smoke_test.DEVICE_KEY = key
                smoke_test.main()
                assert smoke_test.failed == 0, "HTTP smoke checks failed"
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


def verify(app, origin, database, key, key2, password):
    from broadcast import signal, subscribe, unsubscribe
    from simple_websocket import Client, ConnectionClosed
    from security import hash_device_key
    from util import now, soon
    import routes.device_ws as device_ws

    checks = 0
    sockets = []
    cookies = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    csrf = None

    def passed(name):
        nonlocal checks
        checks += 1
        print("PASS", name)

    def sql(query, values=()):
        conn = sqlite3.connect(database)
        try:
            with conn:
                return conn.execute(query, values).fetchall()
        finally:
            conn.close()

    def http(path, body=None, device_key=None):
        request = urllib.request.Request(origin + path,
                    data=json.dumps(body).encode() if body is not None else None,
                    headers={"Content-Type": "application/json", **({"X-CSRF-Token": csrf} if csrf else {}),
                             **({"X-Device-Key": device_key} if device_key else {})})
        try:
            with opener.open(request, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def receive(ws, predicate, timeout=3):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            raw = ws.receive(timeout=min(.2, max(0, until - time.monotonic())))
            if raw is not None:
                value = json.loads(raw)
                if predicate(value):
                    return value
        raise AssertionError("Expected WebSocket message did not arrive")

    def opened(secret=key):
        ws = Client(origin.replace("http://", "ws://") + "/ws/device")
        sockets.append(ws)
        ws.send(json.dumps({"type": "hello", "key": secret}))
        first = receive(ws, lambda frame: frame["type"] == "state")
        assert first["initial"] is True
        return ws, first

    def closed(ws, timeout=3, reason=1008):
        try:
            receive(ws, lambda frame: False, timeout)
        except ConnectionClosed as error:
            if reason is not None:
                assert int(error.reason) == reason, error
            return
        raise AssertionError("Socket did not close")

    def sent(ws, sequence, **values):
        reading = {"type": "reading", "sequence": sequence, "distance_cm": 160,
                   "occupied": False, "approach": False, "led_state": "green", **values}
        ws.send(json.dumps(reading))
        return receive(ws, lambda frame: frame.get("type") == "ack" and frame.get("sequence") == sequence)

    try:
        status, session = http("/api/staff/login", {"name": "Socket verification", "password": password})
        assert status == 200
        csrf = session["csrf_token"]
        ws, initial = opened()
        assert initial["desk_id"] == 1 and initial["service_state"] == "paused"
        assert initial["call_event_id"] is None
        passed("Authenticated socket receives its authoritative initial desk baseline")
        ws2, second = opened(key2)
        assert second["desk_id"] == 2
        passed("Two boards authenticate into different desks")
        assert all(isinstance(identifier, int) for identifier in device_ws.CONNECTED)
        passed("Connection registry stores numeric device IDs, not plaintext device keys")

        for hello in [{"type": "reading", "key": key}, {"type": "hello"},
                      {"type": "hello", "key": "invalid"}, [], {"type": "hello", "key": 123}]:
            bad = Client(origin.replace("http://", "ws://") + "/ws/device")
            sockets.append(bad)
            bad.send(json.dumps(hello))
            closed(bad)
        passed("Wrong keys, wrong hello types and malformed hello objects are refused")
        silent = Client(origin.replace("http://", "ws://") + "/ws/device")
        sockets.append(silent)
        closed(silent, timeout=7)
        passed("Unauthenticated sockets cannot wait indefinitely for a hello")

        assert http("/api/staff/service", {"desk": 1, "service_state": "active"})[0] == 200
        active = receive(ws, lambda frame: frame.get("service_state") == "active")
        assert active["initial"] is False
        assert active["desk_id"] == 1
        passed("Opening a desk pushes its new state without any device HTTP polling")
        frame = ws2.receive(timeout=.2)
        if frame:
            assert json.loads(frame)["desk_id"] == 2 and json.loads(frame)["service_state"] == "paused"
        passed("A desk update never sends another desk's state to the second board")

        channel = subscribe()
        try:
            ack = sent(ws, 1, chip_id="ab12", mac="aa:bb:cc:dd:ee:ff", approach=True,
                       led_state="red+yellow")
            assert ack["server_time"]
            channel.get(timeout=1)
        finally:
            unsubscribe(channel)
        _, dashboard = http("/api/staff/queue?desk=1")
        assert dashboard["device"]["distance_cm"] == 160
        assert dashboard["device"]["chip_id"] == "ab12" and dashboard["device"]["approach"]
        passed("Socket telemetry is acknowledged, committed and broadcast to browser dashboards")
        assert dashboard["device"]["led_state"] == "red+yellow"
        passed("Combined red/yellow fault indication is preserved in dashboard telemetry")
        before = sql("select count(*) from device_reports")[0][0]
        sent(ws, 1, distance_cm=5, occupied=True)
        assert sql("select count(*) from device_reports")[0][0] == before
        assert sql("select distance_cm from device_reports order by report_id desc limit 1")[0][0] == 160
        passed("Duplicate sequence numbers are acknowledged without replaying stale measurements")

        assert http("/api/tickets", {"service": "A", "contact": "visitor@example.test"})[0] == 201
        status, called = http("/api/staff/call-next", {"desk": 1})
        assert status == 200
        call = receive(ws, lambda frame: frame.get("call_event") == "called")
        assert call["call_event_id"] > 0 and call["call_event_age_seconds"] >= 0
        assert not call["initial"]
        passed("Calling a visitor pushes a fresh, uniquely identified call event")
        assert http(f"/api/staff/tickets/{called['ticket_id']}/recall", {})[0] == 200
        recall = receive(ws, lambda frame: frame.get("call_event") == "recalled")
        assert recall["call_event_id"] > call["call_event_id"]
        passed("Recall pushes a different event ID so the board can announce it once")
        ws.send(json.dumps({"type": "ping"}))
        receive(ws, lambda frame: frame.get("type") == "pong")
        passed("Application heartbeat round trips over the same socket")
        heartbeat = receive(ws, lambda frame: frame.get("type") == "state", timeout=7)
        assert heartbeat["call_event_id"] == recall["call_event_id"] and not heartbeat["initial"]
        passed("Periodic authoritative state keeps the board fresh without replaying call IDs")

        assert http(f"/api/staff/tickets/{called['ticket_id']}/action", {"action": "complete"})[0] == 200
        receive(ws, lambda frame: frame.get("type") == "state" and frame.get("call_event_id") is None)
        assert http(f"/api/staff/tickets/{called['ticket_id']}/undo", {})[0] == 200
        receive(ws, lambda frame: frame.get("call_event_id") == recall["call_event_id"])
        passed("Completion clears the call; undo restores desk state without inventing a new call event")
        for state in ("paused", "closed", "active"):
            assert http("/api/staff/service", {"desk": 1, "service_state": state})[0] == 200
            receive(ws, lambda frame: frame.get("service_state") == state)
        passed("Pause, close and reopen are pushed to the board")
        status, legacy = http("/api/device/setting", device_key=key)
        assert status == 200 and legacy["service_state"] == "active"
        assert legacy["call_event_id"] == recall["call_event_id"]
        passed("Legacy HTTP settings retain the exact same authoritative state")

        replacement, baseline = opened()
        assert baseline["call_event_id"] == recall["call_event_id"] and baseline["initial"]
        closed(ws, reason=1001)
        assert device_ws.CONNECTED.get(1) is not None
        assert http("/api/staff/service", {"desk": 1, "service_state": "paused"})[0] == 200
        receive(replacement, lambda frame: frame.get("service_state") == "paused")
        ws = replacement
        passed("Reconnect supplies a quiet baseline; old connection cleanup does not unregister the new one")

        sql("update devices set desk_id = 2 where device_id = 1")
        signal()
        reassigned = receive(ws, lambda frame: frame.get("desk_id") == 2)
        assert reassigned["service_state"] == "paused"
        sql("update desks set is_active = 0 where desk_id = 2")
        signal()
        receive(ws, lambda frame: frame.get("service_state") == "closed")
        sql("update desks set is_active = 1 where desk_id = 2")
        sql("update devices set desk_id = 1 where device_id = 1")
        signal()
        receive(ws, lambda frame: frame.get("desk_id") == 1)
        passed("Desk reassignment and retirement are synchronized from the database")
        rotated = secrets.token_urlsafe(24)
        sql("update devices set device_key_hash = ? where device_id = 1", (hash_device_key(rotated),))
        signal()
        closed(ws)
        ws, _ = opened(rotated)
        sql("update devices set device_key_hash = ? where device_id = 1", (hash_device_key(key),))
        signal()
        closed(ws)
        ws, _ = opened()
        passed("Changing a device key revokes an existing socket; replacement credentials work")

        for extra in [{"distance_cm": float("nan")}, {"occupied": "yes"}, {"sequence": True}]:
            invalid, _ = opened(key2)
            invalid.send(json.dumps({"type": "reading", "sequence": 1, "distance_cm": 40, **extra}))
            closed(invalid)
        assert not sql("select report_id from device_reports where device_id = 2")
        passed("Invalid telemetry is refused before it can change device reports")
        assert http("/api/device/readings", {"distance_cm": "NaN"}, device_key=key)[0] == 400
        passed("HTTP and WebSocket telemetry share finite-number validation")

        sql("delete from device_reports where device_id = 1")
        sql("update tickets set called_at = ? where ticket_id = ?", (soon(-30), called["ticket_id"]))
        assert http("/api/staff/service", {"desk": 1, "service_state": "active"})[0] == 200
        receive(ws, lambda frame: frame.get("service_state") == "active")
        sent(ws, 1, distance_cm=-1)
        _, faulted = http("/api/staff/queue?desk=1")
        assert faulted["called"] is not None and not faulted["hold_shortened"]
        passed("A connected board with a faulted ultrasonic reading cannot shorten the visitor hold")
        sql("update tickets set called_at = ? where ticket_id = ?", (soon(-50), called["ticket_id"]))
        sql("update device_reports set distance_cm = 160, reported_at = ? where device_id = 1", (soon(-40),))
        sql("update devices set last_seen = ? where device_id = 1", (now(),))
        ws.send(json.dumps({"type": "ping"}))
        receive(ws, lambda frame: frame.get("type") == "pong")
        _, stale = http("/api/staff/queue?desk=1")
        assert stale["called"] is not None and not stale["hold_shortened"]
        passed("Transport heartbeats cannot make an old sensor reading fresh")
        sql("delete from device_reports where device_id = 1")
        sql("update tickets set called_at = ? where ticket_id = ?", (soon(-30), called["ticket_id"]))
        sent(ws, 2, distance_cm=160, occupied=False, approach=False)
        cleared = receive(ws, lambda frame: frame.get("type") == "state" and frame.get("call_event_id") is None)
        assert cleared["service_state"] == "active"
        number, state = sql("select ticket_no, status from tickets where ticket_id = ?", (called["ticket_id"],))[0]
        assert state == "waiting" and number > called["ticket_no"]
        passed("Fresh empty-counter evidence requeues an expired call with a new server-issued number")

        old_idle = device_ws.IDLE_TIMEOUT_SECONDS
        device_ws.IDLE_TIMEOUT_SECONDS = 1
        try:
            idle, _ = opened(key2)
            closed(idle, timeout=3, reason=1001)
        finally:
            device_ws.IDLE_TIMEOUT_SECONDS = old_idle
        passed("Silent authenticated devices are disconnected rather than left as zombie sockets")
        print(f"\n{checks} WebSocket/workflow checks passed; live office untouched.\n")
    finally:
        for ws in sockets:
            try:
                ws.close()
            except ConnectionClosed:
                pass
        deadline = time.monotonic() + 3
        while device_ws.CONNECTED and time.monotonic() < deadline:
            time.sleep(.05)
        assert not device_ws.CONNECTED, "Socket registry leaked a connection"


if __name__ == "__main__":
    main()
