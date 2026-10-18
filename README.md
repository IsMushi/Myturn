# MyTurn

Queue management and service desk status for one service desk.

A visitor scans the QR code at the door, takes a numbered ticket and follows
their turn on their own phone. The person at the desk calls the next ticket from
a dashboard, and the ESP32 board measures whether the counter is occupied and
shows the desk state on an RGB light. No names, no telephone numbers, no camera.

*Know your turn.*

## What is in this repository

| Folder | What it holds |
|---|---|
| `backend/` | The Flask API, the SQLite schema and the tests |
| `frontend/` | The Next.js application: visitor page, public screen, staff dashboard |
| `firmware/` | The ESP32 sketch for the board at the desk |

## Requirements

* Python 3.11 or newer
* Node.js 20 or newer
* An ESP32 DevKitC, one HC-SR04, one HC-SR501 and one RGB LED (only for the hardware demonstration)

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env          # then edit the secret and the password
.\.venv\Scripts\python.exe seed.py   # creates the database and prints the device key
.\.venv\Scripts\python.exe app.py    # serves http://127.0.0.1:5000
```

`seed.py` prints the device key once and writes it to `data/device_key.txt`.
Copy that key into the firmware. The database itself is a single file,
`backend/data/myturn.db`, and it is created on the first run.

Check the whole API while the server is up:

```powershell
.\.venv\Scripts\python.exe smoke_test.py
```

The test follows one real session from end to end and prints one line per check.

### Routes

| Route | Called by | What it does |
|---|---|---|
| `POST /api/tickets` | Visitor page | Issues the next number with a private token |
| `GET /api/tickets/<token>` | Visitor page | Number, state and how many tickets are ahead |
| `GET /api/public/state` | Public screen | Called number, desk state, waiting count |
| `POST /api/staff/login` | Staff dashboard | Checks the password and starts a session |
| `POST /api/staff/logout` | Staff dashboard | Ends the session |
| `GET /api/staff/queue` | Staff dashboard | Waiting line, desk state, current call, last report |
| `POST /api/staff/call-next` | Staff dashboard | Calls the next ticket inside one transaction |
| `POST /api/staff/tickets/<id>/action` | Staff dashboard | Completes, skips or cancels one ticket |
| `POST /api/staff/service` | Staff dashboard | Pauses, resumes or closes the desk |
| `POST /api/device/readings` | ESP32 | Stores a distance reading, occupancy, approach and the light applied |
| `GET /api/device/setting` | ESP32 | Returns the state the light should show |

Staff routes need a session cookie. Device routes need the `X-Device-Key`
header, and only the digest of that key is stored.

### Rules that live on the server

* The ticket number comes from a counter row updated inside the same
  transaction that inserts the ticket, so two visitors cannot receive the same
  number.
* Only one ticket may be called at a time. The database enforces it with a
  unique index, and the route refuses a second call.
* A called ticket that nobody answers goes back to the queue **at the back**,
  with a fresh number, after `MYTURN_HOLD_SECONDS` (60 seconds by default), so
  an absent visitor cannot block the desk.
* The sensor only measures. Every decision about a ticket or the desk state is
  made in the staff routes.

## Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local    # only if the API is not on port 5000
npm run dev                          # serves http://localhost:3000
```

| Page | Address | Who uses it |
|---|---|---|
| Visitor | `/` | The visitor, from the QR code on their phone |
| Public screen | `/screen` | A tablet or monitor in the waiting area |
| Staff dashboard | `/staff` | The person at the desk, behind a password |

Everything under `/api` is proxied to Flask by a rewrite in `next.config.ts`,
so the browser sees one origin and the session cookie works without CORS
tricks. Set `BACKEND_ORIGIN` in `.env.local` to point somewhere else.

The visitor page remembers the ticket in `localStorage`, so closing the page
does not lose the place.

## Firmware

```powershell
cd firmware\myturn_desk
Copy-Item secrets.example.h secrets.h   # fill in WiFi, API address and device key
```

Open `myturn_desk.ino` in the Arduino IDE with the ESP32 board package
installed, select **ESP32 Dev Module** and upload. Wiring is in the project
report, Section 4.3.

The board sends a reading every five seconds, every second while the PIR sensor
sees someone approaching, and drives the light: green when the desk is open and
free, red when it is open and occupied, yellow when it is paused or closed.

## Running both halves

```powershell
.\dev.ps1
```

Two windows open, one for each server.

## Demonstration order

1. Open `/screen` on the second screen and `/staff` on the desk laptop.
2. Sign in on the dashboard with the password from `backend/.env`.
3. Open `/` on a phone, take a ticket, then take two or three more from other
   browsers.
4. Press **Open** so the desk stops being paused, and watch the light turn green.
5. Put a hand in front of the sensor: the dashboard shows the approach within a
   second and the light turns red.
6. Press **Call next** and watch the visitor page change to *It is your turn*.
7. Press **Served**, then call the next ticket.
8. Leave one call unanswered: after the hold time it goes to the back of the
   queue on its own and the next ticket is called.

## Limits

* One desk, one queue. The schema keeps a device table and the desk setting as
  rows, so more desks need one desk column and one transfer rule, not a rewrite.
* Staff share one password, and the name they type is only a label on the event
  log. A real deployment needs one account per staff member.
* The development servers are HTTP. The hosted demonstration is served through
  a tunnel over HTTPS with `MYTURN_SECURE_COOKIES=1`.
