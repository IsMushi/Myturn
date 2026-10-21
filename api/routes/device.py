"""Device routes: the traffic that comes from the ESP32 board.

Both routes are authenticated with a device key. The reading carried occupancy,
the approach flag and the LED state the board applied, so the dashboard can be
compared with what the hardware actually did.
"""
import math

from flask import Blueprint, g, jsonify, request

from broadcast import signal
from db import get_db
from routes.visitor import desk_state
from security import device_required
from util import now, seconds_since

bp = Blueprint("device", __name__)

# Keep the report table small: each board keeps its most recent readings.
KEEP_REPORTS_PER_DEVICE = 2000


def touch(conn, device_id):
    conn.execute("update devices set last_seen = ? where device_id = ?", (now(), device_id))


def clean_identifier(value, limit):
    """A short hardware identifier the board sends, or None.

    The board reports its chip id and MAC on every reading. They are only ever
    shown next to the device, never trusted for anything, so this trims them and
    drops anything that is not a plain hex string.
    """
    text = str(value or "").strip().lower()
    if not text or len(text) > limit:
        return None
    return text if all(character in "0123456789abcdef:.-" for character in text) else None


@bp.post("/api/device/readings")
@device_required
def readings():
    try:
        reported = store_reading(get_db(), g.device_id, request.get_json(silent=True))
    except ValueError as error:
        return jsonify(error=str(error)), 400
    return jsonify(ok=True, server_time=reported)


def store_reading(conn, device_id, data):
    """The same validation and atomic storage for HTTP and WebSocket reports."""
    if not isinstance(data, dict):
        raise ValueError("a reading must be a JSON object")
    try:
        if isinstance(data["distance_cm"], bool):
            raise ValueError()
        distance = float(data["distance_cm"])
        if not math.isfinite(distance):
            raise ValueError()
    except (KeyError, TypeError, ValueError, OverflowError):
        raise ValueError("distance_cm is required and must be a finite number") from None

    for name in ("occupied", "approach"):
        if data.get(name, False) not in (False, True, 0, 1):
            raise ValueError(name + " must be a boolean or 0/1")
    occupied = int(bool(data.get("occupied")))
    approach = int(bool(data.get("approach")))
    led_state = str(data.get("led_state") or "unknown")[:16]

    reported = now()
    chip_id = clean_identifier(data.get("chip_id"), 64)
    mac = clean_identifier(data.get("mac"), 32)
    # A board that has not yet read its MAC reports all zeros; never let that
    # clobber a real address that was stored earlier.
    if mac is not None and all(part == "00" for part in mac.split(":")):
        mac = None
    conn.execute("begin immediate")
    try:
        conn.execute(
            "insert into device_reports (device_id, distance_cm, occupied, approach, "
            "led_state, reported_at) values (?, ?, ?, ?, ?, ?)",
            (device_id, distance, occupied, approach, led_state, reported),
        )
        touch(conn, device_id)
        if chip_id or mac:
            conn.execute(
                "update devices set chip_id = coalesce(?, chip_id), "
                "mac_address = coalesce(?, mac_address) where device_id = ?",
                (chip_id, mac, device_id),
            )
        conn.execute(
            "delete from device_reports where device_id = ? and report_id not in "
            "(select report_id from device_reports where device_id = ? "
            " order by report_id desc limit ?)",
            (device_id, device_id, KEEP_REPORTS_PER_DEVICE),
        )
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise
    signal()  # Occupancy changes refresh the browser dashboards immediately too.
    return reported


@bp.get("/api/device/setting")
@device_required
def setting():
    """What the board asks for on every cycle: the light, and the latest call.

    The board watches one counter, so it reads that counter's state rather than
    a state for the whole office. The call event is what lets the buzzer tell a
    fresh call (one beep) from a recall (two): both restart ``called_at``, so the
    number alone cannot distinguish them.
    """
    conn = get_db()
    payload = setting_payload(conn, g.device_id)
    touch(conn, g.device_id)
    return jsonify(payload)


def setting_payload(conn, device_id):
    """Authoritative desk snapshot shared by HTTP and WebSocket delivery."""
    device = conn.execute(
        "select v.desk_id, d.is_active from devices v "
        "left join desks d on d.desk_id = v.desk_id where v.device_id = ?", (device_id,)
    ).fetchone()
    desk_id = device["desk_id"] if device else None
    # Read the state first: it may sweep an expired call back to the queue, so
    # the event below must describe the call that is still current afterwards.
    state = desk_state(conn, desk_id) if desk_id and device["is_active"] else "closed" if desk_id else "paused"

    event = None
    if desk_id:
        called = conn.execute(
            "select ticket_id from tickets where desk_id = ? and status = 'called' "
            "order by called_at desc limit 1",
            (desk_id,),
        ).fetchone()
        if called is not None:
            event = conn.execute(
                "select event_id, event_type, event_time from ticket_events "
                "where ticket_id = ? and event_type in ('called', 'recalled') "
                "order by event_id desc limit 1",
                (called["ticket_id"],),
            ).fetchone()

    age = seconds_since(event["event_time"]) if event is not None else None
    return dict(
        desk_id=desk_id,
        service_state=state,
        server_time=now(),
        call_event_id=event["event_id"] if event is not None else None,
        call_event=event["event_type"] if event is not None else None,
        call_event_age_seconds=max(0, round(age)) if age is not None else None,
    )
