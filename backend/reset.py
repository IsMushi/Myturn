"""Empty the queue and the readings, ready for a fresh demonstration.

The device key and the board registration are left alone, so the firmware
keeps working.

    .venv\\Scripts\\python.exe reset.py
"""
import sqlite3

import config
from util import now

TABLES = ("ticket_events", "tickets", "device_reports", "desk_settings")


def main():
    conn = sqlite3.connect(config.DATABASE)
    try:
        for table in TABLES:
            conn.execute(f"delete from {table}")
        conn.execute("update counters set value = 0 where name = 'ticket'")
        conn.execute(
            "delete from sqlite_sequence where name in "
            "('tickets', 'ticket_events', 'device_reports', 'desk_settings')"
        )
        conn.execute(
            "insert into desk_settings (service_state, updated_at, updated_by) "
            "values ('paused', ?, 'reset')",
            (now(),),
        )
        conn.commit()
    finally:
        conn.close()

    print("Queue cleared, counter back to zero, desk set to paused.")


if __name__ == "__main__":
    main()
