"""Create the database, the first desk state and a device key.

Run it once from this folder:

    python seed.py

The key it prints is the only copy, so it is written to data/device_key.txt as
well. Put the same key in the ESP32 firmware as the X-Device-Key header, and
point the board at the counter it watches with `--desk`.

The database arrives with three services and one desk for each (A, B and C).
The board is attached to Desk 1 unless another desk is named.
"""
import argparse
import secrets
from pathlib import Path

import config
from db import apply_schema, connect
from security import hash_device_key


def main():
    parser = argparse.ArgumentParser(description="Prepare the MyTurn database.")
    parser.add_argument("--label", default="Service desk 1", help="name of the board")
    parser.add_argument("--key", default=None, help="use a fixed key instead of a new one")
    parser.add_argument(
        "--desk", type=int, default=1, help="the desk this board watches (default 1)"
    )
    parser.add_argument(
        "--reset", action="store_true", help="ignore an existing device with that label"
    )
    args = parser.parse_args()

    apply_schema(
        config.DATABASE,
        desk_name=config.DESK_NAME,
        desk_description=config.DESK_DESCRIPTION,
    )
    key = args.key or secrets.token_urlsafe(24)

    conn = connect(config.DATABASE)
    try:
        desk = conn.execute(
            "select d.desk_id, d.name, s.letter, s.name as service_name "
            "from desks d join services s on s.service_id = d.service_id "
            "where d.desk_id = ?",
            (args.desk,),
        ).fetchone()
        if desk is None:
            raise SystemExit(
                "There is no desk %d. Start the API once so the office is seeded, "
                "then choose one of its desks." % args.desk
            )

        existing = None
        if not args.reset:
            existing = conn.execute(
                "select device_id from devices where label = ?", (args.label,)
            ).fetchone()

        if existing is None:
            conn.execute(
                "insert into devices (label, device_key_hash, desk_id) values (?, ?, ?)",
                (args.label, hash_device_key(key), desk["desk_id"]),
            )
        else:
            conn.execute(
                "update devices set device_key_hash = ?, desk_id = ? where device_id = ?",
                (hash_device_key(key), desk["desk_id"], existing["device_id"]),
            )
    finally:
        conn.close()

    key_file = Path(config.DATA_DIR) / "device_key.txt"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key_file.write_text(key + "\n", encoding="utf-8")

    print("Database :", config.DATABASE)
    print("Device   :", args.label)
    print("Watches  :", desk["name"], "(%s — %s)" % (desk["letter"], desk["service_name"]))
    print("Device key:", key)
    print("Saved to :", key_file)
    print()
    print("Put the key in the firmware as the X-Device-Key header.")


if __name__ == "__main__":
    main()
