# Innovation and design

The design behind the parts of MyTurn that are not just screens: the queue rules,
the estimate, and the two places where the IoT board earns its place in the
system rather than sitting beside it. Written so each piece can be implemented and
then tested, and so the report can describe them without inventing anything.

Every "Built" claim here matches the code: `api/routes/visitor.py`,
`api/routes/staff.py`, `api/routes/public.py`, `api/queue_rules.py`,
`api/schema.sql`, `web/src/components/AdminSettings.tsx` and
`firmware/myturn_desk/myturn_desk.ino`.

---

## 1. The queue state machine

A ticket is a row in `tickets` with one of five statuses. Everything the desk
does is one transition, and every transition is also written to `ticket_events`.

```
                created
                   |
                   v
              +---------+   called    +--------+   completed   +-----------+
              | waiting | ----------> | called | ------------> | completed |
              +---------+             +--------+               +-----------+
                   ^                       |  skip             +-----------+
                   |                       +-------------->    |  skipped  |
                   |                       |  cancel           +-----------+
                   |                       +-------------->    | cancelled |
                   |                       |                   +-----------+
                   +-----------------------+
                     requeued: hold expired,
                     back of the queue,
                     with a fresh number
```

| From | Event | To | Trigger | Guard |
|---|---|---|---|---|
| - | `created` | waiting | A visitor takes a ticket | Rate limit not exceeded |
| waiting | `called` | called | Call next | No ticket is being called, or the hold has expired |
| called | `requeued` | waiting | The hold expired | Numbered again from the counter |
| called | `completed` | completed | Served | Not already terminal |
| called | `skipped` | skipped | No-show | Not already terminal |
| called | `cancelled` | cancelled | Cancelled | Not already terminal |

**Invariants.** These are the properties the report can claim and the tests check.

1. At most one ticket is `called` at any moment. Enforced by the database itself:
   `create unique index idx_tickets_one_called on tickets (status) where status = 'called'`.
2. A ticket number is issued once and never reused.
3. A requeued ticket takes a **new, higher** number, so "first come, first served
   by number" stays true after a requeue - which is what makes `ahead = count of
   waiting tickets with a lower number` correct.
4. Every transition writes a `ticket_events` row with its actor (`system`, an
   account email, or the shared session name).
5. A terminal ticket cannot move again; a second attempt is refused with 409.
6. Numbering happens server-side inside `begin immediate`, so two visitors can
   never receive the same number.

The one transition that is missing and should exist is the visitor's own:

* **VIS-22 - Give up your place.** A visitor who leaves should be able to cancel
  their own ticket with their token, so the desk does not call a number that has
  already gone home. `POST /api/tickets/<token>/cancel`, allowed only from
  `waiting`, rate-limited, and refused once the ticket is `called` (at that point
  the desk is calling and the no-show rule takes over). It turns a guessed
  no-show into a fact, which is exactly the kind of honesty this project is
  graded on.

## 2. The hold rule, as built

`MYTURN_HOLD_SECONDS` (default 60) is the promise made to a called visitor: their
number is theirs for a minute. `call-next` enforces it.

```
current = the ticket that is 'called'

if current exists and (now - current.called_at) < HOLD_SECONDS:
    refuse with 409 and hold_remaining      # the desk is still calling this one
if current exists:
    give it a fresh number and put it back at the back, event = 'requeued'
call the lowest waiting number, event = 'called'
```

The whole thing runs inside `begin immediate`, so two people pressing *Call next*
at the same moment cannot both win. The 409 is not an error for the user to
puzzle over: the dashboard shows the remaining seconds.

## 3. Innovation: the board ends an unanswered call early, as built

**The idea.** The hold time is a fixed guess. But the board already knows
something the server does not: whether anybody is standing at the counter. If a
number has been called, nobody is at the counter, and the visitor's approach
sensor has been quiet, then calling it again in 60 seconds is 60 seconds of the
whole queue standing still to prove what the sensor already said.

**The rule.** Shorten the hold to `MIN_CALL_SECONDS` (proposed 25) when, and only
when, the board is healthy and says the counter has been empty the whole time.

```
full      = MYTURN_HOLD_SECONDS            (60)
short     = MYTURN_MIN_CALL_SECONDS        (25)

def hold_limit(called):
    if the board is not fresh:                 # last_seen older than DEVICE_ONLINE_SECONDS
        return full                            # no evidence, so never shorten a turn
    if now - called.called_at < MIN_GRACE:     # 10 s: the visitor is still walking
        return full
    if any reading said occupied since the call:
        return full                            # somebody is at the counter, give them time
    if any reading said approaching since the call:
        return full                            # they are on their way
    return short
```

**Why it is safe.** The failure modes all fall back to the plain rule:

| Situation | What happens |
|---|---|
| Board offline, or no reports | Full hold. Absence of data is never treated as absence of a person |
| Sensor reads occupied | Full hold. Somebody is at the counter |
| PIR sees an approach | Full hold. They are walking up |
| Just called | Full hold until `MIN_GRACE` passes |
| Board healthy, counter empty, no approach, past the grace | Short hold |

**Where it runs, as built.** On the server, not on the board, in
`api/queue_rules.py`. `hold_limit()` returns `(seconds, shortened, reason)`;
`staff.queue` shows the effective hold and the reason. `sweep_queue(conn)` is
called at the top of the staff queue, the public state (which the event stream
also uses) and `call-next` itself, so the queue recovers even if nobody presses
anything. The board keeps its single job: it measures and reports.

```
def sweep_queue(conn):
    called = the ticket that is 'called'
    if called is None:
        return
    if (now - called.called_at) < hold_limit(called):
        return
    give it a fresh number, put it back at the back          # event 'requeued'
    write the reason in ticket_events.detail:
        "counter empty; hold ended early" or "hold time ended"
```

The requeue is re-checked inside a `begin immediate` transaction, because two
readers can sweep at the same moment; the loser finds no called ticket and
leaves quietly. The new counter value, the renumbered ticket and the event land
together.

**How it is tested, as built.** All of it runs in `smoke_test.py` without
hardware, by posting synthetic `/api/device/readings` with the device key and
back-dating `called_at`:

1. Fresh board, occupied reading, past the grace -> full hold; the queue reports
   `hold_shortened = false` and "the counter is occupied".
2. Fresh board, empty reading, past the grace but under the floor -> effective
   hold 25 s; the queue read alone (no button) requeues it, with a higher number
   and a detail of "counter empty".
3. Same, but the board has not reported for `DEVICE_ONLINE_SECONDS` -> full hold;
   "the board is not reporting".
4. Called two seconds ago -> full hold during the grace, "the visitor is still
   walking up".
5. `call-next` still calls the next number after the early requeue, and the
   reissued row carries the new number and a waiting status.

**What the report can measure.** "With the desk empty, an unanswered call was
recovered in 25 seconds instead of 60 in N of M trials." That is a real number
the team can run, and it is the clearest evidence that the IoT part improves the
queue rather than decorating it.

**The limitation to write down honestly.** Occupancy says *somebody* is at the
counter, not *the right somebody*. A bystander keeps the call alive longer. The
error goes in the safe direction: the visitor does not lose their turn.

## 4. The waiting estimate

### What is built

`service_time(conn)` in `routes/visitor.py`:

* the last 20 `completed` tickets, most recent first;
* duration = `closed_at - called_at`;
* kept when `0 <= duration <= 4 hours` (a zero-second service is a real service -
  excluding it made the demo desk's average absurdly high);
* below `MYTURN_ETA_MIN_SAMPLES` (3) it returns `(None, n)`;
* otherwise the plain mean, rounded, plus the sample count.

The page shows "about N minutes" from `ahead * mean`, and **"Not available"**
below the gate. Both the wall display and the ticket page read the same two
fields from `/api/public/state`, so they can never disagree.

### What it gets wrong

1. **One long visit drags it.** A mean over 20 rows is sensitive to a single
   20-minute case.
2. **It ignores what is happening now.** A desk that has just got faster is still
   reported at yesterday's speed until 20 old rows fall out.
3. **It ignores the service in progress.** If nobody is ahead of you, you still
   have to wait for the visitor at the counter, but the estimate says zero.
4. **It has no uncertainty.** Three samples and twenty samples are presented
   identically.

### The upgrade

**(a) Weight the recent ones.** Replace the plain mean with an exponential moving
average over the durations in chronological order, with the standard smoothing
constant:

```
alpha = max(0.2, 2 / (n + 1))
ema   = durations[0]
for d in durations[1:]:
    ema = alpha * d + (1 - alpha) * ema
```

With few samples `alpha` is large and the estimate tracks what just happened;
as `n` grows, `alpha` falls towards 0.2 and the estimate steadies. This is one
line of arithmetic, easy to defend, and easy to plot.

**(b) Count the service in progress.**

```
remaining = 0
if a ticket is called:
    remaining = max(0, ema - (now - called.called_at))
estimate = remaining + ahead * ema
```

**(c) Say how sure it is.** With `n >= 5`, also compute the interquartile range.
Show a range instead of a single figure when it is genuinely wide
(`q3 - q1 > 30 s`), and never a range below the sample gate:

| Samples | What the page says |
|---|---|
| 0-2 | Not available |
| 3-4 | about N minutes |
| 5+ | about N minutes, or N1-N2 minutes when the spread is wide |

**(d) Keep the honest floor.** Never a negative number, never zero while a queue
exists, and "Not available" rather than a guess.

**Tests.** Zero-second services count; a 4-hour ticket is excluded; below the gate
the payload carries `null` and the page has no numeral; the estimate moves within
three services of a change; the display and the ticket page show the same value.

**The limitation.** The estimate assumes a steady rate and knows nothing about
breaks, a difficult case, or a second person arriving. That is why it is
"about", and why the report says *guide*, never *promise*.

## 5. Innovation: undo, as built

A mis-tapped **No-show** used to be permanent, and it cost a visitor their place.
The console now takes it back:

* **Undo** (`POST /api/staff/tickets/<id>/undo`) re-writes the status the ticket
  had before the decision, writes an `undone` event, and keeps the original event
  in the log - the log is evidence, not state. Deleting the row would hide the
  mistake rather than record it.
* Window of `UNDO_SECONDS` (10 s), one level deep, and only for terminal tickets
  (`completed`, `skipped`, `cancelled`) - not for `call-next`, which moves the
  numbering.
* Refused as soon as another ticket is `called`, because by then the visitor has
  been overtaken. The single-`called` unique index is what makes that refusal
  cheap to enforce: put the number back and the index would have two rows.
* The desk page offers it for the window's duration and then stops. The server is
  the authority; the countdown is only a display.

The tally counts the **latest** event per ticket, so a no-show that was taken back
stops counting for the shift while the row that recorded it stays in the history.

## 6. Innovation: make the room hear it

Two low-cost, high-visibility additions to the display:

* **Spoken number (DIS-06).** The browser's own speech synthesis announces the
  called number, in the page's language. It removes the dependency on a visitor
  reading a screen across a noisy hall, and it costs no hardware.
* **Notice ticker (DIS-07).** An administrator writes one line - "the card system
  is down until 10:00" - and it appears on every display through the same event
  stream. This is the cheapest way to stop the desk answering the same question
  fifty times a day.

Both ride the stream that already exists; neither needs a new table beyond a
one-row `notices` record.

## 7. Priority without classifying anybody

A queue that cannot give a wheelchair user a fair turn is not usable in a
Rwandan public office. The design that fits this project:

* The visitor **declares** priority on the ticket form (a checkbox, not a guess).
* The ticket is issued with `priority = 1` and `ticket_no` unchanged.
* Ordering becomes `order by priority desc, ticket_no` for the call.
* The number is still a single sequence, so a priority ticket cannot be
  identified from its number alone, and the log records nothing about the person.
* A cap (for example 1 in 4 calls) stops the lane from starving the normal queue,
  and the desk can always see why a number was called early.

The system never decides who deserves priority. It only honours what the visitor
said, which keeps it on the right side of the project's own rule: nothing here
identifies or classifies a person.

## 8. The sensor rules, exactly as the board runs them

`firmware/myturn_desk/myturn_desk.ino`. Reproduce these in the report instead of
paraphrasing them; they are the numbers the hardware was actually flashed with.

| Constant | Value | Meaning |
|---|---|---|
| `OCCUPIED_CM` | 100 | Nearer than this counts as somebody at the counter |
| `SAMPLES` | 5 | Readings kept for the median filter (a burst of noise cannot flip the state) |
| `HOLD_MS` | 2000 | A change must last 2 s before it is accepted (debounce) |
| `INTERVAL_MS` | 5000 | Normal reporting interval |
| `FAST_MS` | 1000 | Reporting interval while an approach is detected |
| `APPROACH_MS` | 10000 | An approach that never becomes occupancy is a walk-past |
| `PIR_WARMUP_MS` | 60000 | The PIR needs about a minute to settle after power-up |
| `TRIG_PIN` / `ECHO_PIN` | D5 / D21 | HC-SR04 |
| `PIR_PIN` | D19 | HC-SR501 |
| `RED_PIN` / `GREEN_PIN` / `YELLOW_PIN` / `BLUE_PIN` | D25 / D26 / D27 / D33 | Four LEDs: red, green, yellow, blue |
| `BUZZER_PIN` | D32 | Buzzer: one beep for a call, two for a recall |
| `BUZZER_PASSIVE` | 0 | 0 = active buzzer module; 1 = passive buzzer driven with `tone()` |
| `BEEP_MAX_AGE_S` | 20 | A call older than this is not announced after a reconnect |

The D-labels are the board's silkscreen; on the ESP32 the D-number is the GPIO
number, so D5 and GPIO 5 are the same pin.

The loop, in order:

1. Measure, and put the reading into the five-slot median window.
2. `occupied = median < 100 cm`. **The ultrasonic sensor has the only vote.**
3. Accept a change only after it has lasted 2 seconds.
4. `approach = PIR high` (once past the warm-up), cleared when it becomes
   occupancy or after 10 seconds.
5. Report every 1 s while approaching, otherwise every 5 s, with three attempts
   per send.
6. Ask for the desk setting, then set the light: **green** when the desk is open
   and the counter is free, **red** when open and occupied, **yellow** when the
   desk is paused or closed (and yellow from power-up, so a board that has never
   reached the server does not claim the desk is open), and **blue** while a
   visitor is being called. Blue is reserved for the call, so a closed desk can
   never be mistaken for a number waiting to be collected. The same reply carries
   the latest call event, so a new number sounds once and a recall sounds twice;
   the first reply after boot is a silent baseline, and an event older than 20
   seconds is ignored.

The distance reported is the median, not the last raw reading, and the LED state
in the report is what the board actually applied - so the dashboard compares the
server's intent with the hardware's behaviour rather than trusting either.

### The static obstruction

The board never decides that something at the counter is a bag. It reports the
distance and the two flags, and the server reads the history.

A bag left on the desk reads as occupied for as long as it is there, and a desk
that cannot call anybody is a desk that has stopped working. So the server
treats an object as an obstruction when **both** of these hold over the last
`MYTURN_OBSTRUCTION_SECONDS` (300 s by default):

- the distance has not moved - the whole spread is within
  `MYTURN_OBSTRUCTION_TOLERANCE_CM` (15 cm), so it has been sitting there;
- no approach was reported anywhere in that window - a visitor who came to the
  counter brought an approach with them, and is never written off as a bag.

Anything else - a faulty sensor, a missing reading, an object that only arrived
during the window, or an approach somewhere in it - means "not enough to say",
and the counter stays occupied. The rule relaxes one thing only: whether the
desk may call the next number. The hold is not relaxed at all, because there
an occupied counter is evidence *for* keeping the number, and shortening a
hold is the generous act.

The board still has the only vote on occupancy. The server is reading two
measurements the board made and asking a different question about them: not
"is something there" but "has this been here, untouched, with nobody near it".

### IOT-09 - tell a broken sensor from an empty room

The board currently reports whatever it measured, including a reading that is
obviously broken. A `-1` (no echo) or a distance pinned at the maximum means the
sensor is unhappy, not that the room is empty. Proposed: the board counts
consecutive no-echo results and reports `sensor_fault: true`, and the dashboard
shows "the distance sensor is not answering" instead of "counter free". This
matters directly for section 3: the occupancy-assisted requeue must not act on a
sensor that is quietly failing, which is why it already requires a fresh reading.

## 9. Innovation: join the sensor data to the service times

The one analysis this project can do that a queue app cannot. `device_reports`
records occupancy; `tickets` records how long each service took. Joining them by
time answers a question the report can actually pose:

> Does the desk take longer when the counter is busy?

```
for each completed ticket:
    busy_share = fraction of device_reports.reported_at within
                 [called_at, closed_at] that were occupied
group by busy_share bucket (< 25 %, 25-75 %, > 75 %)
compare median service duration per bucket
```

If the medians differ, the report has something real to say about the desk, drawn
from the project's own hardware, that never involves looking at a person. If they
do not differ, that is a finding too, and it is worth more than a fabricated one.

## 10. What the design would add to the schema

The prototype's schema is enough for everything marked Built. The designed work
needs, roughly:

| Addition | For | Why it is additive |
|---|---|---|
| `tickets.priority integer default 0` | QUE-12 | One column, defaulted, so the existing rows and queries keep working |
| `tickets.desk text default 'desk-1'` | QUE-13, QUE-14 | Matches `SERVICE_ID`; the unique index would become `(status, desk)` |
| `ticks(sensor_fault integer default 0)` or a column on `device_reports` | IOT-09 | Reporting only; nothing reads a person |
| `notices(message text, created_at text, created_by text, until text)` | DIS-07 | One new table, no change to anything else |
| `services(letter, name, description, target_seconds, is_active, updated_at, updated_by)` | ADM-14 | **Built**: one row per service, the letter is the prefix of its ticket numbers |
| `desks(name, service_id, is_active)` | QUE-14 | **Built**: one row per counter, each counter serves exactly one service |
| `ticket_events.detail text` | QUE-16 | **Built**: one guarded `alter table` in `db.apply_schema()`; records why a requeue happened |
| `tickets.day text` (or a `queue_days` table) | QUE-18 | Needed for a daily number reset; today the counter only climbs |
| `shifts` (account, opened_at, closed_at, served, no_shows) | DSK-18, ANL-06 | Derived from `ticket_events` at close time |

Because `db.apply_schema()` runs `schema.sql` on every start and every statement
is `create ... if not exists`, adding a table is a two-line change with no
migration step. Adding a **column** to an existing table is not: SQLite will not
add it from `create table if not exists`, so `ticket_events.detail` needed one
explicit `alter table ... add column` guarded by a `pragma table_info` check.

The move from one desk to one office was the first real migration, because it
was the first change that could not be additive. The old `tickets` table made
`ticket_no` unique across the whole office; a service that issues A001 and
another that issues B001 need the number to be unique **per service**, and
SQLite cannot drop a unique constraint. The table is therefore rebuilt once, in
`db.py`, inside a transaction: the rows are copied with their ids and tokens
unchanged, the service is filled in from the old `desk_profile` row, and the
`ticket_events` rows keep pointing at the same tickets. `desk_settings` and
`devices` each gained a `desk_id` column, guarded the same way, and the one
board of the prototype was attached to Desk 1. The old `desk_profile` table is
read once, for service A, and is then left alone.

After the move, the indexes are the same kind of guard as before, only narrower:
one called ticket per **desk** rather than one in the whole office, so two desks
may hold two calls of the same service at once.

## 11. Milestones

**M1 - the small things that make it trustworthy**

Items marked **(built)** are implemented and exercised by the suites; the rest are
still design.

1. ADM-06 promote/demote an administrator, with a last-administrator guard. **(built)**
2. ADM-07 change your own password. **(built)**
3. ADM-08 revoke or resend an invitation. **(built)**
4. VIS-22 give up your place.
5. QUE-09 / DSK-11 undo the last desk action. **(built)**
6. DSK-10 serving timer, DSK-13 keyboard shortcuts, DSK-12 recall. **(built)**
7. DSK-14 alert when the queue grows, DSK-15 my tally, DSK-17 walk-in. **(built)**
8. IOT-09 sensor fault flag, IOT-13 heartbeat with firmware version.
9. QUE-16 occupancy-assisted requeue. **(built)**
10. DIS-05 next-up list, DIS-06 spoken number, DIS-07 notice ticker.
11. ADM-10 audit viewer, ADM-11 statistics, ADM-12 CSV export, ADM-15 notice. **(ADM-10 to ADM-12 built; ADM-14 desk settings built)**
12. ANL-02 to ANL-05: served per day, distribution, busiest hours, no-show rate. **(built inside ADM-11)**
13. ACC-02 branded focus ring, ACC-07 reduced motion everywhere, ACC-09 contrast audit.
14. SEC-11 lockout, SEC-14 security headers, VIS-10 duplicate marker.
15. EXT-05 printable door poster.

**M2 - the things that change the model**

Multi-desk queues and transfers, appointments, remote tickets with
notifications, a real mail path, two-factor for administrators, retention with a
purge job, backup and restore, continuous integration that runs both suites, and
full Kinyarwanda.

**M3 - the things that leave the building**

Run as a service behind a TLS reverse proxy, a fleet of boards with key rotation
and pairing, SMS, webhooks, and sign-in through the institution's existing
accounts.

## 12. Where this earns the marks

| Criterion | What to point at |
|---|---|
| Introduction (3) | The problem is a numbered-line desk; the contribution is a measured estimate and a sensor-assisted hold |
| Literature review (3) | Queue theory (FCFS, waiting time), embedded sensing, and how existing queue apps stop at ticketing |
| Methodology (4) | The state machine (section 1), the rules with their constants (sections 2, 8), and the tests that check them |
| Results and discussion (3) | The measured service time, the occupancy to service-time join (section 9), and the before/after of the recovery time (section 3) |
| Conclusion and references (2) | What was actually built and verified, and what the milestones leave open |

## 13. Guardrails

The lines the report must not cross, because crossing them costs more marks than
the extra feature would win:

* Do not report a feature as done unless it is in the code and the tests were run.
* Never present a designed feature as built. Everything in `Designed` is a plan.
* The sensors measure. The PIR detects an approach, the HC-SR04 owns occupancy,
  and nothing counts or identifies a person.
* The ticket number comes from the server, and the tracking URL uses an opaque
  token, never a sequential id.
* The estimate is measured and withheld below the sample gate; it is never
  guessed, and never presented as a promise.
* The occupancy-assisted requeue must never fire without a fresh reading: an
  offline board falls back to the fixed hold rather than shortening anyone's turn.
