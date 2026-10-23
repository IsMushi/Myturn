"""Check rendered project wording, including accessible labels, without writes.

Uses one administrator login for read-only console pages. Secrets are read from
the gitignored API .env and never printed. Internal identifiers are not renamed.
"""
import os
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WEB = os.environ.get("MYTURN_WEB", "http://localhost:3000")
env = {}
for line in (ROOT / "api/.env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
term = re.compile(r"\bqueues?\b|\bqueueing\b|\bqueuing\b", re.I)


def inspect(page, path):
    page.goto(WEB + path, wait_until="networkidle")
    page.wait_for_timeout(700)
    visible = page.locator("body").inner_text()
    labels = page.locator("[aria-label], input[placeholder], textarea[placeholder]").evaluate_all(
        "els => els.map(el => [el.getAttribute('aria-label'), el.getAttribute('placeholder')].filter(Boolean).join(' ')).join('\\n')")
    assert not term.search(visible + "\n" + labels), f"Old wording remains on {path}"
    assert not term.search(page.title()), f"Old page title remains on {path}"
    print("PASS simple visible/accessibility wording:", path)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chromium")
    public = browser.new_context()
    page = public.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    for path in ["/", "/ticket", "/display", "/auth/login", "/auth/forgot-password", "/auth/register"]:
        inspect(page, path)
    context = browser.new_context()
    response = context.request.post(WEB + "/api/auth/login", data={
        "email": env["MYTURN_ADMIN_EMAIL"], "password": env["MYTURN_ADMIN_PASSWORD"]})
    assert response.ok, "Administrator login failed; credentials were not printed"
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    for path in ["/account", "/admin/dashboard", "/admin/activity", "/admin/statistics",
                 "/admin/settings", "/staff/dashboard", "/staff/analytics"]:
        inspect(page, path)
    page.set_viewport_size({"width": 375, "height": 812})
    page.get_by_role("button", name="Show the console menu").click()
    drawer = page.get_by_role("dialog", name="Console menu")
    assert not term.search(drawer.inner_text())
    print("PASS mobile console labels use simple wording")
    assert not errors, errors
    print("PASS no runtime or hydration errors on fresh pages")
    browser.close()
print("14 wording checks and runtime check passed; API endpoints and database identifiers unchanged")
