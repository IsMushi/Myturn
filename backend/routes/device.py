"""Device routes: the traffic that comes from the ESP32 board.

Both routes are authenticated with a device key. The reading carried occupancy,
the approach flag and the LED state the board applied, so the dashboard can be
compared with what the hardware actually did.
"""
from flask import Blueprint, g, jsonify, request

from db import get_db
from security import device_required
from util import now

bp = Blueprint("device", __name__)

# Keep the report table small: each board keeps its most recent readings.
KEEP_REPORTS_PER_DEVICE = 2000


def touch(conn, device_id):
    conn.execute("update devices set last_seen = ? where device_id = ?", (now(), device_id))


@bp.post("/api/device/readings")
@device_required
def readings():
    data = request.get_json(silent=True) or {}

    try:
        distance = float(data["distance_cm"])
    except (KeyError, TypeError, ValueError):
        return jsonify(error="distance_cm is required and must be a number"), 400

    occupied = 1 if data.get("occupied") else 0
    approach = 1 if data.get("approach") else 0
    led_state = str(data.get("led_state") or "unknown")[:16]

    conn = get_db()
    reported = now()
    conn.execute(
        "insert into device_reports (device_id, distance_cm, occupied, approach, "
        "led_state, reported_at) values (?, ?, ?, ?, ?, ?)",
        (g.device_id, distance, occupied, approach, led_state, reported),
    )
    touch(conn, g.device_id)
    conn.execute(
        "delete from device_reports where device_id = ? and report_id not in "
        "(select report_id from device_reports where device_id = ? "
        " order by report_id desc limit ?)",
        (g.device_id, g.device_id, KEEP_REPORTS_PER_DEVICE),
    )

    return jsonify(ok=True, server_time=reported)


@bp.get("/api/device/setting")
@device_required
def setting():
    """What the board asks for on every cycle: the state to show on the light."""
    conn = get_db()
    row = conn.execute(
        "select service_state from desk_settings order by setting_id desc limit 1"
    ).fetchone()
    touch(conn, g.device_id)
    return jsonify(
        service_state=row["service_state"] if row else "paused",
        server_time=now(),
    )
