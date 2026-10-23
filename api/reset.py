"""Empty the queue and the readings, ready for a fresh demonstration.

The services, the desks, the device key and the board registration are left
alone, so the firmware keeps working and the office keeps its shape. Every
ticket number goes back to zero and every desk is put back to paused.

    .venv\\Scripts\\python.exe reset.py
"""
import sqlite3

import config
from util import now

TABLES = ("ticket_events", "tickets", "device_reports", "desk_settings")


def main():
    conn = sqlite3.connect(config.DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    try:
        for table in TABLES:
            conn.execute(f"delete from {table}")

        # One number sequence per service (ticket:A, ticket:B, ...), never one
        # global.
        conn.execute("update ticket_numbers set value = 0 where name like 'ticket:%'")
        conn.execute(
            "delete from sqlite_sequence where name in "
            "('tickets', 'ticket_events', 'device_reports', 'desk_settings')"
        )

        # A desk with no state would read as paused anyway; writing the row out
        # keeps the history honest and the Activity page showing the reset.
        for desk in conn.execute("select desk_id from desks order by desk_id").fetchall():
            conn.execute(
                "insert into desk_settings (desk_id, service_state, updated_at, updated_by) "
                "values (?, 'paused', ?, 'reset')",
                (desk["desk_id"], now()),
            )
        conn.commit()
    finally:
        conn.close()

    print("Waiting list cleared, every ticket number back to zero, all desks set to paused.")


if __name__ == "__main__":
    main()
