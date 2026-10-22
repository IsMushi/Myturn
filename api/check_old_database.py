"""Build a database in the old one-desk shape and migrate it.

Run it from the backend folder:

    .venv\\Scripts\\python.exe tools_check_old_database.py

The old release had one queue: `tickets.ticket_no` was unique across the
office, `desk_settings` and `devices` had no desk, and the desk described
itself in `desk_profile`. This script writes that shape into a temporary
file, runs the migration over it and checks that nothing was lost.
"""
import sqlite3
import sys
import tempfile
from pathlib import Path

from db import apply_schema, connect

OLD_SCHEMA = """
create table if not exists counters (
    name  text primary key,
    value integer not null default 0
);
insert or ignore into counters (name, value) values ('ticket', 2);

create table if not exists tickets (
    ticket_id    integer primary key autoincrement,
    ticket_no    integer not null unique,
    status       text    not null default 'waiting',
    source       text    not null default 'qr',
    access_token text    not null unique,
    created_at   text    not null,
    called_at    text,
    closed_at    text
);
create index if not exists idx_tickets_status on tickets (status, ticket_no);
create unique index if not exists idx_tickets_one_called
    on tickets (status) where status = 'called';

create table if not exists ticket_events (
    event_id   integer primary key autoincrement,
    ticket_id  integer not null references tickets (ticket_id),
    event_type text    not null,
    event_time text    not null,
    actor      text    not null default 'system'
);

create table if not exists desk_settings (
    setting_id    integer primary key autoincrement,
    service_state text    not null,
    updated_at    text    not null,
    updated_by    text
);

create table if not exists desk_profile (
    profile_id     integer primary key autoincrement,
    name           text    not null,
    description    text    not null,
    target_seconds integer,
    updated_at     text    not null,
    updated_by     text
);

create table if not exists devices (
    device_id       integer primary key autoincrement,
    label           text    not null,
    device_key_hash text    not null unique,
    last_seen       text
);
"""

problems = []


def check(label, got, want):
    ok = got == want
    if not ok:
        problems.append(label)
    print("  %-4s %-52s got %r want %r" % ("ok" if ok else "FAIL", label, got, want))


def main():
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "old.db"

        conn = sqlite3.connect(str(path))
        conn.executescript(OLD_SCHEMA)
        conn.execute(
            "insert into tickets "
            "(ticket_no, status, source, access_token, created_at) "
            "values (1, 'waiting', 'qr', 'token-one', '2026-01-01T09:00:00+00:00')"
        )
        conn.execute(
            "insert into tickets "
            "(ticket_no, status, source, access_token, created_at, called_at) "
            "values (2, 'called', 'qr', 'token-two', '2026-01-01T09:01:00+00:00', "
            "'2026-01-01T09:02:00+00:00')"
        )
        conn.execute(
            "insert into ticket_events (ticket_id, event_type, event_time, actor) "
            "values (1, 'created', '2026-01-01T09:00:00+00:00', 'system')"
        )
        conn.execute(
            "insert into desk_settings (service_state, updated_at, updated_by) "
            "values ('active', '2026-01-01T08:00:00+00:00', 'admin')"
        )
        conn.execute(
            "insert into desk_profile "
            "(name, description, target_seconds, updated_at, updated_by) "
            "values ('General Service', 'All enquiries.', 180, "
            "'2026-01-01T08:00:00+00:00', 'admin')"
        )
        conn.execute(
            "insert into devices (label, device_key_hash, last_seen) "
            "values ('Service desk 1', 'hash', '2026-01-01T09:00:00+00:00')"
        )
        conn.commit()
        conn.close()

        apply_schema(str(path), desk_name="General Service",
                     desk_description="All enquiries.")

        conn = connect(str(path))
        try:
            services = conn.execute("select * from services order by letter").fetchall()
            check("three services were seeded", [row["letter"] for row in services],
                  ["A", "B", "C"])
            check("the old desk profile became service A",
                  services[0]["name"], "General Service")
            check("the old target time came with it",
                  services[0]["target_seconds"], 180)

            desks = conn.execute("select * from desks order by desk_id").fetchall()
            check("one desk per service was seeded", len(desks), 3)
            check("Desk 1 serves the first service",
                  conn.execute("select letter from services where service_id = ?",
                               (desks[0]["service_id"],)).fetchone()["letter"], "A")

            tickets = conn.execute(
                "select t.ticket_no, t.service_id, t.status, t.desk_id "
                "from tickets t order by t.ticket_no"
            ).fetchall()
            check("both tickets survived", [row["ticket_no"] for row in tickets], [1, 2])
            check("both tickets joined service A",
                  [row["service_id"] for row in tickets], [1, 1])
            check("the called ticket kept its state",
                  [row["status"] for row in tickets], ["waiting", "called"])

            events = conn.execute("select count(*) as c from ticket_events").fetchone()["c"]
            check("the event log survived", events, 1)

            device = conn.execute("select desk_id from devices").fetchone()
            check("the board was attached to Desk 1", device["desk_id"], 1)

            setting = conn.execute(
                "select desk_id, service_state from desk_settings "
                "where service_state = 'active'"
            ).fetchone()
            check("the old setting belongs to Desk 1", setting["desk_id"], 1)

            counters = {
                row["name"]: row["value"]
                for row in conn.execute("select * from ticket_numbers")
            }
            check("service A kept the old counter", counters.get("ticket:A"), 2)
            check("the other services start at zero",
                  (counters.get("ticket:B"), counters.get("ticket:C")), (0, 0))
            check("the old global counter is gone", "ticket" in counters, False)
            check("the old counters table is gone",
                  conn.execute(
                      "select 1 from sqlite_master where type = 'table' "
                      "and name = 'counters'"
                  ).fetchone() is None, True)

            broken = conn.execute("pragma foreign_key_check").fetchall()
            check("no broken references", len(broken), 0)
            check("the file is sound",
                  conn.execute("pragma integrity_check").fetchone()[0], "ok")
        finally:
            conn.close()

    print()
    if problems:
        print("%d checks failed: %s" % (len(problems), ", ".join(problems)))
        return 1
    print("The old database was migrated without losing anything.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
