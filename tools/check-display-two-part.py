"""Browser-only fixtures for /display. Never writes to the office database."""
import copy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = os.environ.get("MYTURN_WEB", "http://localhost:3000")
SHOTS = Path(os.environ["LOCALAPPDATA"]) / "Temp/opencode/display-two-part"
SHOTS.mkdir(parents=True, exist_ok=True)
checks = 0


def check(name, condition):
    global checks
    assert condition, name
    checks += 1
    print("PASS", name)


def service(letter, name, labels, calls=None, waiting=None):
    return dict(id=letter, letter=letter, name=name, description="",
                available=True, service_state="active", waiting=len(labels) if waiting is None else waiting,
                waiting_labels=labels, now_serving=calls or [], target_seconds=None,
                average_service_seconds=None, service_samples=0)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chromium")
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    # Intentionally wrong browser wall clock: timers must use server time.
    context.add_init_script("Date.now = () => 946684800000;")
    page = context.new_page()
    called_at = datetime.now(timezone.utc) - timedelta(seconds=15)
    calls = [dict(ticket_no=1, label="A001", desk="Service point 1", called_at=called_at.isoformat())]
    services = [service("A", "General Service", ["A002", "A003"], calls),
                service("B", "Document collection", ["B001"])]
    unavailable = False

    def state_response(route):
        if unavailable:
            route.fulfill(status=503, json={"error": "fixture connection failure"})
            return
        route.fulfill(json=dict(services=services, waiting=sum(s["waiting"] for s in services),
                                server_time=datetime.now(timezone.utc).isoformat()))

    page.route("**/api/public/state", state_response)
    page.route("**/api/events**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def load():
        page.goto(WEB + "/display", wait_until="networkidle")
        page.get_by_role("heading", name="Now calling", exact=True).wait_for()

    load()
    page.locator(".myturn-display-connection").get_by_text("Live data", exact=True).wait_for()
    check("connected indicator says Live data", page.locator(".myturn-display-connection").inner_text() == "Live data")
    current = page.get_by_role("region", name="Now calling")
    waiting = page.get_by_role("complementary", name="Waiting list")
    check("called ticket is in left region", current.get_by_text("A001", exact=True).is_visible())
    check("service point is shown", current.get_by_text("Service point 1", exact=True).is_visible())
    check("waiting numbers stay in service order",
          waiting.locator("strong").all_text_contents() == ["3", "A002", "A003", "B001"])
    check("called ticket is not in waiting list", waiting.get_by_text("A001", exact=True).count() == 0)
    check("waiting total is pluralized", waiting.get_by_text("3 tickets waiting", exact=True).is_visible())
    timer = page.get_by_role("timer", name="Arrival countdown for A001")
    initial = int(timer.inner_text().rstrip("s"))
    check("server-synchronized countdown ignores incorrect browser clock", 42 <= initial <= 45)
    page.wait_for_timeout(1700)
    check("countdown decreases", int(timer.inner_text().rstrip("s")) < initial)
    page.reload(wait_until="networkidle")
    check("refresh does not restart at 60", int(timer.inner_text().rstrip("s")) < initial)

    for width, height in [(2560, 1440), (1920, 1080), (1440, 900), (1366, 768),
                          (1100, 900), (900, 900), (768, 1024), (720, 900), (375, 812), (320, 740)]:
        page.set_viewport_size({"width": width, "height": height})
        check(f"no page overflow at {width}px", page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f"waiting labels visible at {width}px", waiting.get_by_text("A002", exact=True).is_visible())
        if width > 1100:
            check(f"calls left of waiting at {width}px", current.bounding_box()["x"] < waiting.bounding_box()["x"])
        if width <= 720:
            check(f"waiting stacks below calls at {width}px", waiting.bounding_box()["y"] > current.bounding_box()["y"])
        if width in [1920, 1366, 375]:
            page.screenshot(path=str(SHOTS / f"called-{width}.png"), full_page=True)
    check("queue panels, rows and QR have no borders", page.locator(
        ".myturn-display-service, .myturn-display-current-service, .myturn-display-waiting-panel, "
        ".myturn-display-waiting-group, .myturn-display-waiting-panel-head, .myturn-display-qr-frame"
    ).evaluate_all("els => els.every(el => ['Top','Right','Bottom','Left'].every(side => parseFloat(getComputedStyle(el)['border'+side+'Width']) === 0))"))
    check("booking QR remains visible", page.locator(".myturn-display-qr").is_visible())

    services[0]["now_serving"] = []
    services[0]["waiting_labels"] = ["A002"]
    services[0]["waiting"] = 1
    services[1]["waiting_labels"] = []
    services[1]["waiting"] = 0
    load()
    check("waiting list works with no active call", page.get_by_text("No active call", exact=True).is_visible()
          and waiting.get_by_text("A002", exact=True).is_visible())
    check("one ticket uses singular", waiting.get_by_text("1 ticket waiting", exact=True).is_visible())
    services[0]["waiting_labels"] = [f"A{i:03}" for i in range(2, 10)]
    services[0]["waiting"] = 20
    load()
    check("long queues show real preview and remaining count", waiting.locator("ol li").count() == 8
          and waiting.get_by_text("+12 more waiting", exact=True).is_visible())
    services[0]["now_serving"] = copy.deepcopy(calls)
    services[0]["now_serving"][0]["called_at"] = (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat()
    load()
    check("expired timer clamps at zero", page.get_by_role("timer").inner_text() == "0s"
          and page.get_by_text("Arrival window ended", exact=True).is_visible())
    check("timer expiry does not remove ticket locally", current.get_by_text("A001", exact=True).is_visible())
    services[0]["now_serving"].append(dict(ticket_no=10, label="A010", desk=None, called_at=None))
    load()
    check("multiple calls keep individual destinations and timers", current.locator(".myturn-display-call").count() == 2)
    check("unknown timestamp and destination are honest", page.get_by_text("Arrival time unavailable", exact=True).is_visible()
          and page.get_by_text("Ask staff for your service point", exact=True).is_visible())
    unavailable = True
    page.get_by_text("Timer unavailable while disconnected", exact=True).first.wait_for(timeout=20000)
    check("offline indicator does not claim live data", page.locator(".myturn-display-connection").inner_text() == "Connection lost")
    check("disconnected timers are not presented as live", page.get_by_text("Timer unavailable while disconnected", exact=True).count() == 2
          and page.get_by_role("timer").count() == 0)
    unavailable = False
    page.get_by_role("button", name="Reconnect", exact=True).click()
    page.get_by_role("timer").wait_for(timeout=15000)
    check("reconnection restores server-based timer", page.get_by_role("timer").inner_text() == "0s")
    for s in services:
        s["waiting"] = 0
        s["waiting_labels"] = []
        s["now_serving"] = []
        s["service_state"] = "closed"
    load()
    check("empty waiting list stays visible", waiting.get_by_text("No tickets waiting right now.", exact=True).is_visible())
    check("closed services have accurate empty-state copy", page.get_by_text("This service is closed. Please ask at the service point.", exact=True).is_visible())
    check("no browser runtime errors", not errors)
    browser.close()
print(f"{checks} checks passed. Screenshots: {SHOTS}")
