# ESP32 WebSocket communication

## Connection and workflow

The firmware now connects directly to Flask at `/ws/device`. It derives WS/WSS,
host, port and any path prefix from the existing private `API_BASE` setting.
Browsers still use the existing same-origin HTTP/SSE integration. The old HTTP
device routes remain compatible, but the updated firmware never polls them.

1. The ESP32 opens the socket and sends a JSON `hello` containing its device key.
   The key is checked against its stored digest, never sent in a URL or stored in
   the connection registry. Authentication has a five-second deadline.
2. The server sends `type: state`, `initial: true`, the assigned desk, its current
   availability and the current call event. This is a quiet baseline on boot or
   reconnect. A changed desk assignment is also treated as a baseline.
3. Committed waiting line, desk and settings changes wake the socket through the same
   broadcast used by SSE. Only changed state is pushed, plus a full state heartbeat
   every five seconds. The handler owns its own writes; staff transactions do not
   wait on a board's socket. A replacement connection supersedes the old one
   without allowing old cleanup to unregister the replacement.
4. Sensor reports use `type: reading` and a positive `sequence`. They include
   distance, occupancy, approach, applied LED and the board's chip/MAC identity.
   The server returns `type: ack` after storage; repeated sequence numbers on that
   connection are acknowledged without storing another report. Validation and
   atomic report storage are shared with the HTTP endpoint.
5. Periodic telemetry is five seconds, or one second during an approach. Occupancy,
   approach and applied-LED changes enqueue a report immediately. Reporting never
   decides ticket order, availability or who is present.

## Recovery and safety

- Wi-Fi/socket work runs on its own FreeRTOS task with fixed-size latest-value
  waiting lines. The main loop does not wait for TCP/TLS connections or acknowledgements.
- Socket reconnection backs off with jitter, up to about thirty seconds. Protocol
  heartbeat and application ping/pong detect dead connections. The firmware also
  expires desk state independently after twelve seconds without a snapshot.
- A lost connection or expired state shows yellow locally. It does not write
  "paused" into the server or change its waiting line. Fresh state restores normal lighting.
- A missing telemetry acknowledgement after four seconds reconnects the socket.
  Waiting Lines never accumulate an offline history. Measurements taken before the new
  baseline, or older than six seconds, are discarded.
- Call event IDs suppress duplicate announcements; events older than twenty seconds
  are ignored. One beep announces a call, two a recall. Buzzer timing is nonblocking.
- Revoked device keys are rechecked when state changes and on the periodic heartbeat.
  Retired desks send closed/off state. Invalid messages are bounded and refused.
- Transport activity is not sensor evidence. Old or negative/fault readings cannot
  shorten the visitor hold, even while the socket or legacy settings route is alive.
- WSS requires a private trusted-root `WS_CA_CERT` PEM and time synchronization.
  There is no insecure TLS fallback. Plain WS is for the trusted local network only.
- This remains a single-worker deployment because broadcasts and connections are
  process-local. A multi-worker rollout needs a shared event broker.

## Verified

- ESP32 Dev Module compile: ESP32 core 3.3.12, WebSockets 2.7.2, ArduinoJson 7.4.3.
  The build used 1,111,205 bytes of application flash (84%) and 48,824 bytes of
  static RAM (14%). It was compiled with the Arduino IDE's own `arduino-cli`
  (`compile --fqbn esp32:esp32:esp32`), against the local `secrets.h`; no
  credential was copied into a test artifact or changed.
- `api/.venv/Scripts/python.exe api/check_device_ws.py --smoke` (from repository
  root): 25 real WebSocket/workflow checks and all 212 existing HTTP checks passed.
  The runner creates its own Flask server, device keys, accounts and temporary
  SQLite database. It never resets or uses the live office.
- Checks cover authentication, pushed calls/recall/state, acknowledgements,
  duplicate reports, multiple desks, reconnect ownership, key revocation, invalid
  telemetry, stale/faulted sensor evidence and server-controlled requeueing.
- `python tools/check-staff-dashboard.py`: all 34 browser/workflow checks passed
  against a disposable API after the WebSocket and automatic-LED-only changes.
  Existing in-progress dashboard layout changes were preserved.
- The running API passed a read-only health probe, and its live WebSocket route
  correctly refused an invalid device key. No live device was displaced for this check.

## Still required on the physical board

The firmware has **not been flashed or hardware-tested in this session**. Upload
`firmware/myturn_desk/myturn_desk.ino` using the existing private `secrets.h` and the
libraries above, then check:

1. Serial Monitor at 115200 shows an authenticated WebSocket and telemetry ACKs.
2. Open / Pause / Close produces green (free) / yellow / off; occupancy produces red.
3. A new call sounds once and recall twice. Reconnecting does not reannounce the
   current number; subsequent new calls still announce.
4. Disconnect Wi-Fi or stop the API: yellow appears, sensor sampling continues and
   reconnection restores authoritative state without replaying old readings.
5. Confirm fresh distance/occupancy and board identity on the staff dashboard.

These are a required hardware acceptance checklist, not claimed measurements.
