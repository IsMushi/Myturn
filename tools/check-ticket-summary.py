"""Ticket-page list, skeleton and live-event/fallback checks; no office writes."""
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import urllib.request
from playwright.sync_api import sync_playwright

WEB = os.environ.get("MYTURN_WEB", "http://localhost:3000")
shots = Path(os.environ["LOCALAPPDATA"]) / "Temp/opencode/ticket-summary"
shots.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen("http://127.0.0.1:5000/api/public/state", timeout=15) as r:
    state = json.load(r)
state = copy.deepcopy(state)
state["services"] = state["services"][:3]
for s in state["services"]:
    s.update(service_state="active", available=True, waiting=1, waiting_labels=[s["letter"] + "002"],
             now_serving=[], average_service_seconds=30, service_samples=4)
state["waiting"] = len(state["services"])
checks = 0


def check(name, ok):
    global checks
    assert ok, name
    checks += 1
    print("PASS", name)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chromium")
    page = browser.new_page(viewport={"width": 1440, "height": 1080})
    page.add_init_script("""
      window.__streams = [];
      window.EventSource = class extends EventTarget {
        constructor(url) { super(); this.url=url; window.__streams.push(this); }
        close() { this.closed=true; }
      };
      window.__emit = state => window.__streams.filter(s => !s.closed).forEach(s => {
        s.onopen?.(); s.dispatchEvent(new MessageEvent('queue', {data:JSON.stringify({state,ticket:null})}));
      });
    """)
    release = False
    unavailable = False
    pending = []

    def respond(route):
        if not release:
            pending.append(route)
        elif unavailable:
            route.fulfill(status=503, json={"error": "test connection failure"})
        elif "/api/services" in route.request.url:
            route.fulfill(json={"services": state["services"], "server_time": state["server_time"], "single_desk": False})
        else:
            route.fulfill(json=state)

    page.route("**/api/services", respond)
    page.route("**/api/public/state", respond)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(WEB + "/ticket", wait_until="domcontentloaded")
    skeleton = page.locator('[data-testid="ticket-request-skeleton"]:visible')
    skeleton.wait_for()
    page.evaluate("document.fonts.ready")
    check("skeleton has the actual three request steps", skeleton.locator(".myturn-ticket-step").count() == 3)
    check("skeleton has four summary rows, not cards", skeleton.locator(".myturn-ticket-stat").count() == 4)
    check("skeleton uses the same two-column layout", skeleton.locator(".myturn-ticket-selection").bounding_box()["x"]
          < skeleton.locator(".myturn-ticket-summary").bounding_box()["x"])
    intro = skeleton.locator(".myturn-ticket-intro").bounding_box()
    summary = skeleton.locator(".myturn-ticket-summary").bounding_box()
    page.screenshot(path=str(shots / "skeleton-desktop.png"), full_page=True)
    release = True
    for route in pending:
        respond(route)
    page.locator("#ticket-contact").wait_for()
    check("loading resolves to the real request form", skeleton.count() == 0)
    after_intro = page.locator(".myturn-ticket-intro").bounding_box()
    check("skeleton intro matches real intro geometry", all(abs(intro[k]-after_intro[k]) < 3 for k in ["x", "y", "width", "height"]))
    check("skeleton summary column matches loaded width", abs(summary["width"]-page.locator(".myturn-ticket-summary").bounding_box()["width"]) < 2)
    check("list has four semantic labels", page.locator(".myturn-ticket-queue-stats dt").all_text_contents() ==
          ["Now serving", "Tickets waiting", "Estimated wait", "Service point status"])
    check("status rows have no card borders or backgrounds", page.locator(".myturn-ticket-stat").evaluate_all(
        "els => els.every(el => getComputedStyle(el).borderTopWidth === '0px' && getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)')"))
    page.evaluate("state => window.__emit(state)", state)
    state["services"][0].update(waiting=5, waiting_labels=["A002", "A003", "A004", "A005", "A006"],
                                now_serving=[dict(ticket_no=1, label="A001", desk="Service point 1", called_at=datetime.now(timezone.utc).isoformat())])
    page.evaluate("state => window.__emit(state)", state)
    page.get_by_text("A001", exact=True).wait_for()
    check("pushed call and destination render without refresh", "Service point 1" in page.locator(".myturn-ticket-queue-stats").inner_text())
    check("pushed waiting count updates the list", page.locator(".myturn-ticket-stat").nth(1).locator("dd").first.inner_text() == "5")
    check("pushed counts update service choices too", "5 people waiting" in page.locator(".myturn-ticket-selection").inner_text())
    state["services"][0].update(service_state="paused")
    page.evaluate("state => window.__emit(state)", state)
    page.get_by_text("The desk is on a break.", exact=False).wait_for()
    check("pushed service status updates without refresh", "Paused" in page.locator(".myturn-ticket-queue-stats").inner_text())
    for width in [1440, 1024, 768, 767, 375, 320]:
        page.set_viewport_size({"width": width, "height": 1080})
        check(f"no horizontal overflow at {width}px", page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        if width in [1440, 375]:
            page.screenshot(path=str(shots / f"loaded-{width}.png"), full_page=True)
    unavailable = True
    page.evaluate("window.__streams.filter(s => !s.closed).forEach(s => s.onerror?.())")
    page.get_by_text("The live waiting information could not be loaded.", exact=False).wait_for(timeout=15000)
    check("failed live connection marks displayed values as stale", "out of date" in page.locator("body").inner_text())
    unavailable = False
    state["services"][0].update(waiting=2, waiting_labels=["A002", "A003"], average_service_seconds=None, service_samples=0)
    page.wait_for_function("document.querySelectorAll('.myturn-ticket-stat')[1]?.querySelector('dd')?.textContent === '2'", timeout=15000)
    check("polling fallback refreshes queue automatically", page.locator(".myturn-ticket-stat").nth(1).locator("dd").first.inner_text() == "2")
    check("unmeasured estimate is not invented", "Not available" in page.locator(".myturn-ticket-queue-stats").inner_text())
    state["services"][0].update(waiting=7, waiting_labels=["A007"])
    page.evaluate("state => window.__emit(state)", state)
    page.wait_for_function("document.querySelectorAll('.myturn-ticket-stat')[1]?.querySelector('dd')?.textContent === '7'")
    check("reconnected stream resumes updates", "out of date" not in page.locator("body").inner_text())
    check("no browser runtime errors", not errors)
    browser.close()
print(f"{checks} checks passed; screenshots: {shots}")
