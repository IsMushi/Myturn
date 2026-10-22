# Roles, permissions and features

Source of truth for what each kind of user can do in MyTurn. Everything under
"Implemented" was read out of the running code (`api/routes/`, `schema.sql`,
`web/src/components/`) and is exercised by `api/smoke_test.py` and the
browser suite. Everything under "Backlog" is **not** implemented.

## The four actors

| Actor | Who they are | How the server recognises them | Account? |
|---|---|---|---|
| **Visitor** | A person at the door with a phone | An opaque ticket token in the tracking URL | None. Never asked for a name, a phone number or an email |
| **Staff** | The person working the desk | A signed session from `/api/auth/login`, or the shared classroom password from `/api/staff/login` | Yes (invitation), or no when the shared password is used |
| **Administrator** | The account that manages the team | A session whose user has `role = 'admin'` | Yes; the first one comes from `seed_admin.py` only |
| **Device** | The ESP32 board at the counter | A device key in the report request | No |

## Permission matrix

| Capability | Visitor | Staff | Admin | Device |
|---|---|---|---|---|
| Take a ticket | yes | yes | yes | no |
| Follow a ticket (own token) | yes | yes | yes | no |
| Watch the wall display (`/display`) | yes | yes | yes | no |
| Read the desk state | yes | yes | yes | yes |
| Post a distance / occupancy reading | no | no | no | yes |
| See the whole waiting line | no | yes | yes | no |
| Call the next ticket | no | yes | yes | no |
| Complete / skip / cancel a ticket | no | yes | yes | no |
| Open, pause or close the desk | no | yes | yes | no |
| Read the board's health (online, last report) | no | yes | yes | no |
| Invite a staff member | no | no | yes | no |
| Withdraw a pending invitation | no | no | yes | no |
| List accounts and pending invitations | no | no | yes | no |
| Switch an account on or off | no | no | yes | no |
| Create an administrator | no | no | yes (never the last active one) | no |
| Read the activity history | no | no | yes | no |
| Read the statistics and export the tickets | no | no | yes | no |
| Describe the desk (name, description, target time) | no | no | yes | no |
| Change the password of their own account | no | yes | yes | no |
| Give a walk-in a ticket | no | yes | yes | no |
| Announce the current number again | no | yes | yes | no |
| Take back the last decision, within ten seconds | no | yes | yes | no |

## Implemented today

### Visitor - no account

* `GET /api/services` - the service on offer, so the ticket page never hardcodes one.
* `POST /api/tickets` - takes a number from the server counter and returns an opaque `access_token`. Rate-limited (`MYTURN_TICKET_ATTEMPTS`, default 20 per 60 s).
* `GET /api/tickets/<token>` - the visitor's own view: number, status, people ahead, the desk state, the last update.
* `GET /api/public/state` and `GET /api/events` - what the wall display and the ticket page watch. The waiting estimate is measured from served tickets and withheld below `MYTURN_ETA_MIN_SAMPLES`.
* A ticket nobody answers goes to the back of the queue with a fresh number after `MYTURN_HOLD_SECONDS`, so an absent visitor cannot block the desk. When the board is fresh and has seen nobody at the counter since the call, the hold shortens to `MYTURN_MIN_CALL_SECONDS` (25 s); an occupied counter, an approach, a missing reading or an offline board keeps the full hold.

### Staff - the desk

Page `/staff/dashboard` (`StaffDashboard.tsx`), polled every 2 s, every write carrying a CSRF token.

* Sign in as a person (`POST /api/auth/login`), or with the shared classroom password (`POST /api/staff/login`). Sign out (`/api/auth/logout` or `/api/staff/logout`).
* **The queue at a glance** - waiting count, the waiting numbers, and the ticket being called, with the hold countdown. `GET /api/staff/queue`.
* **Call next** - `POST /api/staff/call-next`, inside one transaction. If the current call is older than its hold, the missed number is re-issued at the back with a fresh number and the next visitor is called. The hold is `MYTURN_HOLD_SECONDS` unless the board's own readings justify the shorter `MYTURN_MIN_CALL_SECONDS`; the dashboard shows which, and why.
* **Close a ticket** - `POST /api/staff/tickets/<id>/action` with `complete` ("Served"), `skip` ("No-show") or `cancel` ("Cancelled"). Re-closing a closed ticket is a 409.
* **Take it back** - `POST /api/staff/tickets/<id>/undo` reverses the last decision for `UNDO_SECONDS` (10 s), and only while no other number has been called. It writes an `undone` event rather than deleting the log row.
* **Announce the number again** - `POST /api/staff/tickets/<id>/recall` rewrites `called_at`, which restarts the hold timer and restarts the measured service time from the last announcement.
* **Give a walk-in a ticket** - `POST /api/staff/tickets` takes a number from the same counter and writes `source = 'desk'`, so a visitor without a phone joins the same line.
* **Serving timer** - the call shows how long the visitor has been at the counter and how much of the hold time is left, next to the average the visitor page uses (`average_service_seconds`, `service_samples` in the queue payload).
* **Keyboard** - **N** calls the next visitor, **S** serves, **M** logs a no-show, **C** cancels, **R** recalls and **U** takes the last decision back.
* **Shift tally** - `served` and `no_shows` for the signed-in actor since midnight, counted from the latest event of each ticket so an undone decision stops counting.
* **Queue alert** - a new visitor raises a one-line notice and puts the waiting count in the window title.
* **Desk state** - `POST /api/staff/service` with `active`, `paused` or `closed`; the dashboard shows who last changed it and when (`desk_settings.updated_by`).
* **The board panel** - online/offline from `last_seen`, the last distance, occupancy, approach, and the LED colour. The approach flag only counts while the reading is fresh (`APPROACH_WINDOW_SECONDS`).

### Administrator

Pages `/admin/dashboard` (`AdminDashboard.tsx`), `/admin/activity`, `/admin/statistics`, `/admin/settings`. Each page refuses a staff session, and the API refuses it a second time with `@role_required("admin")`.

* **Invite a staff member** - `POST /api/auth/invitations`. One address, single use, `MYTURN_INVITATION_TTL_HOURS` (72 h). No mail server exists, so the register link is returned and shown on the page (`MYTURN_DEV_TOKENS`). Inviting the same address again **replaces** the waiting link instead of failing, so "send it again" is safe.
* **Withdraw an invitation** - `POST /api/auth/invitations/<id>/revoke`, for an address that was typed wrong or no longer needs access.
* **See the team** - `GET /api/auth/users` returns every account and every pending invitation, with the invitation id the revoke route needs. Passwords are never in the payload (`public_user`).
* **Switch an account on or off** - `POST /api/auth/users/<id>/active`, which is how a departing staff member loses access and how the login route answers 403 for a disabled account. An administrator cannot switch off their own account.
* **Delete another account** - `DELETE /api/auth/users/<id>` requires administrator rights, CSRF and the account email for confirmation. It refuses self-deletion; deleting a user revokes their active session and reset links while preserving queue and account event history. The invitation form is in a modal on `/admin/team`.
* **Act on selected accounts** - `POST /api/auth/users/batch` checks each id and email, applies switch on/off or a confirmed delete inside one transaction, and never includes the signed-in administrator. The table uses checkboxes and a batch toolbar; each other row's actions live behind a three-dot menu. For deletion the confirmation is `DELETE N`, where N is the exact selected count.
* **Promote or demote** - `POST /api/auth/users/<id>/role`. The route refuses to demote the last active administrator, which is what keeps at least one person able to open the page.
* **Activity** - `GET /api/auth/activity` merges `ticket_events`, `desk_settings` and `account_events` into one newest-first list, filterable by kind on the page. A requeue now carries the reason it happened (`ticket_events.detail`), including whether the counter was empty.
* **Statistics** - `GET /api/auth/stats`: counts, the service-time distribution, tickets per hour and per day. The average is withheld until `MYTURN_ETA_MIN_SAMPLES`, exactly as on the visitor page. If the desk has set a target time, the page reports the share of served tickets that met it.
* **Describe the office** - `GET` and `POST /api/auth/services`, `GET` and `POST /api/auth/desks`, all administrators only. A change is written to the `services` or `desks` table and read by `service_info()`, so the ticket page and the display pick it up without a restart. `GET` and `POST /api/auth/desk` still work and edit the first service.
* **Export** - `GET /api/auth/tickets.csv`, every ticket the prototype holds, as a file the statistics page links to.
* **A live summary** - waiting now, desk state, board online, from the staff queue (5 s).
* **Work the desk too** - an administrator can open `/staff/dashboard` and run the queue.

### Any signed-in account

Page `/account` (`AccountSettings.tsx`), inside the console.

* **Change your own password** - `POST /api/auth/password` asks for the current password and writes an `account_events` row. A session already open elsewhere is not closed by it, and the page says so.
* The shared classroom password has no account behind it, so the sidebar hides this section from it rather than offering a form the API would refuse.

### Account security, shared by staff and admin

* Passwords are hashed; login, registration and the reset flow are rate-limited per process.
* CSRF is a double-submit token, enforced on authenticated writes only.
* Sign-in does not say whether an address exists (one message for both cases, with a dummy hash to level the timing).
* `forgot-password` always answers the same way; a reset link is single-use, time-limited, and invalidates the address's other pending links.
* An inactive account cannot sign in; an administrator cannot switch off their own account.
* Self-hosted Google Sans, no third-party requests.

## Rules that must not be broken

* An invitation can only ever create `staff`; asking for `admin` is a 400.
* Public registration does not exist; registration needs an invitation token.
* An installation always keeps at least one active administrator: the role route refuses to demote the last one, and no administrator can switch off their own account.
* The account history is written to `account_events` by the address, not by a foreign key, so it stays readable after the account is deleted and cannot be rewritten by a rename.
* The first administrator is created by `seed_admin.py` from the environment. Nothing in the running app reads `MYTURN_ADMIN_PASSWORD`, and no administrator password is ever stored in code or in the browser.
* The session is an HTTP-only cookie with an in-memory CSRF token. No credential ever goes into `localStorage` (only the visitor's ticket token does).
* The sensors measure. They never count people and never identify anyone.

## Backlog - proposed, not implemented

Marked by what it would touch, so nothing here is mistaken for something that works.

### Administrator

| Feature | Why | Where it lands |
|---|---|---|
| **Session list and "sign out everywhere"** | A lost laptop keeps a working session until the cookie expires; the owner cannot see or end it | A `sessions` table, or a `password_changed_at` compared with the cookie's issue time |
| **Board management** | List the boards, show `last_seen`, rename one, rotate a device key | New admin views over `devices`; key rotation touches `seed.py` |
| **Two-factor sign-in for administrators** | The administration page can switch people off and hand out rights | TOTP stored per account, checked after the password |
| **Retention policy** | Tickets and events grow without limit; a old visitor's token should stop resolving | A purge job over terminal tickets older than `MYTURN_RETENTION_DAYS` |
| **Backup and restore** | The whole system is one SQLite file; losing it loses the day | A documented copy of `data/myturn.db` with the server stopped, ideally a dated script |

### Staff

| Feature | Why | Where it lands |
|---|---|---|
| **Call a specific ticket / reorder** | A priority case (a wheelchair, a returning visitor) has no path today | `POST /api/staff/tickets/<id>/call`, with the same single-`called` guard |
| **Transfer to another desk** | The office may run several desks, but a ticket belongs to the service it was taken for | Designed, M2 |
| **A note on a ticket** | "Came back with the form" - not personal data, just the purpose | `ticket_events` with `event_type = 'note'` |
| **End-of-shift summary** | Numbers for the daily hand-over | The same query as the admin statistics, scoped to the actor and the shift |

### Cross-cutting

* Kinyarwanda for the console and the dashboards, not just the ticket page (the ticket page's language selector currently offers Kinyarwanda marked "not yet available").
* A notification when a new ticket joins the queue, delivered to whoever is on shift.
* A ticket cannot be moved between services: it belongs to the service it was taken for until it is closed, and a desk may only work the queue of the service it serves.
