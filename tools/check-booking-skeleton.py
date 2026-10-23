"""Compare loading and loaded QR-panel geometry without changing office data."""
import json
import urllib.request
from playwright.sync_api import sync_playwright

with urllib.request.urlopen("http://127.0.0.1:5000/api/public/state", timeout=15) as response:
    state = json.load(response)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chromium")
    for width in [1920, 1440, 768, 375]:
        page = browser.new_page(viewport={"width": width, "height": 1080})
        pending = []
        released = False

        def handle(route):
            if released:
                route.fulfill(json=state)
            else:
                pending.append(route)

        page.route("**/api/public/state", handle)
        page.route("**/api/events**", lambda route: route.abort())
        page.goto("http://localhost:3000/display", wait_until="domcontentloaded")
        panel = page.locator(".myturn-display-booking-skeleton")
        panel.wait_for()
        page.evaluate("document.fonts.ready")
        selectors = [".myturn-display-booking-copy", "h2", ".myturn-display-booking-code",
                     ".myturn-display-qr-frame", ".myturn-display-booking-url", ".myturn-display-booking-note"]
        before = {s: panel.locator(s).bounding_box() for s in selectors}
        before_panel = panel.bounding_box()
        released = True
        for route in pending:
            route.fulfill(json=state)
        page.locator(".myturn-display-qr").wait_for()
        panel = page.locator(".myturn-display-booking")
        after_panel = panel.bounding_box()
        for selector in selectors:
            after = panel.locator(selector).bounding_box()
            for prop in ["x", "y", "width", "height"]:
                # Other queue content can change panel placement on a stacked
                # page. Compare the booking content's position within its panel.
                offset_before = before_panel[prop] if prop in ["x", "y"] else 0
                offset_after = after_panel[prop] if prop in ["x", "y"] else 0
                assert abs((before[selector][prop] - offset_before) - (after[prop] - offset_after)) < 2, (width, selector, prop, before[selector], after)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        print(f"PASS {width}px: all six skeleton regions match loaded geometry")
        page.close()
    browser.close()
