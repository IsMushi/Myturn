# MyTurn feature catalogue

The complete feature definition for the system, module by module. Every feature
carries an identifier, a status and a milestone, so nothing here can be mistaken
for something that works.

**Status**

| Mark | Meaning |
|---|---|
| **Built** | Implemented in the prototype and exercised by `smoke_test.py` and/or the browser suite |
| **Partial** | Some of it exists; the table names what is missing |
| **Designed** | Specified in this repository, not implemented |

**Milestone**

| Mark | Scope |
|---|---|
| **M1** | Small, high-value work that fits the current one-desk prototype |
| **M2** | Larger features that change the data model or open the system out |
| **M3** | Deployment, fleet and integration work |

The algorithms behind the interesting entries - the queue state machine, the hold
rule, the occupancy-assisted requeue, the waiting estimate - are specified in
`innovation-and-design.md`.

---

## 1. Visitor ticketing (VIS)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| VIS-01 | Take a numbered ticket from a phone | Built | - |
| VIS-02 | Opaque tracking token instead of a ticket id | Built | - |
| VIS-03 | Service offered by the server, not hardcoded in the page | Built | - |
| VIS-04 | Measured waiting estimate, withheld until it means something | Built | - |
| VIS-05 | How many people are ahead of you | Built | - |
| VIS-06 | Digital ticket with a QR code to the tracking page | Built | - |
| VIS-07 | Print or save the ticket | Built | - |
| VIS-08 | Follow the ticket from any device that has the link | Built | - |
| VIS-09 | Service availability indicator from the live desk state | Built | - |
| VIS-10 | Duplicate-submission guard | Built | M1 |
| VIS-11 | Queue-closed state | Built | - |
| VIS-12 | Ticket-unavailable state for a stale or wrong link | Built | - |
| VIS-13 | Language selector | Partial | M2 |
| VIS-14 | Join without scanning: short link and a printed numeric code | Designed | M1 |
| VIS-15 | Ticket issued from the desk for a visitor with no phone | Built | - |
| VIS-16 | Appointment: book a time window and collect a ticket on arrival | Designed | M2 |
| VIS-17 | Remote ticket and "come now, you are third" notification | Designed | M2 |
| VIS-18 | Self-declared priority (elderly, disabled, pregnant) | Designed | M2 |
| VIS-19 | Step away and keep your place for a bounded time | Designed | M2 |
| VIS-20 | Ask the desk a short question from the phone | Designed | M2 |
| VIS-21 | Clear feedback when a visitor is rate-limited | Partial | M1 |
| VIS-22 | Give up your place, from the phone | Designed | M1 |
| VIS-23 | A missed call explains the new number on the same link | Built | - |

* VIS-23 is the visitor's side of the hold rule. The hold rule gives a called
  ticket a fresh number at the back of its own queue, on the *same* tracking
  link, so without this the number changes under a visitor who is still looking
  at the page. The `requeued` event now records the number that was given up,
  and `GET /api/tickets/<token>` returns it as `last_requeue`; the ticket page
  shows an amber notice with the old number, the time and the new number, and
  stops showing it once the desk has finished with the ticket.
* VIS-22 closes a real gap: a visitor who leaves currently has no way to say so,
  and the desk calls a number that is already at home. Cancelling with the token
  turns a guessed no-show into a stated one.
* VIS-10: the page blocks a second press while a request is in flight and the API
  rate-limits the address, but a visitor who reloads and taps again still gets a
  second number. M1 adds a per-browser marker so the page can say "you already
  have ticket 42" and link to it, instead of issuing a duplicate.
* VIS-13: the ticket header offers English, Kinyarwanda and French; only English
  is written. Kinyarwanda is marked "not yet available" rather than shown as a
  working option.
* VIS-17 is the honest alternative to keeping a visitor standing in the hall. It
  needs a notification channel (`COM-05`), because the visitor's browser is
  normally closed by the time their turn comes.
* VIS-15 is the desk side of the same capability as DSK-17: the counter issues a
  ticket from the same counter as the QR code, so a walk-in takes the next number
  in the same line rather than a separate one.

## 2. Queue engine (QUE)

The rules that make the queue trustworthy. This is the part the report defends.

| ID | Feature | Status | Milestone |
|---|---|---|---|
| QUE-01 | Server-side numbering, one writer at a time | Built | - |
| QUE-02 | First come, first served ordering | Built | - |
| QUE-03 | At most one ticket being called, enforced by the database | Built | - |
| QUE-04 | Call next, inside one transaction | Built | - |
| QUE-05 | Hold timer and automatic requeue with a fresh number | Built | - |
| QUE-06 | Terminal states: served, no-show, cancelled | Built | - |
| QUE-07 | Append-only event log for every ticket | Built | - |
| QUE-08 | Every automatic and manual action attributed to an actor | Built | - |
| QUE-09 | Undo the last desk action within a short window | Built | - |
| QUE-10 | Recall the current number | Built | - |
| QUE-11 | Call a chosen ticket out of order | Designed | M1 |
| QUE-12 | Priority lane | Designed | M2 |
| QUE-13 | Transfer a ticket to another desk | Designed | M2 |
| QUE-14 | One office with several services and several desks, each service with its own queue | Built | - |
| QUE-15 | Target service time per service, with a breach flag | Designed | M2 |
| QUE-16 | Occupancy-assisted requeue: the board shortens the wait for a no-show | Built | - |
| QUE-17 | Capacity governor: stop issuing when the line is already long | Designed | M2 |
| QUE-18 | Day rollover: number every queue day from one | Designed | M2 |
| QUE-19 | Duplicate-ticket detection per browser | Built | M1 |

* QUE-09 is the cheapest reliability win in the project. A mis-tap on "No-show"
  would otherwise be permanent; undo writes the reverse event and restores the
  previous status, and the event log still shows that both happened. It is
  refused after `UNDO_SECONDS` (10) or once another number has been called.
* QUE-16 is implemented in `queue_rules.py`, not on the board. A fresh board that
  has seen nobody since the call shortens the hold to
  `MYTURN_MIN_CALL_SECONDS` (25 s); an occupied counter, an approach, a missing
  reading or a board that stopped reporting all fall back to the full hold.
  `sweep_queue()` runs on the reads that matter, so the queue recovers even if
  nobody presses a button, and the event log records that the counter was empty.
* QUE-12 must stay self-declared. The moment the system guesses who deserves
  priority it is classifying people, which this project does not do.
* QUE-18 matters for a real desk: ticket numbers that climb forever make the
  display unreadable. The counter would restart per day and the number would be
  shown with the day, e.g. `42` today, `1` tomorrow.

## 3. Staff desk console (DSK)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| DSK-01 | Sign in as a person, or with the classroom password | Built | - |
| DSK-02 | Live queue: waiting count, waiting numbers, current call | Built | - |
| DSK-03 | Call next | Built | - |
| DSK-04 | Mark served, no-show or cancelled | Built | - |
| DSK-05 | Open, pause or close the desk - and who did it | Built | - |
| DSK-06 | Board health: online, last report, distance, occupancy, approach, LED | Built | - |
| DSK-07 | Hold countdown on the current call | Built | - |
| DSK-08 | Waiting list | Built | - |
| DSK-09 | Sign out | Built | - |
| DSK-10 | Serving timer for the visitor at the counter | Built | - |
| DSK-11 | Undo the last action | Built | - |
| DSK-12 | Recall the current number | Built | - |
| DSK-13 | Keyboard shortcuts (N, S, M, C, R, U) | Built | - |
| DSK-14 | Alert when the queue grows | Built | - |
| DSK-15 | My tally for this shift | Built | - |
| DSK-16 | A short note on a ticket | Designed | M2 |
| DSK-17 | Add a walk-in ticket | Built | - |
| DSK-18 | Open and close a shift, with a summary | Designed | M2 |
| DSK-19 | Ask an administrator for help from the console | Designed | M2 |
| DSK-20 | Dim-desk dark theme | Designed | M2 |
| DSK-21 | Degraded banner when the API, the stream or the board is down | Partial | M1 |

* The console frame is built: a grouped sidebar
  (`web/src/components/console/ConsoleShell.tsx`) whose first link is the
  **Dashboard**, followed by the groups Administration (administrators only),
  Public pages and Your account, the current section highlighted, and the
  account with a single **Sign out** at the foot. On a phone it is a drawer.
  New sections join that list as their pages are built.
* DSK-04 uses the terms the desk actually says: Served, No-show, Cancelled. The
  API keeps the status names `completed`, `skipped`, `cancelled`.
* DSK-05 lets the person pausing say why and when they expect to be back, in
  their own words and within 5 to 240 minutes. Both live on the `desk_settings`
  row, the console repeats them, and opening or closing clears them. Nothing is
  inferred from the time of day, and a return time that has passed leaves the
  desk paused: an empty counter must not start calling by itself.
* DSK-10 shows how long the visitor has been at the counter, next to the same
  measured average the visitor page uses, and marks a call that runs past it. The
  page shows the measurement; it does not decide that anything is wrong.
* DSK-11 is a ten-second window that closes as soon as the next number is called:
  undoing after that would send a visitor back to a counter somebody else is
  standing at. The undo never deletes the log row; it adds an `undone` event, so
  the history still shows what was pressed.
* DSK-13 uses one letter per action and only one meaning at a time: **N** calls the
  next visitor while the desk is free, then **S** serves, **M** logs a no-show,
  **C** cancels, **R** calls the number again and **U** takes the last decision back.
* DSK-14 carries the waiting count into the window title as well, because the
  person at the desk is often looking at another window.
* DSK-15 and the admin statistics come from the same rule - the **latest** event for
  each ticket - so a no-show that was taken back stops counting, while the log row
  that recorded it stays.

## 4. Administration (ADM)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| ADM-01 | Invite a staff member by address | Built | - |
| ADM-02 | List accounts and pending invitations | Built | - |
| ADM-03 | Switch an account on or off | Built | - |
| ADM-04 | Desk summary on the administration page | Built | - |
| ADM-05 | Open the desk from the administration page | Built | - |
| ADM-06 | Promote or demote an administrator | Built | - |
| ADM-07 | Change your own password while signed in | Built | - |
| ADM-08 | Revoke or resend a pending invitation | Built | - |
| ADM-09 | Session list and "sign out everywhere" | Designed | M2 |
| ADM-10 | Audit trail viewer over `ticket_events`, `desk_settings` and `account_events` | Built | - |
| ADM-11 | Service statistics with charts | Built | - |
| ADM-12 | Export the tickets as CSV | Built | - |
| ADM-13 | Device list, rename, key rotation | Designed | M2 |
| ADM-14 | Desk settings at runtime: name, description, target time | Built | - |
| ADM-15 | A notice pushed to the wall display | Designed | M1 |
| ADM-16 | Retention policy: purge tickets older than N days | Designed | M2 |
| ADM-17 | Two-factor sign-in for administrators | Designed | M2 |
| ADM-18 | Backup and restore of the SQLite database | Designed | M2 |

* ADM-06 closes a hole that used to be documented: an invitation can never carry
  the administrator role, and the role route refuses to demote the last active
  administrator or to switch off your own account, so an installation cannot lock
  itself out of the administration page.
* ADM-10 reads three records back in one order: `ticket_events` for the queue,
  `desk_settings` for the desk, and `account_events` for the accounts. The last one
  exists because an account can be deleted or renamed while its history has to stay
  readable, so it stores the address rather than a foreign key to `users`.
* ADM-12 exports every ticket the prototype holds, not one day's worth - the
  endpoint takes no date, and the page says "the tickets" rather than implying a
  filter it does not have.
* ADM-14 removes the last of the `.env`-and-restart settings. A service keeps its
  wording in the `services` table, and a change records who made it and when, so the
  ticket page and the wall display pick it up without a restart.

## 5. IoT sensing and the board (IOT)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| IOT-01 | Device-key authentication on every board request | Built | - |
| IOT-02 | Distance measurement (HC-SR04) | Built | - |
| IOT-03 | Occupancy decided from the measured distance | Built | - |
| IOT-04 | Approach detection (PIR) with a freshness window | Built | - |
| IOT-05 | LED colour driven by the desk state | Built | - |
| IOT-15 | Blue LED indicates active call (visitor being called) | Built | M1 |
| IOT-06 | Reading history, capped per board | Built | - |
| IOT-07 | Online or offline from the last report | Built | - |
| IOT-08 | Settings poll: the board asks what to show | Built | - |
| IOT-09 | Sensor self-test and a "this reading looks wrong" flag | Designed | M1 |
| IOT-10 | Occupancy-assisted requeue | Built | - |
| IOT-11 | Buffer readings while the API is unreachable, then flush | Designed | M2 |
| IOT-12 | Pairing a board without a hardcoded key | Designed | M2 |
| IOT-13 | Heartbeat with firmware version | Designed | M1 |
| IOT-14 | Several boards, one renamed and relayed | Designed | M3 |

* The sensor rules that must not move: the PIR reports an approach, the HC-SR04
  alone decides occupancy, and nothing counts or identifies people. IOT-09 and
  IOT-10 both stay inside that line - they read the distance, never a person.
  IOT-10 is the implemented half: the server shortens a hold only from a fresh,
  empty, approach-free reading, and otherwise keeps the full hold.
* There is one narrow exception to the occupancy rule, and it is the server
  that applies it, not the board. A bag left on the desk reads as occupied for
  as long as it is there, and a desk that cannot call anybody is a desk that
  has stopped working. So an object that has sat still for
  `MYTURN_OBSTRUCTION_SECONDS` with no approach seen near it in that whole
  window is treated as an obstruction and does not block the desk. A visitor
  who walked up and then stood still brought an approach with them, so they
  are never written off as a bag, and the hold rule is not relaxed at all.
  The desk is told when this happens: the queue payload carries `obstruction`
  and `obstruction_seconds`, and the board panel says that calling is not
  blocked and for how long the object has been still. A rule that silently
  overrides a red light is a rule nobody can check.
* IOT-11 matters because the board is the one component that cannot be restarted
  by refreshing a page: a Wi-Fi drop should lose readings, not the service.
* IOT-05 and IOT-15 are built in software: the board applies the colour and
  reports which one it applied, and the report was checked against a live call
  (the board reported `blue` once a number was called). The four LEDs are a
  wiring matter and are still to be fitted - `firmware/myturn_desk/WIRING.md`
  carries the pin list and says which of them are waiting for their resistors.

## 6. Wall display (DIS)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| DIS-01 | Now serving, large | Built | - |
| DIS-02 | Waiting count and desk state | Built | - |
| DIS-03 | Measured waiting estimate | Built | - |
| DIS-04 | Live over the event stream, with a polling fallback | Built | - |
| DIS-05 | The next three or four numbers | Designed | M1 |
| DIS-06 | Spoken announcement of a called number | Designed | M1 |
| DIS-07 | Notice ticker written by an administrator | Designed | M1 |
| DIS-08 | Rotating language for the headline | Designed | M2 |
| DIS-09 | High-contrast and large-print mode | Designed | M2 |

* DIS-06 is a genuine accessibility win at no hardware cost: the browser's speech
  synthesis already sits on whatever device drives the television, and it removes
  the dependency on a visitor reading the screen from across a noisy hall.

## 7. Communication (COM)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| COM-01 | Invitation link | Built | - |
| COM-02 | Password reset link | Built | - |
| COM-03 | Email delivery through a mail provider | Designed | M2 |
| COM-04 | SMS reminder of a turn | Designed | M3 |
| COM-05 | Browser notification for "your turn" | Designed | M2 |
| COM-06 | Outbound webhook for tickets and desk events | Designed | M3 |

* COM-01 and COM-02 are held in the response and the log while `MYTURN_DEV_TOKENS`
  is on, because the prototype has no mail server. That switch is a development
  affordance; COM-03 replaces it with a real delivery path.

## 8. Analytics (ANL)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| ANL-01 | Measured average service time with its sample count | Built | - |
| ANL-02 | Tickets served per day | Built | - |
| ANL-03 | Service-time distribution, not only the mean | Built | - |
| ANL-04 | Busiest hours of the day | Built | - |
| ANL-05 | No-show rate | Built | - |
| ANL-06 | Work done per staff account | Designed | M2 |
| ANL-07 | Alert when service times jump | Designed | M2 |
| ANL-08 | How occupancy relates to service time | Designed | M2 |
| ANL-09 | Forecast of the rest of the day | Designed | M3 |

* ANL-01 is deliberately modest: a mean over at most 20 recent served tickets,
  withheld below three samples. ANL-03 is what makes that mean honest, because a
  queue that is 40 seconds for most visitors and 8 minutes for one is not
  described by its average.
* ANL-08 is the one analysis only this project can do: it joins the sensor's
  measurements to the service durations, so the report can say whether the desk
  really takes longer when the counter is busy. That is a defensible use of the
  IoT data that never looks at a person.
* The Queue analytics page sets the desks side by side in one sheet
  (`GET /api/analytics/desks`): a row per counter with its served and no-show
  counts for the day, the queue of the service it shares, its recent measured
  service time with the sample count, the hours in which it did work and when it
  last served. It sorts by tickets served but computes no score, and waiting is
  the service's number, so the same figure can appear at two counters.

## 9. Accessibility and language (ACC)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| ACC-01 | Every control reachable by keyboard | Built | - |
| ACC-02 | Visible focus on every control | Partial | M1 |
| ACC-03 | Status changes announced to a screen reader | Built | - |
| ACC-04 | Status never carried by colour alone | Built | - |
| ACC-05 | Loading skeletons, empty states and error states | Built | - |
| ACC-06 | Mobile-first ticket flow, one column, large numbers | Built | - |
| ACC-07 | Honour a reduced-motion preference | Partial | M1 |
| ACC-08 | Kinyarwanda and French across the visitor pages | Designed | M2 |
| ACC-09 | Contrast audit at the WCAG AA threshold | Designed | M1 |

* ACC-02 and ACC-07 are honest partials: the pages rely on the browser's own
  focus ring, and only the scroll-reveal animation consults `useReducedMotion()`.
* ACC-04 is satisfied by wording - Waiting, Called, Served - not by the colour of
  a badge, which matters on a cheap screen in daylight.

## 10. Security and privacy (SEC)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| SEC-01 | Password hashing | Built | - |
| SEC-02 | HTTP-only, SameSite session cookie | Built | - |
| SEC-03 | CSRF double-submit token on authenticated writes | Built | - |
| SEC-04 | Rate limiting on sign-in, registration, reset and ticketing | Built | - |
| SEC-05 | Identical answers whether or not an address exists | Built | - |
| SEC-06 | Accounts only by invitation | Built | - |
| SEC-07 | Roles enforced on the server, not in the page | Built | - |
| SEC-08 | Anonymous tickets: no name, phone or email | Built | - |
| SEC-09 | Only token digests stored for invitations and resets | Built | - |
| SEC-10 | Audit log of privileged actions | Partial | M1 |
| SEC-11 | Account lockout after repeated failures | Designed | M1 |
| SEC-12 | Session lifetime and idle expiry | Partial | M1 |
| SEC-13 | Two-factor sign-in for administrators | Designed | M2 |
| SEC-14 | Security headers and a content security policy | Designed | M1 |
| SEC-15 | Data retention and purge | Designed | M2 |
| SEC-16 | TLS at the deployment boundary | Designed | M3 |

* SEC-10 is Partial because the evidence is recorded but not readable: the events
  and the settings history are in the database, with no view and no export.
* SEC-12 sets a 12-hour lifetime on the session; an idle timeout would be the
  other half, which is why it is not marked Built.

## 11. Operations (OPS)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| OPS-01 | Health endpoint | Built | - |
| OPS-02 | Seed script that creates the database and the device key | Built | - |
| OPS-03 | Reset script that clears the queue but not the accounts | Built | - |
| OPS-04 | One-command development launcher | Built | - |
| OPS-05 | Schema applied automatically on every start | Built | - |
| OPS-06 | API test suite (234 checks) | Built | - |
| OPS-07 | Browser test suite (71 checks) | Built | - |
| OPS-08 | Report figure capture | Built | - |
| OPS-09 | The single-worker limit is documented, not discovered | Built | - |
| OPS-10 | Backup and restore | Designed | M2 |
| OPS-11 | Structured logs with rotation | Designed | M2 |
| OPS-12 | Run as a service on the server | Designed | M3 |
| OPS-13 | Reverse proxy with TLS in front of both apps | Designed | M3 |
| OPS-14 | Continuous integration running both suites | Designed | M2 |

* OPS-07 lives outside the repository, in the temporary folder, and is therefore
  the most fragile part of the suite. Moving it into the repository is part of
  OPS-14.
* OPS-09 is a real constraint rather than a caveat: the event stream and the rate
  limiter both keep state in the process, so the API must run as one worker.

## 12. Integrations and extension points (EXT)

| ID | Feature | Status | Milestone |
|---|---|---|---|
| EXT-01 | Public API reference generated from the routes | Designed | M2 |
| EXT-02 | Outbound webhook when a ticket is called or closed | Designed | M3 |
| EXT-03 | SMS gateway for appointment reminders | Designed | M3 |
| EXT-04 | Sign in with the institution's existing accounts | Designed | M3 |
| EXT-05 | Printable door poster with the QR code and the short link | Designed | M1 |

---

## What is deliberately not a feature

These are decisions, not omissions, and the report should say so.

* **No visitor account.** A ticket is anonymous, so there is no profile to create,
  leak or forget.
* **No camera and no face, voice or gait recognition.** The board measures
  distance; it never establishes who is standing there.
* **No automatic priority.** Priority is only ever self-declared, so the system
  never decides that one person matters more than another.
* **No queuing across several buildings by default.** One office may run several
  services and several desks, but the building is still the boundary: there is no
  queue that spans two sites.
* **No estimate below three served tickets.** An invented number is worse than the
  words "Not available".
* **No guessed waiting time from the sensor.** The sensor reports whether someone
  is at the counter; it does not report how long a service takes.
