"""Exercise the staff UI against a disposable Flask database, never the live queue.

Requires the web server and Python Playwright. The API venv is used only to launch
an isolated API on a free loopback port. All browser /api requests are intercepted
and forwarded there, including writes. No existing server is stopped or reset.
"""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--output-dir", type=Path,
                        default=Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "Temp" / "opencode" / "staff-dashboard-verification")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="isolated-api-", dir=args.output_dir) as temporary:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        password = secrets.token_urlsafe(24)
        device_key = secrets.token_urlsafe(24)
        env = {**os.environ, "MYTURN_DB": str(Path(temporary) / "test.db"),
               "MYTURN_DATA_DIR": temporary, "MYTURN_SECRET": secrets.token_urlsafe(32),
               "MYTURN_STAFF_PASSWORD": password, "MYTURN_DEV_TOKENS": "0",
               "MYTURN_UI_DEVICE_KEY": device_key, "MYTURN_HOLD_SECONDS": "600",
               "MYTURN_MIN_CALL_SECONDS": "600", "MYTURN_TICKET_ATTEMPTS": "1000",
               "MYTURN_LOGIN_ATTEMPTS": "100", "MYTURN_SECURE_COOKIES": "0"}
        startup = """
import os
from datetime import datetime, timedelta, timezone
from app import app
from db import connect
from security import hash_device_key
from werkzeug.serving import make_server
conn = connect(app.config['DATABASE'])
stamp = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
conn.execute('insert into devices (label, device_key_hash, desk_id, last_seen) values (?, ?, 1, ?)',
             ('Verification board', hash_device_key(os.environ['MYTURN_UI_DEVICE_KEY']), stamp))
conn.execute('insert into device_reports (device_id, distance_cm, occupied, approach, led_state, reported_at) values (1, 140, 0, 0, ?, ?)', ('green', stamp))
conn.commit()
conn.close()
make_server('127.0.0.1', int(os.environ['MYTURN_UI_PORT']), app, threaded=True).serve_forever()
"""
        env["MYTURN_UI_PORT"] = str(port)
        with (args.output_dir / "isolated-api.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen([str(ROOT / "api" / ".venv" / "Scripts" / "python.exe"), "-c", startup],
                                       cwd=ROOT / "api", env=env, stdout=log, stderr=log)
            try:
                origin = f"http://127.0.0.1:{port}"
                for _ in range(100):
                    if process.poll() is not None:
                        raise RuntimeError("Isolated API failed; see isolated-api.log")
                    try:
                        with urlopen(origin + "/api/health", timeout=1):
                            break
                    except OSError:
                        time.sleep(.1)
                else:
                    raise RuntimeError("Isolated API did not start")
                verify(args, origin, password, device_key)
            finally:
                # Windows venv launchers have a child interpreter. Stop only ours.
                if process.poll() is None:
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                process.wait(timeout=15)


def verify(args, origin, password, device_key):
    checks = []

    def passed(name):
        checks.append(name)
        print("PASS", name)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1100}, service_workers="block")
        mode = {"queue_error": None, "hold_queue": False, "hold_desks": False,
                "empty_desks": False, "undo_error": False, "slow_write": False}
        held = []
        writes = []
        browser_errors = []

        def route_api(route):
            request = route.request
            path = request.url.split("/api/", 1)[1]
            if path.startswith("events"):
                route.abort()  # Exercise the real polling fallback, not a fake live badge.
                return
            if request.method == "POST":
                writes.append(path)
            if path.startswith("staff/queue"):
                if mode["hold_queue"]:
                    held.append(route)
                    return
                if mode["queue_error"]:
                    route.fulfill(status=mode["queue_error"], json={"error": "Verification: queue unavailable"})
                    return
            if path.startswith("staff/desks"):
                if mode["hold_desks"]:
                    held.append(route)
                    return
                if mode["empty_desks"]:
                    route.fulfill(json={"desks": [], "server_time": "2026-01-01T00:00:00+00:00"})
                    return
            if "/undo" in path and mode["undo_error"]:
                route.fulfill(status=409, json={"error": "Verification: undo refused"})
                return
            if path.startswith("staff/call-next") and mode["slow_write"]:
                held.append(route)
                return
            response = route.fetch(url=origin + "/api/" + path, timeout=15000)
            route.fulfill(response=response)

        context.route("**/api/**", route_api)
        page = context.new_page()
        page.on("pageerror", lambda error: browser_errors.append(str(error)))
        connection_toast = page.get_by_test_id("queue-connection-toast")

        def api(path, body=None, headers=None):
            return page.evaluate("""async ({path, body, headers}) => {
                const response = await fetch(path, {
                    method: body === null ? 'GET' : 'POST',
                    headers: {'Content-Type':'application/json', ...headers},
                    body: body === null ? undefined : JSON.stringify(body)
                });
                return {status: response.status, body: await response.json()};
            }""", {"path": path, "body": body, "headers": headers or {}})

        def screenshot(name):
            page.screenshot(path=str(args.output_dir / (name + ".png")), full_page=True)

        def assert_no_overflow():
            # Recharts responds to viewport changes through ResizeObserver;
            # inspect settled layout, not its previous-width intermediate frame.
            page.wait_for_function("document.documentElement.scrollWidth <= innerWidth", timeout=5000)
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), "Horizontal overflow"

        def focus_workspace():
            page.get_by_role("heading", name="Service desk", exact=True).click()

        def release_held():
            pending_routes = held[:]
            held.clear()
            for route in pending_routes:
                try:
                    route.abort()
                except Exception:
                    pass

        try:
            page.goto(args.base_url + "/auth/login", wait_until="domcontentloaded")
            result = api("/api/staff/login", {"name": "UI verification", "password": password})
            assert result["status"] == 200
            mode["hold_desks"] = True
            page.goto(args.base_url + "/staff/dashboard", wait_until="domcontentloaded")
            expect(page.get_by_test_id("staff-dashboard-skeleton")).to_be_visible()
            expect(page.get_by_text("No desks available", exact=True)).to_have_count(0)
            screenshot("loading")
            passed("Initial desk loading is not misreported as an empty office")
            mode["hold_desks"] = False
            release_held()
            page.reload(wait_until="domcontentloaded")
            expect(page.get_by_role("heading", name="Desk paused", exact=True)).to_be_visible()
            passed("Paused, empty desk loads from the isolated Flask API")
            expect(page.get_by_role("button", name="Sign out", exact=True)).to_have_count(1)
            expect(page.get_by_role("link", name="Statistics", exact=True)).to_have_count(0)
            passed("Shared staff session has one sign-out and no administrator navigation")
            expect(page.get_by_role("button", name="Call next", exact=True)).to_be_disabled()
            expect(page.get_by_text("The queue is empty", exact=True)).to_be_visible()
            expect(page.get_by_text("Not available", exact=True)).to_be_visible()
            expect(page.get_by_text("LED override", exact=True)).to_have_count(0)
            expect(page.get_by_role("button", name="Set LED", exact=False)).to_have_count(0)
            passed("Honest empty/insufficient-history states and no LED override")
            expect(page.get_by_text("Current occupancy is unknown.", exact=False)).to_be_visible()
            device_toggle = page.locator(".staff-device > summary")
            if device_toggle.count():
                device_toggle.click()
            expect(page.get_by_text("Last reported occupancy", exact=True)).to_be_visible()
            expect(page.get_by_text("Historical report only", exact=False)).to_be_visible()
            if device_toggle.count():
                device_toggle.click()
                expect(page.get_by_text("Last reported occupancy", exact=True)).not_to_be_visible()
            passed("Offline board values are explicitly historical")
            identifiers = page.locator(".staff-device-identity code.font-mono")
            expect(identifiers).to_have_count(2)
            for identifier in identifiers.all():
                assert identifier.evaluate("element => getComputedStyle(element).fontFamily").startswith('"JetBrains Mono"')
            loaded_fonts = page.evaluate("""async () => {
                const faces = await document.fonts.load('11px "JetBrains Mono"', '7ca8 00:00:00:00:00:00');
                return faces.map(face => face.status);
            }""")
            assert loaded_fonts == ["loaded"], loaded_fonts
            assert page.get_by_role("heading", name="Service desk", exact=True).evaluate("element => getComputedStyle(element).fontFamily").startswith('"Google Sans"')
            passed("Chip and MAC load self-hosted JetBrains Mono while normal text remains Google Sans")
            trends_toggle = page.locator(".staff-trends > summary")
            if trends_toggle.count():
                trends_toggle.click()
            expect(page.get_by_role("heading", name="Where the tickets went")).to_be_visible()
            expect(page.get_by_role("button", name="7 days", exact=True)).to_be_visible()
            page.get_by_role("button", name="1 day", exact=True).click()
            expect(page.get_by_role("button", name="1 day", exact=True)).to_have_attribute("aria-pressed", "true")
            if trends_toggle.count():
                trends_toggle.click()
            passed("Service charts retain their working date filter")
            screenshot("desktop-paused")

            for width, height in [(375, 812), (768, 1024), (1024, 768)]:
                page.set_viewport_size({"width": width, "height": height})
                assert_no_overflow()
                expect(page.get_by_role("combobox", name="Working at")).to_be_visible()
                screenshot(f"paused-{width}")
                passed(f"{width}px layout has a usable desk selector and no horizontal overflow")
            page.set_viewport_size({"width": 1440, "height": 1100})
            page.get_by_role("combobox", name="Working at").click()
            page.get_by_role("option", name="Desk 2", exact=False).click()
            expect(page.get_by_role("combobox", name="Working at")).to_contain_text("Desk 2")
            page.reload(wait_until="domcontentloaded")
            expect(page.get_by_role("combobox", name="Working at")).to_contain_text("Desk 2")
            page.get_by_role("combobox", name="Working at").click()
            page.get_by_role("option", name="Desk 1", exact=False).click()
            passed("Desk selection changes service and survives a reload")

            page.get_by_role("button", name="Open", exact=True).click()
            expect(page.get_by_role("button", name="Open", exact=True)).to_have_attribute("aria-pressed", "true")
            expect(page.get_by_role("heading", name="You're all caught up", exact=True)).to_be_visible()
            passed("Opening an empty desk shows its correct operational state")
            for number in range(1, 4):
                page.get_by_role("button", name="Give a walk-in a ticket", exact=True).click()
                expect(page.locator(".staff-walk-in-result")).to_contain_text(f"A{number:03d}")
                expect(page.get_by_role("button", name="Give a walk-in a ticket", exact=True)).to_be_enabled()
            expect(page.locator(".staff-next-row")).to_contain_text("A001")
            expect(page.get_by_role("link", name="Open visitor ticket", exact=True)).to_have_attribute("href", re.compile(r"/ticket/[A-Za-z0-9_-]+"))
            passed("Walk-in tickets use server numbering, FIFO order and opaque tracking links")
            screenshot("desktop-waiting")

            focus_workspace()
            page.keyboard.press("n")
            expect(page.locator("p.tabular-nums").first).to_have_text("A001")
            expect(page.get_by_role("button", name="Served", exact=True)).to_have_count(1)
            passed("N calls the next visitor and the called number remains uniquely locatable")
            page.get_by_role("button", name="Call again", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="A001 called again.")).to_be_visible()
            passed("Recall uses the actual API and displays confirmation")
            page.get_by_role("button", name="Served", exact=True).click()
            expect(page.get_by_role("button", name="Take that back", exact=True)).to_be_visible()
            mode["undo_error"] = True
            page.get_by_role("button", name="Take that back", exact=True).click()
            expect(page.get_by_role("alert").filter(has_text="Verification: undo refused")).to_be_visible()
            expect(page.get_by_role("button", name="Take that back", exact=True)).to_be_visible()
            passed("A failed undo preserves its error and does not discard the undo opportunity")
            mode["undo_error"] = False
            focus_workspace()
            page.keyboard.press("u")
            expect(page.locator("p.tabular-nums").first).to_have_text("A001")
            passed("U restores a completed ticket while no visitor is called")
            page.get_by_role("button", name="No-show", exact=True).click()
            expect(page.get_by_role("button", name="Take that back", exact=True)).to_be_visible()
            page.get_by_role("button", name="Take that back", exact=True).click()
            expect(page.locator("p.tabular-nums").first).to_have_text("A001")
            passed("No-show and button-based undo retain their server behavior")

            page.get_by_role("button", name="Cancel ticket", exact=True).click()
            expect(page.get_by_role("dialog")).to_be_visible()
            expect(page.get_by_role("button", name="Keep ticket", exact=True)).to_be_focused()
            before = len(writes)
            page.keyboard.press("s")
            assert len(writes) == before
            page.keyboard.press("Escape")
            expect(page.get_by_role("dialog")).not_to_be_visible()
            expect(page.locator("p.tabular-nums").first).to_have_text("A001")
            passed("Cancellation requires confirmation, focuses the safe choice and blocks shortcuts")
            focus_workspace()
            page.keyboard.press("c")
            page.get_by_role("button", name="Confirm cancellation", exact=True).click()
            expect(page.get_by_role("dialog")).not_to_be_visible()
            expect(page.get_by_role("button", name="Take that back", exact=True)).to_be_visible()
            page.get_by_role("button", name="Take that back", exact=True).click()
            expect(page.locator("p.tabular-nums").first).to_have_text("A001")
            passed("Confirmed cancellation and its undo reach the real isolated API")

            mode["queue_error"] = 503
            expect(connection_toast).to_be_visible(timeout=10000)
            expect(connection_toast).to_contain_text("Queue updates are interrupted")
            expect(connection_toast).to_have_count(1)
            expect(page.locator(".staff-workspace > .staff-connection-notice")).to_have_count(0)
            expect(page.locator(".staff-freshness").get_by_role("status")).to_have_text("Offline")
            passed("A single connection toast replaces the banner while the compact Offline indicator remains")
            expect(page.get_by_role("button", name="Served", exact=True)).to_be_disabled()
            expect(page.get_by_role("button", name="Give a walk-in a ticket", exact=True)).to_be_disabled()
            expect(page.get_by_role("button", name="Pause", exact=True)).to_be_disabled()
            before = len(writes)
            focus_workspace()
            page.keyboard.press("s")
            assert len(writes) == before
            screenshot("updates-interrupted")
            passed("Failed refresh keeps the last queue, warns clearly and blocks mutations/shortcuts")
            connection_toast.evaluate("element => { window.__outageToast = element; }")
            page.wait_for_timeout(5500)  # Outlast the normal transient-toast lifetime and several polls.
            expect(connection_toast).to_be_visible()
            expect(connection_toast).to_have_count(1)
            assert connection_toast.evaluate("element => element === window.__outageToast")
            expect(connection_toast.locator("[data-close-button]")).to_have_count(0)
            passed("Repeated failed polls keep one persistent toast without stacking or a dismiss button")
            connection_toast.get_by_role("button", name="Reconnect", exact=True).click()
            expect(connection_toast).to_have_attribute("data-removed", "false")
            page.wait_for_timeout(500)
            expect(connection_toast).to_be_visible()
            passed("An unsuccessful Reconnect attempt does not dismiss the warning")
            page.set_viewport_size({"width": 375, "height": 812})
            assert_no_overflow()
            box = connection_toast.bounding_box()
            assert box and box["x"] >= 0 and box["x"] + box["width"] <= 375
            screenshot("connection-toast-mobile")
            page.set_viewport_size({"width": 1440, "height": 1100})
            passed("The persistent toast stays within the mobile viewport")
            mode["queue_error"] = None
            # The automatic retry can remove the transient Reconnect button
            # before a click settles; the persistent refresh control is stable.
            page.get_by_role("button", name="Refresh queue", exact=True).click()
            expect(page.get_by_role("button", name="Served", exact=True)).to_be_enabled()
            expect(connection_toast).to_have_count(0)
            expect(page.locator(".staff-freshness").get_by_role("status")).not_to_have_text("Offline")
            passed("A successful reconnect restores queue actions")

            mode["hold_queue"] = True
            expect(connection_toast).to_be_visible(timeout=22000)
            expect(connection_toast).to_contain_text("Queue updates are interrupted")
            expect(page.get_by_role("button", name="Served", exact=True)).to_be_disabled()
            passed("A stalled request also expires freshness, even before a network error arrives")
            mode["hold_queue"] = False
            release_held()
            page.get_by_role("button", name="Refresh queue", exact=True).click()
            expect(page.get_by_role("button", name="Served", exact=True)).to_be_enabled()
            expect(connection_toast).to_have_count(0)
            screenshot("desktop-active")
            for width, height in [(375, 812), (768, 1024), (812, 375)]:
                page.set_viewport_size({"width": width, "height": height})
                assert_no_overflow()
                expect(page.get_by_role("button", name="Served", exact=True)).to_be_visible()
                screenshot(f"active-{width}")
                passed(f"Active serving controls remain usable at {width}px")
            page.emulate_media(reduced_motion="reduce")
            assert page.locator(".staff-call-panel").evaluate("e => getComputedStyle(e).animationName") == "none"
            passed("Reduced-motion mode has no decorative call-panel animation")
            page.set_viewport_size({"width": 1440, "height": 1100})

            page.get_by_role("button", name="Served", exact=True).click()
            expect(page.get_by_role("button", name="Call next", exact=True)).to_be_enabled()
            mode["slow_write"] = True
            focus_workspace()
            page.keyboard.press("n")
            expect(page.get_by_role("button", name="Call next", exact=True)).to_be_disabled()
            before = len(writes)
            page.keyboard.press("n")
            assert len(writes) == before
            expect(page.get_by_role("combobox", name="Working at")).to_be_disabled()
            mode["slow_write"] = False
            release_held()
            expect(page.get_by_role("button", name="Call next", exact=True)).to_be_enabled()
            passed("An in-flight mutation locks repeated shortcuts and desk switching")
            page.get_by_role("button", name="Pause", exact=True).click()
            expect(page.get_by_role("button", name="Call next", exact=True)).to_be_disabled()
            expect(page.get_by_role("button", name="Give a walk-in a ticket", exact=True)).to_be_enabled()
            page.get_by_role("button", name="Close", exact=True).click()
            expect(page.get_by_role("button", name="Give a walk-in a ticket", exact=True)).to_be_disabled()
            page.get_by_role("button", name="Open", exact=True).click()
            expect(page.get_by_role("button", name="Call next", exact=True)).to_be_enabled()
            passed("Paused desks accept walk-ins; closed desks block both tickets and calling")

            for _ in range(35):
                assert api("/api/tickets", {"service": "A"})["status"] == 201
            page.get_by_role("button", name="Refresh queue", exact=True).click()
            expect(page.locator(".staff-queue-table tbody tr")).to_have_count(37)
            assert page.locator(".staff-queue-scroll").evaluate("e => e.scrollHeight > e.clientHeight")
            assert_no_overflow()
            page.locator(".staff-queue-scroll").focus()
            page.keyboard.press("End")
            page.wait_for_function("document.querySelector('.staff-queue-scroll').scrollTop > 0")
            screenshot("long-queue")
            passed("A long queue uses a bounded keyboard-scrollable list without widening the page")

            for _ in range(2):
                page.get_by_role("button", name="Call next", exact=True).click()
                expect(page.get_by_role("button", name="Served", exact=True)).to_be_enabled()
                page.get_by_role("button", name="Served", exact=True).click()
                expect(page.get_by_role("button", name="Call next", exact=True)).to_be_enabled()
            expect(page.locator(".staff-metric").last).to_contain_text("Latest 3 completed tickets")
            expect(page.locator(".staff-metric-value").last).not_to_have_text("Not available")
            passed("The service average appears only after enough real completed-ticket samples")

            assert api("/api/device/readings", {"distance_cm": 30, "occupied": 1, "approach": 0, "led_state": "red"}, {"X-Device-Key": device_key})["status"] in (200, 201)
            page.get_by_role("button", name="Refresh queue", exact=True).click()
            expect(page.get_by_text("Counter occupied", exact=True)).to_be_visible()
            if device_toggle.count():
                device_toggle.click()
            expect(page.get_by_text("Latest sensor report", exact=False)).to_be_visible()
            screenshot("fresh-device")
            passed("Fresh real sensor reports show current occupancy and diagnostics")

            mode["queue_error"] = 401
            expect(connection_toast).to_be_visible(timeout=10000)
            expect(connection_toast).to_contain_text("Your access needs attention")
            expect(connection_toast.get_by_role("button", name="Sign in", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Open", exact=True)).to_be_disabled()
            screenshot("expired-access")
            passed("Session expiry is distinguished from a network failure")
            page.get_by_role("link", name="Home", exact=True).click()
            expect(connection_toast).to_have_count(0)
            passed("Leaving the dashboard cleans up its persistent connection toast")
            mode["queue_error"] = None
            mode["empty_desks"] = True
            page.goto(args.base_url + "/staff/dashboard", wait_until="domcontentloaded")
            expect(page.get_by_role("heading", name="No desks available", exact=True)).to_be_visible()
            passed("An actually empty office has an actionable no-desks state")

            assert not browser_errors, browser_errors
            passed("No uncaught browser errors")
            (args.output_dir / "results.json").write_text(json.dumps({"passed": len(checks), "checks": checks, "backend": "isolated disposable SQLite"}, indent=2), encoding="utf-8")
            print(f"\n{len(checks)} checks passed. Live API/database untouched. Screenshots: {args.output_dir}")
        except Exception:
            screenshot("failure")
            (args.output_dir / "failure.txt").write_text(page.locator("body").inner_text(), encoding="utf-8")
            raise
        finally:
            release_held()
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
