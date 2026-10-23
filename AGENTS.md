# AGENTS.md

This folder holds two very different things:

- `myturn/` - the MyTurn prototype: Flask API, Next.js app, ESP32 firmware. **This is the git repository** (branch `master`, 3 commits, no remote).
- the root itself - the course documents (`MyTurn_Project_Proposal.*`, `MyTurn_Project_Report.*`), `assets/`, and the INES guidelines PDF.

The working tree under `myturn/` is dirty on purpose: the whole accounts, home page and ticket experience is uncommitted, finished and verified. Never `git checkout`, `reset`, `clean` or `stash` to "tidy up".

`myturn/README.md` is the source of truth for routes, pages, server rules and the demonstration script. Read it first. This file carries only what it does not: how to run, verify, and avoid the traps that already cost time.

## Run it

```powershell
cd myturn
.\dev.ps1                                              # API :5000 + web :3000 in one window
```

Or one at a time:

```powershell
cd myturn\api;  .\.venv\Scripts\python.exe app.py      # http://127.0.0.1:5000
cd myturn\web; npm run dev                             # http://localhost:3000
```

- The backend interpreter is always `myturn\api\.venv\Scripts\python.exe`. The bare `python` on PATH is a different interpreter and will not have Flask; it is the right one for `tools\capture-figures.py` and the Playwright checks.
- The browser only ever talks to `localhost:3000`: `/api/*` is rewritten to Flask in `web/next.config.ts`. `BACKEND_ORIGIN` overrides that; do not introduce CORS calls from pages.
- `api/.env` exists and is gitignored; it holds the demo administrator's credentials (`MYTURN_ADMIN_EMAIL` / `MYTURN_ADMIN_PASSWORD`). Read them from there - never hardcode them, put them on a page, or paste them into a report or a commit. `web/.env.local` is optional and only needed to move the API off `:5000`.

### Stopping a server is not `Stop-Process` on the listener

The venv's `python.exe` launches the real interpreter as a **child**, and killing one of the pair leaves the other listening. The symptom is nasty: port 5000 still answers, but with the old code and the old in-memory rate-limit counters, so your change looks ignored and the smoke test fails on 429s that should have been cleared. Kill the whole tree the way `dev.ps1` does (`taskkill /PID <pid> /T /F`) or stop every `python` process.

For the web app, kill only Next's node processes - filter `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` on `CommandLine -like '*next*'`. Never kill all `node.exe`.

### The board cannot reach the API: is the hotspot on?

The board joins the **PC's mobile hotspot**, not the office Wi-Fi, and reaches the API at `192.168.137.1` (`API_BASE` in `firmware/myturn_desk/secrets.h`). If the hotspot is switched off the board cannot associate, and the symptom is unmistakable:

- the serial log shows `wifi down`, `ws Wi-Fi disconnected`, `retrying Wi-Fi` every ten seconds, and `desk -1` with `seq 0`, because the board has never been authenticated;
- the server shows `devices.online: 0` and a `last_seen` from hours ago;
- **the board is fine and the API is fine** - only the network between them is gone.

Run `powershell -ExecutionPolicy Bypass -File tools\start-hotspot.ps1`; it reads the SSID and passphrase out of `secrets.h` and brings the hotspot up. The board retries every ten seconds and is back within half a minute.

This adapter does **not** support the legacy hosted network (`netsh wlan show drivers` says so), so `netsh wlan start hostednetwork` cannot work - only the Mobile Hotspot API can, and that is what the script calls. If the hotspot comes back on a different subnet, the board will connect to the Wi-Fi and then fail to reach the API, so check the `gateway the board uses` line the script prints against `API_BASE`.

## Backend (`myturn/api`)

- Flask 3.1 + `python-dotenv`, no ORM and no pytest. Raw `sqlite3` with `Row`; `db.apply_schema()` runs `schema.sql` on every start and every statement is `create ... if not exists`, so new tables need no migration. **The move to several desks needed the one real migration**: the `tickets` table is rebuilt once, because SQLite cannot drop the old global `ticket_no unique` and the number is now unique per service; `desk_settings` and `devices` each gained a `desk_id` column by a guarded `alter table` after a `pragma table_info` check. `devices` also gained `chip_id` / `mac_address` (the board's own identity, reported by the firmware) the same way - `create table if not exists` cannot add a column to a table that already exists, so every one of them needs that guarded `alter table`. `desk_settings` also gained `pause_reason` and `paused_until` that way, which is where a pause keeps the desk's own words.
- Tables: `ticket_numbers`, `services`, `desks`, `tickets`, `ticket_events`, `desk_settings`, `devices`, `device_reports`, `users`, `invitations`, `password_resets`, and `account_events` (the account history the Activity page reads). A **service** is a queue with a letter (A, B, C) that prefixes its ticket numbers, a name, a description and an optional target time; a **desk** is a counter that serves exactly one service. Both are edited at `/admin/settings`. `ticket_numbers` holds one row per service (`ticket:A`) with the next number to issue; it was called `counters` before, which read as if it described a physical counter, and `db._rename_counters_table()` carries an old database over once. The `tickets` table carries a unique index that allows one `called` row **per desk**, so two desks may hold two calls of the same service at once.
- Routes are blueprints under `routes/`: `visitor` (the services on offer, tickets, the measured service time), `public` (the state the display and ticket page share), `auth` (accounts, and the services and desks the administrator edits), `staff` (the desk), `device` (the ESP32), `events` (the stream). The hold rule and the occupancy-assisted requeue live in `queue_rules.py`, shared by `staff` and `public`. `app.py` is an app factory, debug off unless `MYTURN_DEBUG=1`.
- **Two sign-in mechanisms, on purpose.** `/api/auth/*` (accounts, roles, CSRF) is the real authentication; `/api/staff/login` is the shared classroom password. `staff_required` accepts either. `/api/staff/*` writes carry `@csrf_required`.
- The first administrator exists only because `seed_admin.py` ran; nothing in the running app reads `MYTURN_ADMIN_PASSWORD`. An invitation can only ever create `staff` (asking for `admin` is a 400), and public registration can never grant admin.
- CSRF is a double-submit token: the server keeps it in the Flask session, the browser keeps it in memory (`web/src/lib/api.ts`, `setCsrfToken`) and sends `X-CSRF-Token`. It is enforced only on authenticated writes.
- Real time is Server-Sent Events: `GET /api/events?ticket=<token>`, and routes call `broadcast.signal()` after committing; the stream re-reads the database rather than carrying state. `broadcast` and the rate-limit counters (`security.py`) are **per-process memory**, so the prototype has to run as a single worker - which is also why restarting the API clears rate limits.
- There is no mail server: invitation and reset links are returned in the response and logged while `MYTURN_DEV_TOKENS=1`.
- **The office is in Kigali, and the times shown are Kigali's.** What is stored is UTC; the day boundary, the hourly statistics and the shift tally are Kigali's (UTC+2, no daylight saving, so a fixed offset). `util.py` holds `KIGALI`, `local_date()`, `local_midnight()`, `local_iso()` and `local_sql()`; the browser is pinned to the zone in `web/src/lib/format.ts` (`TIME_ZONE`), so a tablet in another country still shows the office's time. Do not use `datetime.now()` without the zone in either half.
- `seed.py` creates the database, seeds the three starter services and their desks, attaches the board to a desk and prints the device key to `data/device_key.txt`; `reset.py` clears the queue, zeroes every per-service counter and pauses every desk, but must never delete accounts.

## Web app (`myturn/web`)

- Next.js 16.4 (Turbopack) + React 19 + Tailwind v4 + `cacheComponents: true`.
- **Middleware is `src/proxy.ts` and exports `proxy`** - there is no `middleware.ts` in this version. It only checks that a `session` cookie exists to skip a redirect; the API is the real gate.
- `web/AGENTS.md` is generated and re-added by `next dev`. Leave it alone; committing it as-is keeps the tree clean.
- Route groups decide the chrome, and the URL comes from the folder *inside* the group (`app/(public)/page.tsx` is `/`):
  - `(public)/` - site header + footer: home page
  - `(auth)/` - no site chrome; `AuthShell` carries the logo and the way back
  - `(desk)/` - the console: a sidebar (`components/console/ConsoleShell.tsx`) that groups the sections and carries the session - `/staff/dashboard`, `/admin/dashboard`, `/admin/activity`, `/admin/statistics`, `/admin/settings`, `/account`. The **Dashboard** leads the sidebar on its own, and the groups follow it (Administration, Service desk, Public pages, Your account). The Dashboard adapts: the desk opens `/staff/dashboard`, an administrator opens `/admin/dashboard`, and the administrator gets a **Staff page** link in the Service desk group; the desk's Queue analytics is not listed for an administrator, who already has Statistics. Only one control on a console page may be called **Sign out** (the sidebar owns it, and the browser suite locates it by name alone); the nav items are links, so the desk's `Open`/`Close` **buttons** stay locatable with an exact name match. Every section sits inside `components/console/AccountGate.tsx`, which asks the server who is signed in and applies `adminOnly` / `needsAccount`.
  - The console's panels are **flat**: a white surface on the mint workspace, with no border drawn around it, and no panel is folded away. A panel that is closed is a panel nobody reads, so the desk board and the service trends are always open; the figures under the chart are laid out as a sheet (`staff-sheet`) rather than behind a summary. The **keyboard shortcuts are the exception**: they are a card of keys that opens in a dialog (`DialogTrigger` on the desk page), not a panel on it.
  - The account page is the person's own: `POST /api/auth/profile` changes the name behind the session (the address is the administrator's to change), `GET /api/auth/account/history` reads the account's own history and `GET /api/auth/account/work` the decisions made at the counter. A shared classroom session has no account behind it, so all three refuse it.
  - The chart's period is chosen with `components/staff/DateRangePicker.tsx`: one calendar for the whole period, over `react-day-picker` and Radix, with the days after today not offered. The band between the two ends is the library's own, painted from the `--rdp-range-*` variables in `components/ui/calendar.tsx`.
  - `(ticket)/` - compact ticket bar: `/ticket`, `/ticket/[token]`
  - `app/display/` - no chrome at all (a television)
- With `cacheComponents: true`, a page that reads `params` must `await` it and sit inside `<Suspense>` (see `app/(ticket)/ticket/[token]/page.tsx`). Everything else is static-prerendered and loads its data in the browser.
- The palette is one Tailwind v4 `@theme` block in `src/app/globals.css`, with literal hexes plus the aliases `--color-ink` / `--color-line`. **There is no `tailwind.config.js`**; add tokens to `@theme`.
- Live data: `lib/useLive.ts` (SSE first, with a retry-and-polling fallback, `stopWhen` to end updates once the data is final) for `/display` and the ticket page. The console pages keep `lib/usePolling.ts` as their fallback and add `lib/useLiveRefresh.ts`, which refreshes a page the moment the queue stream reports a change (staff dashboard, admin dashboard, activity, statistics, settings).
- The session is an HTTP-only cookie plus an in-memory CSRF token (`lib/useSession.ts`). The only things in `localStorage` are the visitor's ticket token, under `myturn.ticket.token`, and a random per-browser visitor id, under `myturn.visitor.id`, which is what recognises a repeat tap (VIS-10). Neither is an account and neither says anything about the person.
- **Notifications are Sonner toasts**, project-wide: import `toast` from `sonner` and use `toast.error` / `toast.success` for page-level results instead of adding new inline alert banners. The host is mounted once in `app/layout.tsx` and styled in `components/ui/sonner.tsx`. Per-field validation messages stay under their fields (`Field`), and standing information (privacy notes, invitation details) is page content, not a toast. Give repeated messages a stable `id` so a retry replaces the toast instead of stacking it.
- Several labels are uppercased **by CSS**, so compare text case-insensitively: `innerText` returns the transformed "NOW SERVING", and a check for "Now serving" fails. This has broken the browser suite more than once.
- The desk page has two naming traps, either of which breaks the browser suite:
  - `getByRole("button", { name: "Served" })` is clicked **without `.first()`**, so exactly one button may carry "Served" in its accessible name. The undo strip's button is therefore called **Take that back**, never "Undo served".
  - `page.locator("p.tabular-nums").first` is read as the number being called, so no `<p>` with `tabular-nums` may come before it; put timers and tallies in `<span>`s.
- After editing `globals.css`, Turbopack can keep serving a stale CSS chunk: stop the dev server, delete `web/.next`, restart. Never delete `.next` while the dev server is running - that is what produces "this page couldn't load" and header links that vanish from screenshots.

## Verifying

```powershell
cd myturn\api;  .\.venv\Scripts\python.exe smoke_test.py   # 234 checks, 0 failed - needs the API running
cd myturn\api;  .\.venv\Scripts\python.exe check_device_ws.py --smoke  # the same suite plus the WebSocket checks, in a disposable office
cd myturn\web; npx tsc --noEmit; npx eslint .; npm run build
python C:\Users\Isaac\AppData\Local\Temp\opencode\verify_ui.py  # 71 checks, 0 failed - needs both servers
python C:\Users\Isaac\AppData\Local\Temp\opencode\check_sidebar.py   # 8 checks
python C:\Users\Isaac\AppData\Local\Temp\opencode\check_console.py   # 45 checks, creates and removes its own account
```

- The firmware compiles without the Arduino IDE. The CLI is bundled with it:
  `& "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" compile --fqbn esp32:esp32:esp32 firmware\myturn_desk`
  The core (3.3.12), ArduinoJson (7.4.3) and WebSockets (2.7.2) are already installed, and `firmware/myturn_desk/secrets.h` is the local copy of `secrets.example.h`. **Compile the sketch after any firmware change** - the ESP-IDF version matters: ESP-IDF 5 has no `portMUTEX_TYPE` (a FreeRTOS 8 type), a mutex is a `SemaphoreHandle_t`.

- There is no unit-test framework. `smoke_test.py` (the API) and the Playwright scripts (the interface) are the entire suite. "Verified" means these were run, not that the code reads correctly.
- `smoke_test.py` resets the transactional tables and the one account it creates, so it is repeatable - but it deliberately exhausts the forgot-password bucket (5 per 15 minutes, per process). A second run without restarting the API fails in the reset section with 429. **Restart the API between runs.**
- `check_device_ws.py --smoke` runs the same 234 checks against a **disposable** API, database and device key, and adds the WebSocket checks. Use it when the real board is connected: the live board reports every five seconds, so it can overwrite the reading the suite is asserting on, and the run becomes a race. The disposable run is the one that means something.
- `verify_ui.py`, `check_sidebar.py` and `check_console.py` live outside the repository, in the temp folder, and can be cleared at any time; recreate them rather than assuming they are there. Each registers its own account and removes it afterwards. Keep it that way - earlier runs left `staff...@example.com` accounts behind and the database had to be cleaned.
- `check_console.py` needs the API restarted first, like `verify_ui.py`: it signs in several times, and the sign-in bucket is per process.
- Kill port 3000 before `npm run build`, then restart the dev server.
- Report figures: `python myturn\tools\capture-figures.py` writes the four `assets\figure-*.png` the report uses. It needs both servers and resets the queue first (`--skip-reset` to keep the current one).

## Documents (the root of this folder)

- The report and proposal are generated by scripts in `C:\Users\Isaac\AppData\Local\Temp\opencode\` (`build_report.py`, `content_*.py`, `report_lib.py`, `export_report.ps1`, libraries in `myturn-doc-libs`, use `$env:PYTHONPATH` for those libs). That folder is outside the repository and is not backed up: if it is gone, rebuild from the `.docx` that is already at the root.
- INES house style, which the markers check: Times New Roman 12 pt (10 pt in tables and captions), 1.5 line spacing, A4 with a 3.8 cm left margin, captions as real Word `SEQ` fields, captions above tables and below figures. Word (v16) keeps documents open and blocks the DOCX-to-PDF copy step - close Word first.
- The report is marked out of 20: cover 2, abstract 2, table of contents 1, introduction 3, literature review 3, methodology 4, results and discussion 3, conclusion and references 2.
- Never invent a measurement. The abstract's `[number]`, Table 10, the section 4.7 figures and Figures 8-10 are knowingly left blank until the team supplies real numbers and a photograph of the desk rig.

## Rules this project is judged on

- Do not report a feature as complete unless it is implemented and verified.
- The sensors only measure. The PIR reports an approach; occupancy is the HC-SR04's alone; nothing counts or identifies people. The one exception is the **static obstruction**: an object that has sat still at the counter for `MYTURN_OBSTRUCTION_SECONDS`, with no approach seen near it in that whole window, does not block the desk from calling. It is a bag, not a visitor. A visitor who walked up and then stood still brought an approach with them and is never written off as a bag, and the hold rule is not relaxed at all - only the call guard is.
- Every delay and every sensitivity is written down in `docs/sensor-tuning.md`: the HC-SR501's own two trimmers (Sx = range, Tx = time delay), the firmware's PIR and ultrasonic constants, the report rate, and the symptoms to fixes. Occupancy takes about 2.75 s to believe and the same to release.
- The ticket number comes from the server's counter, never the browser, and the tracking URL uses an opaque token, never a sequential id. Every service has its own counter, and the number carries the letter of its service: A001, B001.
- A desk calls one visitor at a time and belongs to one service; two desks may work the same service at once.
- A ticket that nobody answers goes to the back of **its own service's** queue with a fresh number after `MYTURN_HOLD_SECONDS`, so an absent visitor cannot block the desk. The hold shortens to `MYTURN_MIN_CALL_SECONDS` only when the board is fresh and has seen nobody at the counter since the call; any missing or occupied evidence keeps the full hold.
- The waiting estimate is measured from served tickets and is withheld ("Not available") below `MYTURN_ETA_MIN_SAMPLES`; it is never guessed.
