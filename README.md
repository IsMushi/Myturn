# MyTurn

Queue management and service desk status for one office.

A visitor scans the QR code at the door, picks the service they need, takes a
numbered ticket and follows their turn on their own phone. The person at the
desk calls the next ticket from a dashboard, an administrator invites the staff
members, and the ESP32 board measures whether the counter is occupied and shows
the desk state on an RGB light. No names, no telephone numbers, no camera.

The office may run several services (A General Service, B Admissions, C
Finance) and several desks. A visitor joins the queue of a *service*; each desk
serves one service and calls that service's next ticket, so two desks may work
the same service at the same time. Numbers carry the letter of their service:
A001, B001.

*Your Turn, Made Simple.*

## What is in this repository

| Folder | What it holds |
|---|---|
| `api/` | The Flask API, the SQLite schema and the tests |
| `web/` | The Next.js application: home page, visitor ticket, wall display, dashboards, accounts |
| `firmware/` | The ESP32 sketch for the board at the desk |

## Requirements

* Python 3.11 or newer
* Node.js 20 or newer
* An ESP32 DevKitC, one HC-SR04, one HC-SR501, one RGB LED and a buzzer (only for the hardware demonstration)

## Backend

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env          # then edit the secret and the two passwords
.\.venv\Scripts\python.exe seed.py        # creates the database and prints the device key
.\.venv\Scripts\python.exe seed_admin.py  # creates the first administrator from .env
.\.venv\Scripts\python.exe app.py         # serves http://127.0.0.1:5000
```

`seed.py` prints the device key once and writes it to `data/device_key.txt`.
Copy that key into the firmware. The database itself is a single file,
`api/data/myturn.db`, and it is created on the first run.

`seed_admin.py` is the only way an administrator comes into being. It reads
`MYTURN_ADMIN_EMAIL` and `MYTURN_ADMIN_PASSWORD` from `.env`, which keeps the
password out of the source code and out of any public page. Everyone after that
is created from an invitation the administrator sends from the admin dashboard.

Check the whole API while the server is up:

```powershell
.\.venv\Scripts\python.exe smoke_test.py
```

The test follows one real session from end to end and prints one line per check.
It covers the queue, the device, the hold rule, and the account system: signing
in, roles, invitations, registration, password reset, CSRF and rate limiting.

Two more checks cover the move from one desk to one office:

```powershell
.\.venv\Scripts\python.exe check_old_database.py   # builds a one-desk database and migrates it
.\.venv\Scripts\python.exe check_migration.py       # migrates a copy of the live database
```

The first writes the old shape into a temporary file and checks that nothing is
lost in the move. The second copies the live database and migrates the copy, so
the real one is never touched by a test.

### Routes

| Route | Called by | What it does |
|---|---|---|
| `GET /api/services` | Visitor page | The services the office offers, each with its own queue, state and waiting count |
| `POST /api/tickets` | Visitor page | Issues the next number **of the chosen service** with a private token |
| `GET /api/tickets/<token>` | Visitor page | Number, service, state, the desk serving it, how many tickets are ahead and the next few of them |
| `GET /api/public/state` | Wall display, visitor page | Every service with its now-serving numbers, the waiting count, the next numbers in that queue and the measured service time |
| `POST /api/auth/login` | Sign-in page | Checks an account and starts a session |
| `POST /api/auth/logout` | Dashboards | Ends the session |
| `GET /api/auth/me` | Every signed-in page | The account behind the session, and the CSRF token |
| `POST /api/auth/register` | Invitation page | Creates a staff account from an invitation token |
| `GET /api/auth/invitation` | Invitation page | The address an invitation was sent to |
| `POST /api/auth/forgot-password` | Forgotten password page | Issues a reset link for a known address |
| `POST /api/auth/reset-password` | Reset page | Changes the password once, from that link |
| `GET /api/auth/users` | Admin dashboard | Accounts and pending invitations (administrators only) |
| `POST /api/auth/invitations` | Admin dashboard | Invites a staff member |
| `POST /api/auth/users/<id>/active` | Admin dashboard | Switches an account off, or back on |
| `POST /api/auth/users/<id>/role` | Admin dashboard | Makes an account an administrator, or takes the rights back (the last administrator cannot be demoted) |
| `POST /api/auth/invitations/<id>/revoke` | Admin dashboard | Withdraws an invitation that has not been used |
| `POST /api/auth/password` | Account page | Changes the password of the account behind the session |
| `POST /api/auth/profile` | Account page | Changes the name on the account behind the session; the address is the administrator's to change |
| `GET /api/auth/account/history` | Account page | What has happened to the account behind the session, newest first |
| `GET /api/auth/account/work` | Account page | The decisions the account behind the session made at the counter, newest first |
| `GET /api/auth/activity` | Activity page | Ticket, desk and account history, newest first (administrators only) |
| `GET /api/auth/stats` | Statistics page | Counts, service-time distribution, busiest hours and the target comparison (administrators only) |
| `GET /api/auth/tickets.csv` | Statistics page | Every ticket as a CSV file (administrators only) |
| `GET /api/auth/desk` | Desk settings page | The first service's name, description and target time (administrators only) |
| `POST /api/auth/desk` | Desk settings page | The older route for the first service; kept working (administrators only) |
| `GET /api/auth/services` | Desk settings page | Every service, including one switched off (administrators only) |
| `POST /api/auth/services` | Desk settings page | Adds a service, with the next free ticket letter (administrators only) |
| `POST /api/auth/services/<id>` | Desk settings page | Changes a service's wording, target or availability (administrators only) |
| `GET /api/auth/desks` | Desk settings page | Every counter, with the service it serves and its live state (administrators only) |
| `POST /api/auth/desks` | Desk settings page | Adds a counter and points it at one service (administrators only) |
| `POST /api/auth/desks/<id>` | Desk settings page | Renames a counter, moves it to another service, or retires it (administrators only) |
| `POST /api/staff/login` | Demonstration only | The shared classroom password, kept for the defence |
| `POST /api/staff/logout` | Desk dashboard | Ends the session |
| `GET /api/staff/desks` | Desk dashboard | The counters of the office, so the dashboard can ask which one this is |
| `GET /api/staff/queue` | Desk dashboard | The waiting line of **this desk's service**, its state, current call, last report, this session's tally |
| `POST /api/staff/call-next` | Desk dashboard | Calls the next ticket inside one transaction |
| `POST /api/staff/tickets/<id>/action` | Desk dashboard | Completes, skips or cancels one ticket |
| `POST /api/staff/tickets/<id>/recall` | Desk dashboard | Announces the current number again and restarts its hold time |
| `POST /api/staff/tickets/<id>/undo` | Desk dashboard | Takes back the last decision, for ten seconds and only until the next number is called |
| `POST /api/staff/tickets` | Desk dashboard | Issues a ticket to a walk-in visitor, from the same counter and the same service |
| `POST /api/staff/service` | Desk dashboard | Pauses, resumes or closes **one desk** |
| `POST /api/device/readings` | ESP32 | Stores a distance reading, occupancy, approach and the light applied |
| `GET /api/device/setting` | ESP32 | Returns the state the light should show, and the latest call event so the buzzer can announce a call or a recall |
| `WS /ws/device` | ESP32 | Authenticates with a device hello, receives pushed desk/call state, and sends acknowledged sensor reports on one persistent connection |

Desk routes need a session, either an account or the shared classroom password.
Administrator routes need an account whose role is `admin`. Device routes need
the `X-Device-Key` header, and only the digest of that key is stored. Every
request that changes something from a browser session also carries the
`X-CSRF-Token` header, and the sign-in and reset routes are rate limited per
address.

### Rules that live on the server

* The office is in **Kigali**, and every time it shows is Kigali's. What is
  stored is UTC, because that is what a timestamp should be; the day the desk
  starts, the hours the statistics count and the clock on the wall display are
  Kigali's (UTC+2, with no daylight saving, so the offset never moves). The
  browser is told the zone in `web/src/lib/format.ts` (`TIME_ZONE`), so a
  tablet set to another country still shows the office's time.
* The ticket number comes from a counter row updated inside the same
  transaction that inserts the ticket, so two visitors cannot receive the same
  number. Every service has its own counter (`ticket:A`, `ticket:B`), and the
  letter in front of the number is that service's.
* One desk calls one visitor at a time, and a desk belongs to exactly one
  service. The database enforces it with a unique index on the called rows per
  desk, so two desks may hold two calls of the same service at once, and a
  third call on either desk is refused. A desk can call only while it is open:
  a paused desk still accepts tickets but waits for the staff member to resume,
  and a closed desk accepts neither tickets nor calls.
* A called ticket that nobody answers goes back to the queue **at the back**,
  with a fresh number, after `MYTURN_HOLD_SECONDS` (60 seconds by default), so
  an absent visitor cannot block the desk. When the board is fresh and has seen
  nobody at the counter since the call, the server shortens that hold to
  `MYTURN_MIN_CALL_SECONDS` (25 seconds). An occupied counter, an approach, a
  missing reading or an offline board keeps the full hold.
* The queue recovers without a button: `sweep_queue()` runs when the desk page,
  the public state or the event stream reads the queue, and the requeue records
  whether the counter was empty in `ticket_events.detail`. Every desk that has
  left a call hanging is swept, and a requeued ticket goes to the back of **its
  own** service's queue with a fresh number from that service's counter.
* The sensor only measures. Every decision about a ticket or the desk state is
  made in the staff routes.
* The browser is never trusted with a role: the role comes from the session the
  server issued, and the administration routes check it again on every request.
* Registering can only ever create a staff account. An invitation cannot carry
  the administrator role, and neither can the registration form. Administrator
  rights are granted afterwards, from the accounts table, by an administrator.
* An installation always keeps at least one administrator who can open the
  administration page: the role route refuses to demote the last active one, and
  no administrator can switch off their own account.
* A decision at the desk (served, no-show, cancelled) can be taken back for ten
  seconds, and only while that desk has not moved on. Once it has, the visitor
  would be returning to a counter somebody else is standing at, so the route
  refuses. Another desk serving the same service does not block the undo.
* One address may take `MYTURN_TICKET_ATTEMPTS` tickets a minute (20 by
  default), which stops a reload loop or a script from filling the queue. The
  page also refuses to send a second request while the first is in the air.
* The estimated wait is measured, never guessed: it is the number of tickets
  ahead multiplied by how long the desk has actually taken, worked out from the
  tickets it has closed. Below `MYTURN_ETA_MIN_SAMPLES` served tickets the page
  says the estimate is not available instead of showing a figure.
* The services the office offers are rows in `services`, and the counters are
  rows in `desks`. A fresh office is seeded with three services (A General
  Service, B Admissions, C Finance) and one desk for each. An administrator
  edits both on `/admin/settings`, and `GET /api/services` reports them, so the
  visitor page shows what the server offers rather than a list written into the
  page. A service may be switched off, but not while somebody is waiting for
  it, and the office must keep at least one service on offer.
* A service keeps the letter it was given: the letter is the prefix of every
  number it issues, so it cannot be changed once the service is in use.

## Web app

```powershell
cd web
npm install
Copy-Item .env.example .env.local    # only if the API is not on port 5000
npm run dev                          # serves http://localhost:3000
```

| Page | Address | Who uses it |
|---|---|---|
| Home page | `/` | Anyone: what MyTurn is and how it works |
| Visitor ticket | `/ticket` | The visitor, from the QR code on their phone: the service to pick, the queue of that service, and the button that joins it |
| A held ticket | `/ticket/<token>` | The same visitor, opening their ticket from a link, and following it |
| Wall display | `/display` | A tablet or monitor in the waiting area: every service, the number being served at its desks and who is waiting |
| Sign in | `/auth/login` | Staff and administrators |
| Join from an invitation | `/auth/register` | A new staff member, following their invitation link |
| Forgotten password | `/auth/forgot-password` | Anyone with an account |
| Choose a new password | `/auth/reset-password` | The same person, following the link |
| Desk dashboard | `/staff/dashboard` | The person at the desk: which counter they are working, the queue of its service, the board, walk-ins, recall and undo |
| Administration | `/admin/dashboard` | The administrator: accounts, roles and invitations |
| Activity | `/admin/activity` | The administrator: what the queue, the desk and the accounts recorded |
| Statistics | `/admin/statistics` | The administrator: counts, service times, busiest hours, target comparison, CSV export |
| Desk settings | `/admin/settings` | The administrator: the services the office offers and the desks that serve them, changed live |
| Your account | `/account` | Any signed-in account: its details, what its role may do, its own account history, its work at the counter, and its password |

The old addresses `/screen` and `/staff` still work: `next.config.ts` redirects
them to `/display` and `/staff/dashboard`.

Everything under `/api` is proxied to Flask by a rewrite in `next.config.ts`,
so the browser sees one origin and the session cookie works without CORS
tricks. Set `BACKEND_ORIGIN` in `.env.local` to point somewhere else.

The visitor page remembers the ticket in `localStorage`, so closing the page
does not lose the place. Nothing about an account is kept there: the session is
an HTTP-only cookie and the role is only ever read from the server.

The homepage hero follows `web/public/images/hero-section-ui.png`: real
navigation, heading and ticket links beside the full-bleed concept artwork.
The illustration's example numbers are not live; its accessible description
identifies them without a visible caption. Only the separate **Live queue**
panel reads `/api/public/state` (every 15 seconds), with
explicit empty, connecting and unavailable states. To regenerate the artwork
crop, run `python tools/extract-hero-art.py` with Pillow installed. Landing-page
styles are namespaced in `web/src/components/public-home.css`.

The wall display uses `web/src/components/display-board.css` and the
components in `web/src/components/display/`: a logo header with the live
connection and the time of the last successful update. The logo links back to
the homepage; the board has no other site navigation because it is a television.
The waiting total comes next, then
one card per service with its state badge, the number being called (or an
honest open/paused/closed empty state), the next numbers waiting for that
service — at most eight, with a count for the rest — and that service's
waiting count. A new
call draws a ring once and the number rises into place; reduced-motion users
get no animation. If the stream and polls both fail, the board keeps the last
numbers but labels them as old and offers a reconnect. Ticket pages share
`web/src/components/ticket/ticket-pages.css`, with service selection beside
the queue summary on desktop and above it on mobile. Their SSE, private tracking
links, measured estimates and print behaviour are unchanged.

The display matches `web/public/images/MyTurn Queue Dashboard.png`, with a
scoped mint-wave background and the concept's decorative ticket illustration.
Run `python tools/extract-display-art.py` to regenerate that illustration crop;
headings, badges and queue values remain accessible live HTML. While connecting,
`DisplayBoardSkeleton` preserves the three-card layout with mint placeholders,
an announced busy state and reduced-motion support. Initial failures show a retry
instead, and a lost connection retains the last-known data with a stale warning.
Read-only browser checks (no database changes) are available with:

```powershell
python tools/check-display-ui.py --output-dir "$env:TEMP\opencode\display-verification"
```

Account forms share `PasswordInput` for password visibility and await their API
requests before clearing loading states. Recovery explains that email delivery
is not configured, shows a reset link only when the development API returns one,
and offers a fresh request when a reset link is missing or expired. The alternate
spelling `/auth/forget-password` redirects to `/auth/forgot-password`.

The homepage sections render without scroll-triggered hiding; the navigation
highlights the section in view, and the phone menu supports Escape. Account pages
share the responsive `AuthShell` (`web/src/components/auth-shell.css`), with
home and visitor-ticket links on mobile as well as desktop. Sign-in supports
password visibility, inline errors and a disabled loading button while it awaits
the real login request; it retains the existing role-based redirect and session.

The console - the desk dashboard, the administration pages and the account page -
is one frame with a sidebar. The **Dashboard** leads the list on its own, and
the sections are grouped after it (Administration, Public pages, Your account),
the current one is highlighted, and the account sits at the foot with a single
Sign out. On a phone the same list opens as a drawer. Only sections that exist
are listed, so the menu never offers a page it cannot open, and the
administration group appears only for an administrator. The account section is
hidden from the shared classroom password, which has no account behind it and
therefore no password of its own to change.

The panels of the console are flat: a white surface on the mint workspace, with
no border drawn around it, and none of them is folded away. The desk board and
the service trends are always open, because a panel that is closed is a panel
nobody reads. The keyboard shortcuts are the exception: they are a card of keys
that opens in a dialog of its own, so the desk page is not carrying a list
nobody looks at. The figures under the chart are laid out as a sheet that
comes in from the right, and the period is chosen with a calendar rather than
with two boxes that ask for a day each.

The account page is the person's own: the name may be corrected there, the
address may not; the joined and last-signed-in dates are shown; what the role
may do is spelled out; and the account's own history and the decisions made at
the counter are read back to them, which the administration page used to be
the only place to see.

Each console page still reads its own data over HTTP and keeps its timer as a
fallback, but it also follows the same event stream the wall display uses: a
number called, a ticket served or missed, a desk opened or closed, or a service
edited appears on the desk, activity, statistics and settings pages as the frame
arrives, rather than on the next poll.

The staff dashboard puts the current visitor beside an ordered, scrollable waiting
list. Personal totals cover all desks since midnight UTC; the average belongs to
the selected service and appears only with enough completed-ticket samples. Desk
availability, walk-in tickets, recall and undo retain their server rules. Cancelling
a ticket asks for confirmation. Keyboard shortcuts are inactive inside controls,
menus and dialogs; **U** restores the last decision while the desk has no current
call. Queue actions are locked while a write is pending or the queue is stale
(a failed refresh, or 15 seconds without a successful response). Connection loss
shows one persistent, bottom-right toast with a Reconnect action, not an inline
banner or a new notification on every poll. The compact Offline indicator stays
visible; the toast clears only after recovery or leaving that desk. Expired access
uses the same toast with Sign in instead. Initial loading errors still offer their
inline retry, and ticket-action feedback is unchanged. Device diagnostics
and service charts expand on request. An offline board's readings are historical,
not evidence that the counter is currently free. Dashboard styles are scoped in
`web/src/components/staff-dashboard.css`.

To verify this dashboard without resetting the live office, keep the web server
running and run `python tools/check-staff-dashboard.py`. It starts a disposable
Flask API and database on a free loopback port and forwards every test-browser API
request there. The test needs Playwright in the system Python and the existing API
venv; screenshots and results go to the OpenCode temp folder by default.

The ticket screens carry a small bar of their own instead of the site
navigation — home, the visitor's own ticket, and the language — because somebody
who has just scanned the code has one thing to do. The ticket can be printed:
`@media print` in `globals.css` hides the page and lays down the ticket alone.

Following a ticket asks the server every three seconds while the ticket is
still waiting or called, and stops once the desk is finished with it, so a
finished ticket is not asked about again.

## Firmware

```powershell
cd firmware\myturn_desk
Copy-Item secrets.example.h secrets.h   # fill in WiFi, API address and device key
```

Open `myturn_desk.ino` in the Arduino IDE with the ESP32 board package
installed. Install **WebSockets by Markus Sattler (2.7.2)** and
**ArduinoJson by Benoit Blanchon (7.4.3)** from Library Manager, select
**ESP32 Dev Module** and upload. `sketch.yaml` records the ESP32 3.3.12 and
library versions used for verification. Wiring is in the project
report, Section 4.3; the buzzer is the one addition to that diagram (GPIO 32).

The board uses an authenticated **WebSocket**, not HTTP polling. `API_BASE`
is converted from `http://host:5000` to `ws://host:5000/ws/device`; there is no
second device URL to maintain. The browser continues to use SSE through Next.js.
The device socket connects directly to Flask, not through Next's `/api` rewrite.
The older HTTP device routes remain available for compatibility.

The board sends a reading every five seconds, every second while the PIR sensor
sees someone approaching, and immediately when occupancy, approach or the applied
LED changes. It drives the light: green when the desk is open and
free, red when it is open and occupied, yellow when it is paused, and off when
it is closed.

Desk changes and call events are pushed after committed changes, independently of
the sensor reporting interval. The server also sends an authoritative snapshot
every five seconds. The network runs in a separate FreeRTOS task: sensor updates,
local occupancy lighting and buzzer timing do not wait for TCP/TLS handshakes or
reconnects. A missing connection or a snapshot older than twelve seconds restores
the safe **paused/yellow** indication. This is a local safety indication, not a
change to the desk's server-side availability.

Each report has a sequence number and receives an acknowledgement after storage.
Duplicate sequence numbers are not stored twice. A missing acknowledgement after
four seconds reconnects the socket. Reconnect delays back off with jitter, up to
about thirty seconds. There is only a latest-value measurement queue, not an
offline history: pre-reconnect samples and samples older than six seconds are
discarded. Sensor faults and old measurements always keep the full visitor hold;
a live heartbeat alone is not evidence that the counter is empty.

The buzzer is on **GPIO 32**. A 3-pin active module connects VCC to 3V3, GND to
GND and I/O to GPIO 32; if yours is a bare passive buzzer, set
`BUZZER_PASSIVE` to `1` in the sketch, and drive a bare 5 V buzzer through an
NPN transistor rather than straight from the pin. The board sounds once when
its own desk calls a number and twice when that number is recalled. Pushed call
events carry IDs for deduplication and an age; events older than twenty seconds
are ignored. The first snapshot after boot, reconnect or desk reassignment is a
quiet baseline, not a new announcement. The buzzer pattern is nonblocking.

For an HTTPS deployment, `API_BASE` selects WSS. Define `WS_CA_CERT` in the private
`secrets.h` as the trusted root certificate PEM string. Firmware refuses HTTPS/WSS
without a CA; it never enables insecure TLS. The network must allow time sync for
certificate validation. Any reverse proxy must forward WebSocket upgrades at
`/ws/device`; never put the device key in a URL or expose plain WS outside the
trusted demonstration LAN.

Verification without touching the live office:

```powershell
cd api
.\.venv\Scripts\python.exe check_device_ws.py --smoke
```

This starts its own Flask server and temporary SQLite database, exercises real
WebSocket frames and HTTP queue actions, then runs the existing HTTP smoke suite
against that same disposable office. It does not require or reset the live API.
An Arduino compile verifies the firmware build; flashing and a physical
disconnect/reconnect, sensor, LED and buzzer check are still required on the board.

For the hardware demonstration the API must accept the board's connection, not
just localhost. Start it with `HOST=0.0.0.0` (the default is `127.0.0.1`), allow
TCP 5000 through Windows Firewall, and keep `API_BASE` pointed at the laptop's
address on the board's network (`192.168.137.1` on Windows ICS). Do not expose
the API beyond that network.

## Running both halves

```powershell
.\dev.ps1
```

Two windows open, one for each server.

## Demonstration order

1. Open `http://localhost:3000` on the projector and walk the home page, then
   open `/display` on the second screen.
2. Sign in at `/auth/login` as the administrator from `api/.env`. The
   dashboard opens on `/admin/dashboard`.
3. Invite a staff member, copy the registration link the page shows, and open it
   in a second browser. Create the account and land on `/staff/dashboard`.
4. Open `/ticket` on a phone, pick **Admissions** in step 1 and press **Get My
   Ticket** - the number is B001. Take two or three more from other browsers
   for **General Service**, and they are A002, A003: every service has its own
   numbering.
5. Press **Open** so the desk stops being paused, and watch the light turn green.
   Press **Pause** and it turns yellow; press **Close** and it turns off; a paused
   or closed desk will not call the next visitor until it is opened again.
6. Press **Call next**: the desk calls the first number of *its* service. Now
   change the counter to **Desk 2** in the picker, open it and call again. The
   two desks hold two calls at the same time, and the wall display shows both
   numbers with the desk serving each.
7. Put a hand in front of the sensor: the dashboard shows the approach within a
   second and the light turns red.
8. Call the next number and watch the visitor page change to *It's Your Turn!*
   with the desk to go to.
9. Press **Served**, then call the next ticket. Try the keys instead of the
   mouse: **N** calls the next visitor, **S** serves them.
10. With a number called, press **M** (no-show) and then **Take that back** within
    ten seconds: the visitor is at the counter again and the shift tally is back
    where it was.
11. Press **Call again**: the board gives two short beeps (a first call gives one)
    and the number is announced again. Hand a walk-in a ticket with **Give a
    walk-in a ticket**: it takes the next number in the same line.
12. Leave one call unanswered: after the hold time it goes to the back of the
    queue on its own and the next ticket is called.
13. Open `/admin/settings` to show the services and the desks, and change the
    wording of a service while the queues are running.
14. Open `/admin/activity` to show what the queue, the desk and the accounts
    recorded, and `/admin/statistics` for the counts, the service-time
    distribution and the busiest hours, queue by queue. Download the CSV.
15. Open `/account` from the sidebar and change the administrator's password -
    then change it back before the defence.
16. If there is time, sign out, use **I have forgotten my password**, and follow
    the link the prototype shows in place of an email.

## Limits

* A desk serves one service, and a service may have several desks. The
  prototype does not move a visitor between services: a ticket belongs to the
  service it was taken for until it is closed.
* A service keeps its number sequence for ever, so a letter is never reused
  and a number is never given out twice.
* The prototype has no mail server, so an invitation link and a reset link are
  returned in the response and written to the log while `MYTURN_DEV_TOKENS=1`.
  That switch must be off anywhere real, where the link would be emailed.
* Rate limiting counts attempts in memory, per server process. Several workers
  would need the counts moved into the database.
* The development servers are HTTP. The hosted demonstration is served through
  a tunnel over HTTPS with `MYTURN_SECURE_COOKIES=1`.
