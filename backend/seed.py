"""Create the database, the first desk setting and a device key.

Run it once from this folder:

    python seed.py

The key it prints is the only copy, so it is written to data/device_key.txt as
well. Put the same key in the ESP32 firmware as the X-Device-Key header.
"""
import argparse
import secrets
from pathlib import Path

import config
from db import apply_schema, connect
from security import hash_device_key
from util import now


def main():
    parser = argparse.ArgumentParser(description="Prepare the MyTurn database.")
    parser.add_argument("--label", default="Service desk 1", help="name of the board")
    parser.add_argument("--key", default=None, help="use a fixed key instead of a new one")
    parser.add_argument(
        "--reset", action="store_true", help="ignore an existing device with that label"
    )
    args = parser.parse_args()

    apply_schema(config.DATABASE)
    key = args.key or secrets.token_urlsafe(24)

    conn = connect(config.DATABASE)
    try:
        if conn.execute("select 1 from desk_settings limit 1").fetchone() is None:
            conn.execute(
                "insert into desk_settings (service_state, updated_at, updated_by) "
                "values ('paused', ?, 'seed')",
                (now(),),
            )

        existing = None
        if not args.reset:
            existing = conn.execute(
                "select device_id from devices where label = ?", (args.label,)
            ).fetchone()

        if existing is None:
            conn.execute(
                "insert into devices (label, device_key_hash) values (?, ?)",
                (args.label, hash_device_key(key)),
            )
        else:
            conn.execute(
                "update devices set device_key_hash = ? where device_id = ?",
                (hash_device_key(key), existing["device_id"]),
            )
    finally:
        conn.close()

    key_file = Path(config.DATA_DIR) / "device_key.txt"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key_file.write_text(key + "\n", encoding="utf-8")

    print("Database :", config.DATABASE)
    print("Device   :", args.label)
    print("Device key:", key)
    print("Saved to :", key_file)
    print()
    print("Put the key in the firmware as the X-Device-Key header.")


if __name__ == "__main__":
    main()
