"""Capture the interface figures for the report and the presentation.

The script drives the running prototype with a browser and writes:

    figure-visitor-phone.png    the visitor page on a phone, ticket in hand
    figure-staff-dashboard.png  the desk dashboard with a call in progress
    figure-display.png          the screen that hangs in the waiting room
    figure-home.png             the public home page

Both servers have to be running first:

    api        cd api         && .\\.venv\\Scripts\\python.exe app.py
    web        cd web         && npm run dev

Then:

    python tools/capture-figures.py

The sign-in details are read from api/.env, so the script signs in as the
administrator created by seed_admin.py. An administrator can work the desk as
well, which is what the dashboard figure shows.

The board line on the dashboard shows whatever the board last reported. Power
the ESP32 before running the script if the figure should show a connected
device; otherwise it reads "No board has reported yet".
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API_DIR = os.path.join(ROOT, "api")

API = "http://127.0.0.1:5000"
WEB = "http://localhost:3000"
TOKEN_KEY = "myturn.ticket.token"


def api(path, payload=None):
    """Call the API directly, so the tickets exist before the pages are opened."""
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(API + path, data=data, method="POST" if data else "GET")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"null")


def env_value(name, default=None):
    """One setting out of api/.env, so no password is written down here."""
    path = os.path.join(API_DIR, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if line.strip().startswith(name + "="):
                return line.strip().split("=", 1)[1]
    if default is not None:
        return default
    raise SystemExit("no %s in api/.env -- run seed_admin.py first" % name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=os.path.join(os.path.dirname(ROOT), "assets"),
                        help="where the PNG files are written")
    parser.add_argument("--email", default=env_value("MYTURN_ADMIN_EMAIL"))
    parser.add_argument("--password", default=env_value("MYTURN_ADMIN_PASSWORD"))
    parser.add_argument("--tickets", type=int, default=4)
    parser.add_argument("--skip-reset", action="store_true",
                        help="keep the current queue instead of starting from an empty one")
    args = parser.parse_args()

    if not args.skip_reset:
        # reset.py needs the API's own environment (it reads .env), so it
        # runs with the interpreter in the virtual environment. It clears the
        # queue and keeps the accounts.
        venv_python = os.path.join(API_DIR, ".venv", "Scripts", "python.exe")
        python = venv_python if os.path.exists(venv_python) else sys.executable
        reset = os.path.join(API_DIR, "reset.py")
        subprocess.run([python, reset], cwd=API_DIR, check=True)

    # Four tickets: the second one is the visitor whose phone is photographed,
    # so the figure shows a ticket number, a different number being served and
    # the tickets still waiting.
    tokens = []
    for _ in range(args.tickets):
        status, body = api("/api/tickets", {"source": "qr"})
        if status != 201:
            print("could not create a ticket:", status, body)
            return 1
        tokens.append(body["token"])
    print("issued %d tickets" % len(tokens))

    os.makedirs(args.out, exist_ok=True)

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chromium")

        # ---- the public home page -------------------------------------------
        home = browser.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
        home.goto(WEB + "/", wait_until="networkidle")
        home.wait_for_selector("text=Less Waiting.", timeout=20000)
        home.wait_for_timeout(800)
        # Walk the page so the sections that fade in are all at full strength.
        home.evaluate(
            """async () => {
                const step = Math.round(window.innerHeight * 0.7);
                for (let y = 0; y < document.body.scrollHeight; y += step) {
                    window.scrollTo(0, y);
                    await new Promise((done) => setTimeout(done, 160));
                }
                window.scrollTo(0, 0);
                await new Promise((done) => setTimeout(done, 700));
            }"""
        )
        home.screenshot(path=os.path.join(args.out, "figure-home.png"), full_page=True)
        print("wrote figure-home.png")

        # ---- the staff dashboard, with a call in progress -------------------
        # Wide enough for the console sidebar (it appears from 1024px), and
        # then grown to the height of the content so the figure carries the
        # whole console - sidebar, queue and all - without a scroll seam.
        staff = browser.new_page(viewport={"width": 1280, "height": 1000}, device_scale_factor=2)
        staff.goto(WEB + "/auth/login", wait_until="networkidle")
        staff.fill("#email", args.email)
        staff.fill("#password", args.password)
        staff.click("button[type=submit]")
        staff.wait_for_url("**/dashboard", timeout=20000)
        staff.goto(WEB + "/staff/dashboard", wait_until="networkidle")
        staff.wait_for_selector("text=Call next", timeout=20000)
        open_button = staff.get_by_role("button", name="Open", exact=True)
        if open_button.is_enabled():
            open_button.click()
        staff.wait_for_timeout(1200)
        staff.get_by_role("button", name="Call next").click()
        staff.wait_for_timeout(1600)
        staff.set_viewport_size({
            "width": 1280,
            "height": int(staff.evaluate(
                "Math.min(1400, Math.max(900, document.body.scrollHeight))")),
        })
        staff.wait_for_timeout(400)
        staff.screenshot(path=os.path.join(args.out, "figure-staff-dashboard.png"))
        print("wrote figure-staff-dashboard.png")

        # ---- the wall display, now that a number is being served ------------
        display = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=2)
        display.goto(WEB + "/display", wait_until="networkidle")
        display.wait_for_selector("text=NOW SERVING", timeout=20000)
        display.wait_for_timeout(1200)
        display.screenshot(path=os.path.join(args.out, "figure-display.png"))
        print("wrote figure-display.png")

        # ---- the visitor page on a phone ------------------------------------
        visitor = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3,
                                   is_mobile=True, has_touch=True)
        visitor.add_init_script("localStorage.setItem(%r, %r)" % (TOKEN_KEY, tokens[1]))
        visitor.goto(WEB + "/ticket", wait_until="networkidle")
        visitor.wait_for_selector("text=YOUR NUMBER", timeout=20000)
        visitor.wait_for_timeout(1200)
        # The whole content column, so the figure carries the ticket, the queue
        # and the line that says when the page last asked the server.
        visitor.locator("main").first.screenshot(
            path=os.path.join(args.out, "figure-visitor-phone.png"))
        print("wrote figure-visitor-phone.png")

        browser.close()

    print("figures written to " + args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
