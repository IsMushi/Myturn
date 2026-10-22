"""Try the one-desk to many-desk migration on a copy of the database.

Run it from the backend folder:

    .venv\\Scripts\\python.exe tools_check_migration.py

It copies the live database into a temporary file, runs the migration against
the copy, and prints what the office looks like afterwards. The live file is
not touched.
"""
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

import config
from db import apply_schema, connect

BACKUP = Path(config.DATA_DIR) / "myturn.backup-2026-10-19.db"
SOURCE = Path(config.DATABASE)


def show(path, title):
    print()
    print(title)
    conn = connect(str(path))
    try:
        for row in conn.execute("select * from services order by letter"):
            print("  service %s: %s (target %s, active %s)"
                  % (row["letter"], row["name"], row["target_seconds"], row["is_active"]))
        for row in conn.execute(
            "select d.desk_id, d.name, s.letter, d.is_active from desks d "
            "join services s on s.service_id = d.service_id order by d.desk_id"
        ):
            print("  desk %d: %s -> %s (active %s)"
                  % (row["desk_id"], row["name"], row["letter"], row["is_active"]))
        for row in conn.execute("select * from ticket_numbers order by name"):
            print("  number %s = %s" % (row["name"], row["value"]))
        for row in conn.execute(
            "select t.ticket_no, t.status, s.letter, t.desk_id from tickets t "
            "join services s on s.service_id = t.service_id order by t.ticket_no"
        ):
            print("  ticket %s%03d %s desk %s"
                  % (row["letter"], row["ticket_no"], row["status"], row["desk_id"]))
        for row in conn.execute("select device_id, label, desk_id from devices"):
            print("  device %d %s -> desk %s" % (row["device_id"], row["label"], row["desk_id"]))
        for row in conn.execute(
            "select desk_id, service_state, updated_by from desk_settings order by desk_id"
        ):
            print("  setting desk %s %s by %s"
                  % (row["desk_id"], row["service_state"], row["updated_by"]))
        print("  indexes: %s" % ", ".join(
            row["name"] for row in conn.execute(
                "select name from sqlite_master where type = 'index' and name like 'idx_%'"
                " order by name"
            )
        ))
    finally:
        conn.close()


def main():
    if not SOURCE.exists():
        print("There is no database at", SOURCE)
        return 1

    with tempfile.TemporaryDirectory() as folder:
        copy = Path(folder) / "myturn.db"
        shutil.copy2(SOURCE, copy)

        show(copy, "Before the migration")

        apply_schema(
            str(copy),
            desk_name=config.DESK_NAME,
            desk_description=config.DESK_DESCRIPTION,
        )

        show(copy, "After the migration")

        # The copy has to work as a database, not merely look right.
        conn = connect(str(copy))
        try:
            conn.execute("pragma foreign_key_check")
            broken = conn.execute("pragma foreign_key_check").fetchall()
            print()
            print("foreign key problems: %d" % len(broken))
            integrity = conn.execute("pragma integrity_check").fetchone()[0]
            print("integrity check:", integrity)
        finally:
            conn.close()

    print()
    print("The live database was not touched.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
