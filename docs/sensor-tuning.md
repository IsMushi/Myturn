# Tuning the desk sensors

Every delay and every sensitivity in the system, where it lives, what it does,
and what happens if you change it.

The rule the whole design rests on: **the HC-SR04 alone decides occupancy, and
the HC-SR501 alone reports an approach.** The two are never mixed into one
answer, because the PIR cannot tell a person from a dog, and the ultrasonic
cannot tell a person from a bag.

---

## 1. The PIR: the two knobs on the module

The HC-SR501 has two trimmers on the back of the board. These are the
*sensitivity* and the *time delay* of the sensor, and they are set with a
screwdriver, not in software.

| Trimmer | What it sets | Which way | Notes |
|---|---|---|---|
| **Sx** | The trigger **distance** | counter-clockwise = more sensitive (further away); clockwise = less | On the common module, roughly 1 m at one end and 7 m at the other, with about 3-4 m near the middle |
| **Tx** | How long the output stays **HIGH** after motion | clockwise = longer | Roughly 0.5 s to 5 s. This is the one that matters most at a desk |

There is also a **trigger-mode jumper**: *repeatable* (the default) re-fires
the output while motion continues, and *non-repeatable* fires once and holds
until the module times out. Repeatable is what this project assumes.

### How the module and the firmware divide the work

The module holds its output HIGH for `Tx` seconds after any motion, and
re-fires it while the motion continues. The firmware then applies its own
timing on top:

```
person moves
  │
  ├─ the module's comparator fires                (its own time, tens of ms)
  ├─ the module holds the output HIGH             for Tx seconds (0.5 – 5 s)
  ├─ the firmware reads the pin as a duty cycle   3 of 10 samples in 200 ms,
  │    over a 200 ms window, so about 40 ms        PIR_SAMPLE_MS
  ├─ the approach latches                         APPROACH_MS (10 s)
  │    and is reported at the fast rate           FAST_MS (1 s)
  └─ after 10 s with nobody at the service point  the approach is written
                                                   off as a walk-past
```

**The important relationship:** `APPROACH_MS` (10 s) is *longer* than the
module's maximum `Tx` (about 5 s). So the **firmware** decides how long an
approach lasts in the system. The module's `Tx` only decides how long the raw
pin stays up, and it is what keeps the chatter out.

**One thing to know about the end of an approach.** The ten seconds are counted
from the *first* motion, and they only run out if the person stops moving. If
they keep shifting about, the module keeps re-firing its output, the pin stays
high, and the approach stays live for as long as they are moving. That is
correct - they really are still there - but it does keep the board on the
one-second report rate while they are.

### How far away it can see

The PIR has **no distance reading at all**. It is a binary signal: motion
inside its cone, or no motion. So the "sensitivity" of the PIR is entirely
the `Sx` knob, and it decides two things:

- whether somebody at the service point is detected at all;
- whether people walking across the room are detected too.

Detecting people in the room is harmless - an approach is only ever treated
as "somebody might be coming" - but it does put the board on the **one-second**
report rate instead of the five-second one, so the log scrolls faster and the
server receives more readings.

**For a desk, turn `Sx` clockwise** until the range is about 1 to 1.5 m:
close enough for the visitor at the service point, short enough that the aisle
behind does not trigger it. Mount the module **facing the service point**, not down
the room, because its field is a cone.

---

## 2. The PIR: the delays in the firmware

All of these are in `firmware/myturn_desk/config.h`. They are `constexpr`, so
changing one means editing the file, recompiling and flashing the board.

| Constant | Value | What it does | If you change it |
|---|---|---|---|
| `PIR_WARMUP_MS` | 60000 (60 s) | The module needs about a minute to settle after power-on. Until it passes, the PIR reports nothing at all | Shorter risks false triggers from the warm-up; the 60 s is the module's own requirement |
| `PIR_SAMPLE_MS` | 20 | How often the pin is sampled | The window is ten samples, so this sets how long a window is: 20 × 10 = 200 ms |
| `APPROACH_MS` | 10000 (10 s) | How long one approach is remembered before it is written off as a walk-past | Longer keeps "somebody is coming" true for longer, which also keeps the fast report rate on for longer |

**How the pin is read.** The module's output flickers when somebody is
standing at the service point, so the pin is not read as a level. It is read as a
**duty cycle** over a 200 ms window: the pin is sampled every 20 ms, and three
of the last ten samples being HIGH is taken as motion.

That matters more than it looks. A filter that waits for the pin to *hold*
one value freezes on whichever level it happened to catch, and a frozen LOW is
a PIR that has stopped working rather than one that is slower. The duty cycle
cannot freeze: a flicker reads as motion, which is what a flicker at a service point
is, and the answer comes in about 40 ms.

A single electrical glitch is still rejected, and an idle sensor produces no
readings at all.

## 3. The PIR: the delay in the API

| Setting | Where | Value | What it does |
|---|---|---|---|
| `MYTURN_APPROACH_WINDOW_SECONDS` | `api/.env` | 10 | How long an approach report still counts as "movement at the service point now" on the dashboard. The stored flag is old news after this. It says movement, not a person: the PIR cannot tell a visitor from anyone else who walks past |
| `MYTURN_HOLD_SECONDS` | `api/.env` | 60 | How long a called number keeps its place. An approach seen since the call keeps the **full** hold, never the shortened one |
| `MYTURN_MIN_CALL_SECONDS` | `api/config.py` | 25 | The floor the hold may be shortened to. Only reached when the service point is verifiably empty **and** no approach was seen |

---

## 4. The report rate, which the PIR controls

| Constant | Where | Value | When |
|---|---|---|---|
| `INTERVAL_MS` | `config.h` | 5000 | Normal reporting: every five seconds |
| `FAST_MS` | `config.h` | 1000 | While an approach is live: every second |

The rate is chosen by `Pir::near()`, so a PIR that chatters keeps the board
on the fast rate. That is what filled the log with a reading every 25 ms.

---

## 5. Symptoms, causes and fixes

| What you see | Cause | Fix |
|---|---|---|
| **Motion is not detected at all for the first minute after a flash** | The PIR is in its warm-up. `PIR_WARMUP_MS` is 60 s, and until it passes the module reports nothing, so the board reports nothing | Wait a minute. The log says `pir: warmup` while it is happening, and `pir: LOW` or `pir: HIGH` afterwards |
| **Motion is not detected, long after the warm-up** | `Sx` is not sensitive enough, or the module faces away from the service point | Turn `Sx` counter-clockwise a little at a time. Check the module faces the service point and not down the room |
| **Motion is detected but feels late** | The module's own `Tx` is not the cause - the firmware answers in about 40 ms - so the delay is in the module or the wiring | Check the module is powered from `VIN` and not `3V3`, and that the output reaches GPIO 19 |
| **The approach stays "on" long after the person has gone** | `APPROACH_MS` is 10 s, and the ten seconds only run out if the person stops moving | Lower `APPROACH_MS` if the waiting line should recover faster |
| A reading every 25 ms, `pir` alternating HIGH and LOW | The PIR output is chattering and the raw pin was believed as it arrived | **Turn `Tx` clockwise to 3-5 s** - the module then holds the output high and the chatter cannot get through |
| `pir: HIGH` that never comes back to `LOW` | The pin is stuck high, so the approach never clears and the board stays on the one-second rate | Turn `Tx` up. If it persists, the output is being held high by the module, not by noise |
| The PIR fires for people walking past | `Sx` is too sensitive | Turn `Sx` clockwise until the range is about 1-1.5 m, and face the module at the service point |
| The approach is reported, but the waiting line still moves on | The approach only ever *keeps* the full hold; it never calls anyone | This is by design. The approach is evidence, not authority |

---

## 6. The ultrasonic, for comparison

The occupancy side, which the PIR has no part in.

| Constant | Where | Value | What it does |
|---|---|---|---|
| `OCCUPIED_CM` | `config.h` | 100.0 | The median distance below which the service point is occupied. A person at the service point is about 40-70 cm |
| `MIN_CM` | `config.h` | 12.0 | Below this the module is ringing, not a person. Those readings are ignored |
| `MAX_CM` | `config.h` | 400.0 | Beyond this the module's own timeout pulse means "nothing in range" |
| `MEASURE_GAP_MS` | `config.h` | 250 | How often a measurement is taken |
| `SAMPLES` / `MIN_SAMPLES` | `config.h` | 5 / 3 | The median window, and how many readings are needed before the median is trusted |
| `HOLD_MS` | `config.h` | 2000 | A change of occupancy must last this long before it is believed |

**How long that takes, end to end.** From an object arriving at the service point to
the LED turning red:

| Step | Time |
|---|---|
| Wait for the next measurement | up to 250 ms (`MEASURE_GAP_MS`) |
| The median needs three samples before it can turn over | 2 more measurements, 500 ms |
| The change must hold before it is believed | 2000 ms (`HOLD_MS`) |
| One more measurement interval, because the hold test is strictly greater than | 250 ms |
| **Total** | **about 2.75 s** |

It is the same **2.75 s** in reverse: an object that leaves is not released
until it has been gone that long, so a person stepping back from the service point
for a moment does not flicker the light.

The median is what makes this slow on purpose: a burst of noise cannot flip
the state, because one wrong reading in five does not move the middle of the
window. A single bad reading inside an occupied window leaves the occupancy
exactly where it was.

---

## 7. Changing a firmware value

```powershell
# 1. edit firmware\myturn_desk\config.h
# 2. compile
& "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" compile --fqbn esp32:esp32:esp32 firmware\myturn_desk
# 3. flash from the Arduino IDE, or:
& "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" upload --fqbn esp32:esp32:esp32 --port <COM> firmware\myturn_desk
```

The server-side values are in `api/.env` and need the API restarted. They are
read once at start-up.

---

## 8. What the PIR must never be asked to do

- **It must never decide occupancy.** It fires for animals, for people
  crossing the room, and for a person who has already been served. Occupancy
  is the ultrasonic's, and it survives a visitor standing still.
- **It must never count or identify people.** There is one bit: motion, or no
  motion. Nothing in this system turns that into a person.
