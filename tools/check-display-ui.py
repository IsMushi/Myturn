"""Non-destructive Playwright checks for the office wall display.

Synthetic queue states are intercepted in the browser only. No tickets, desk
settings or accounts are created/modified. Requires Python Playwright/Chromium.
"""

import argparse
import re
from copy import deepcopy
from pathlib import Path
from time import monotonic

from playwright.sync_api import expect, sync_playwright


REFERENCE_STATE = {
    "waiting": 5,
    "server_time": "2026-10-20T09:48:00",
    "service_state": "active",
    "services": [
        {"id": letter, "letter": letter, "name": name, "service_state": state,
         "waiting": waiting, "waiting_labels": labels, "now_serving": []}
        for letter, name, state, waiting, labels in [
            ("A", "General Service", "active", 5,
             ["A001", "A002", "A003", "A004", "A005"]),
            ("B", "Admissions", "paused", 0, []),
            ("C", "Finance", "paused", 0, []),
        ]
    ],
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    checks = 0

    def check(condition, description):
        nonlocal checks
        assert condition, description
        checks += 1
        print(f"PASS {description}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        errors = []

        def mock_page(state=None, viewport=None):
            page = browser.new_page(
                viewport=viewport or {"width": 1916, "height": 821},
                reduced_motion="reduce",
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.add_init_script("window.EventSource = undefined")
            if state is not None:
                page.route("**/api/public/state", lambda route: route.fulfill(json=state))
            return page

        def ready(page):
            page.goto(f"{args.base_url}/display", wait_until="domcontentloaded")
            expect(page.locator(".myturn-display-service")).to_have_count(3)
            expect(page.get_by_role("heading", name="Now serving", exact=True)).to_be_visible()
            page.evaluate("document.fonts.ready")
            page.locator(".myturn-display-idle-icon img").first.wait_for()
            page.wait_for_function(
                "Array.from(document.querySelectorAll('.myturn-display-idle-icon img'))"
                ".every(image => image.complete && image.naturalWidth > 0)"
            )

        page = mock_page(REFERENCE_STATE)
        ready(page)
        check(page.get_by_role("heading", name="No active call").count() == 3,
              "reference-state empty calls")
        check(page.locator('.myturn-display-badge[data-state="active"]').count() == 1,
              "open service badge")
        check(page.locator('.myturn-display-badge[data-state="paused"]').count() == 2,
              "paused service badges")
        check(page.locator(".myturn-display-total strong").inner_text() == "5",
              "server waiting total")
        check(page.locator(".myturn-display-service-count").all_inner_texts() == ["5", "0", "0"],
              "per-service waiting counts")
        check(page.locator(".myturn-display-waiting-panel").count() == 1,
              "one separate waiting panel")
        check(page.locator(".myturn-display-waiting-group").count() == 1,
              "waiting panel omits services with no waiting tickets")
        check(page.locator(".myturn-display-waiting-group").first
              .locator(".myturn-display-waiting-rows strong").all_inner_texts()
              == ["A001", "A002", "A003", "A004", "A005"],
              "waiting numbers listed in queue order")
        check(re.fullmatch(r"\d{1,2}:\d{2}:\d{2}", page.locator(".myturn-display-updated").inner_text()) is not None,
              "real clock renders a time")
        check(page.locator(".myturn-display-connection").inner_text() == "Up to date",
              "polling connection label")
        check(page.locator("main").get_attribute("aria-busy") == "false",
              "loading semantics clear after data arrives")
        box = page.locator(".myturn-display-service").first.bounding_box()
        check(abs(box["x"] - 60) <= 2 and abs(box["y"] - 245) <= 5,
              "reference card placement")
        check(page.evaluate("document.documentElement.scrollHeight <= innerHeight + 1"),
              "reference monitor fits vertically")
        page.screenshot(path=str(args.output_dir / "display-reference.png"), full_page=True)

        for width, height in [(320, 740), (375, 812), (390, 844), (720, 1024),
                              (768, 1024), (1024, 768), (1280, 800), (1440, 900),
                              (1916, 821), (2560, 1440)]:
            page.set_viewport_size({"width": width, "height": height})
            check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
                  f"no horizontal overflow at {width}px")
            check(page.locator(".myturn-display-service-head").evaluate_all(
                "heads => heads.every(head => Array.from(head.children).every(child => {"
                "const a = child.getBoundingClientRect(), b = head.getBoundingClientRect();"
                "return a.right <= b.right + 1 && a.left >= b.left - 1; }))"
            ), f"service headings and badges fit at {width}px")
            if width in (375, 768, 1280):
                page.screenshot(path=str(args.output_dir / f"display-{width}.png"), full_page=True)
        page.close()

        # A delayed response should retain the exact board structure, not a spinner panel.
        page = mock_page()
        pending = []
        loading = {"released": False}
        page.route("**/api/public/state", lambda route: (
            route.fulfill(json=REFERENCE_STATE) if loading["released"] else pending.append(route)
        ))
        page.goto(f"{args.base_url}/display", wait_until="domcontentloaded")
        expect(page.get_by_test_id("display-skeleton")).to_be_visible()
        deadline = monotonic() + 10
        while not pending and monotonic() < deadline:
            page.wait_for_timeout(50)
        check(bool(pending), "loading request remains pending")
        check(page.locator("main").get_attribute("aria-busy") == "true", "skeleton busy state")
        check(page.locator(".myturn-display-service").count() == 2, "generic loading cards")
        check(page.locator(".myturn-display-waiting-panel").count() == 1,
              "waiting panel has a loading placeholder")
        check(page.get_by_test_id("display-skeleton").get_attribute("aria-hidden") == "true",
              "decorative placeholders hidden from screen readers")
        check(page.locator(".myturn-display-placeholder").first.evaluate(
            "element => getComputedStyle(element).animationName"
        ) == "none", "skeleton respects reduced motion")
        page.emulate_media(reduced_motion="no-preference")
        check(page.locator(".myturn-display-placeholder").first.evaluate(
            "element => getComputedStyle(element).animationName"
        ) == "myturn-display-skeleton", "skeleton animates when motion is allowed")
        page.emulate_media(reduced_motion="reduce")
        page.screenshot(path=str(args.output_dir / "display-skeleton.png"), full_page=True)
        page.set_viewport_size({"width": 375, "height": 812})
        check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
              "mobile skeleton does not overflow")
        page.set_viewport_size({"width": 1916, "height": 821})
        skeleton_box = page.locator(".myturn-display-service").first.bounding_box()
        loading["released"] = True
        # Development Strict Mode may start and cancel an initial effect; release
        # every queued request, not just the reply from that discarded effect.
        for route in pending:
            route.fulfill(json=REFERENCE_STATE)
        expect(page.get_by_test_id("display-skeleton")).to_have_count(0)
        real_box = page.locator(".myturn-display-service").first.bounding_box()
        check(abs(skeleton_box["y"] - real_box["y"]) < 2
              and abs(skeleton_box["height"] - real_box["height"]) < 3,
              "loading preserves desktop card geometry")
        check(page.locator(".myturn-display-service-count").first.inner_text() == "5",
              "skeleton replaced by live response")
        page.close()

        state = deepcopy(REFERENCE_STATE)
        state["services"][0]["now_serving"] = [
            {"label": "A003", "desk": "Counter 1", "called_at": None},
            {"label": "A004", "desk": "Counter 4", "called_at": None},
        ]
        state["services"][2]["service_state"] = "closed"
        # A queue longer than the list is counted, not printed in full.
        state["services"][1]["waiting"] = 12
        state["services"][1]["waiting_labels"] = [f"B{n:03d}" for n in range(1, 9)]
        page = mock_page(state)
        page.goto(f"{args.base_url}/display")
        expect(page.locator(".myturn-display-number")).to_have_count(2)
        check(page.locator(".myturn-display-number").all_inner_texts() == ["A003", "A004"],
              "multiple calls preserve their ticket numbers")
        check(page.locator(".myturn-display-desk").all_inner_texts() == ["Counter 1", "Counter 4"],
               "multiple calls preserve their destinations")
        check(page.locator(".myturn-display-waiting-group").nth(1)
              .locator(".myturn-display-waiting-rows strong").all_inner_texts()
              == [f"B{n:03d}" for n in range(1, 9)]
              and page.locator(".myturn-display-waiting-group").nth(1)
              .locator(".myturn-display-waiting-overflow").inner_text() == "+4 more waiting",
               "a queue longer than the list is counted, not printed in full")
        check(page.get_by_text("This service is closed. Please ask at the counter.").is_visible(),
              "closed-service empty state")
        page.screenshot(path=str(args.output_dir / "display-active.png"), full_page=True)
        page.close()

        # The seed has three services, but the board must not assume three.
        state = deepcopy(REFERENCE_STATE)
        state["services"].extend([
            {"id": "D", "letter": "D", "name": "Permits", "service_state": "active",
             "waiting": 1, "waiting_labels": ["D001"], "now_serving": []},
            {"id": "E", "letter": "E", "name": "Records", "service_state": "active",
             "waiting": 0, "waiting_labels": [], "now_serving": []},
        ])
        state["waiting"] = 6
        page = mock_page(state)
        page.goto(f"{args.base_url}/display")
        expect(page.locator(".myturn-display-service")).to_have_count(5)
        check(page.locator(".myturn-display-waiting-group").count() == 2,
              "additional waiting services appear in the panel")
        check(page.locator(".myturn-display-waiting-group").nth(1)
              .locator(".myturn-display-waiting-rows strong").inner_text() == "D001",
              "additional service's next number appears")
        check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
              "five-service board does not overflow horizontally")
        page.close()

        page = mock_page({**REFERENCE_STATE, "services": []})
        page.goto(f"{args.base_url}/display")
        expect(page.get_by_role("heading", name="No services to display")).to_be_visible()
        check(page.get_by_test_id("display-skeleton").count() == 0, "empty services are not loading")
        page.close()

        page = mock_page()
        response = {"offline": True}
        page.route("**/api/public/state", lambda route: route.fulfill(
            status=503 if response["offline"] else 200,
            json={"error": "Unavailable"} if response["offline"] else REFERENCE_STATE,
        ))
        page.goto(f"{args.base_url}/display")
        expect(page.get_by_role("heading", name="The queue cannot be reached")).to_be_visible()
        check(page.locator("main").get_attribute("aria-busy") == "false",
              "failed loading clears busy state")
        response["offline"] = False
        page.get_by_role("button", name="Try again", exact=True).click()
        expect(page.locator(".myturn-display-service-count").first).to_have_text("5")
        check(page.get_by_role("heading", name="Now serving", exact=True).is_visible(),
              "retry recovers live board")
        response["offline"] = True
        warning = page.locator(".myturn-display-warning")
        expect(warning).to_be_visible(timeout=8000)
        check(page.locator(".myturn-display-service-count").first.inner_text() == "5",
              "offline board preserves last-known numbers")
        check("out of date" in warning.inner_text(),
              "offline board clearly labels stale data")
        page.screenshot(path=str(args.output_dir / "display-offline.png"), full_page=True)
        response["offline"] = False
        page.get_by_role("button", name="Reconnect", exact=True).click()
        expect(warning).to_have_count(0)
        check(page.locator(".myturn-display-connection").inner_text() == "Up to date",
              "reconnect clears offline warning")
        page.close()

        # Real API/SSE: read-only integration check, with no fixture interception.
        page = browser.new_page(viewport={"width": 1916, "height": 821})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{args.base_url}/display", wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="Now serving", exact=True)).to_be_visible()
        data = page.request.get(f"{args.base_url}/api/public/state").json()
        check(page.locator(".myturn-display-service").count() == len(data["services"]),
              "real API services render")
        check(page.locator(".myturn-display-total strong").inner_text() == str(data["waiting"]),
              "real API waiting total renders")
        check(all("waiting_labels" in service for service in data["services"]),
              "real API carries the waiting numbers")
        check(page.locator(".myturn-display-connection").inner_text() == "Up to date",
              "real live connection renders")
        page.screenshot(path=str(args.output_dir / "display-real.png"), full_page=True)
        page.close()
        check(not errors, f"no browser runtime errors: {errors}")
        browser.close()

    print(f"\n{checks} checks passed. Screenshots: {args.output_dir}")


if __name__ == "__main__":
    main()
