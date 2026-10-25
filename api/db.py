"""SQLite access helpers.

Transactions are opened by hand ("begin immediate") in the routes that write, so
two staff sessions cannot take the same ticket, and so a device report cannot
interleave with a ticket action.

The first release had one desk and one queue. `apply_schema` still creates a
fresh database from `schema.sql`, but an existing one is migrated in place: the
tickets table is rebuilt once (its old global `ticket_no unique` has to become
`unique (service_id, ticket_no)`), desks and services are seeded from the old
`desk_profile` row, and the single device is attached to Desk 1.
"""
import sqlite3
from pathlib import Path

from flask import current_app, g

from util import now

SCHEMA_FILE = Path(__file__).resolve().parent / "schema.sql"

# Created after the migration, so they may safely mention the new columns.
INDEXES = """
create index if not exists idx_tickets_status
    on tickets (service_id, status, ticket_no);

-- A counter serves one visitor at a time. Two desks on the same service may
-- each hold a call, which is the whole point of keeping service and desk apart.
create unique index if not exists idx_tickets_one_called_per_desk
    on tickets (desk_id) where status = 'called';

create index if not exists idx_ticket_events_ticket
    on ticket_events (ticket_id, event_id);

create index if not exists idx_device_reports_device
    on device_reports (device_id, report_id);

create index if not exists idx_desks_service
    on desks (service_id);

create index if not exists idx_invitations_pending
    on invitations (token_hash) where accepted_at is null;

create index if not exists idx_account_events_time
    on account_events (event_time);

create index if not exists idx_password_resets_user
    on password_resets (user_id, used_at);
"""

# The starter office. Letters are ticket prefixes and never change afterwards.
# The first one keeps the wording the single-desk prototype already used.
STARTER_SERVICES = (
    ("B", "Admissions", "Course applications, enrolment and student records."),
    ("C", "Finance", "Fees, payments and billing enquiries."),
)


def connect(database):
    """Open one connection with the settings the project relies on."""
    conn = sqlite3.connect(database, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    conn.execute("pragma busy_timeout = 5000")
    return conn


def apply_schema(database, schema_file=SCHEMA_FILE, desk_name=None, desk_description=None):
    """Create the tables and indexes, and bring an older database forward.

    `create table if not exists` adds a new table to an old database, but it
    will not add a column to one that already exists, so the queue tables get a
    guarded migration. Nothing is rewritten once the database already has the
    service columns.
    """
    path = Path(database)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(str(path))
    try:
        conn.execute("pragma journal_mode = wal")
        conn.executescript(Path(schema_file).read_text(encoding="utf-8"))

        columns = {
            row["name"] for row in conn.execute("pragma table_info(ticket_events)")
        }
        if "detail" not in columns:
            conn.execute("alter table ticket_events add column detail text")

        _migrate_queue(conn, desk_name, desk_description)

        # A visitor may leave a phone number or an email so the desk can reach
        # them. It is optional, so an older database simply gains a null column.
        ticket_columns = _column_names(conn, "tickets")
        if "contact" not in ticket_columns:
            conn.execute("alter table tickets add column contact text")

        # The same for the duplicate-detection fingerprint. `create table if
        # not exists` cannot add a column to a table that is already there, and
        # the ticket insert names this one, so without the guard every ticket
        # request fails on a database created before the column was added.
        if "browser_fingerprint" not in ticket_columns:
            conn.execute("alter table tickets add column browser_fingerprint text")

        conn.executescript(INDEXES)
    finally:
        conn.close()


def _column_names(conn, table):
    return {row["name"] for row in conn.execute("pragma table_info(%s)" % table)}


def _table_exists(conn, table):
    return (
        conn.execute(
            "select 1 from sqlite_master where type = 'table' and name = ?", (table,)
        ).fetchone()
        is not None
    )


def _migrate_queue(conn, desk_name, desk_description):
    """Seed the office, then reshape a one-desk queue if this is one."""
    first_service = _seed_services(conn, desk_name, desk_description)
    first_desk = _seed_desks(conn)

    _rename_counters_table(conn)

    if "service_id" not in _column_names(conn, "tickets"):
        _rebuild_tickets(conn, first_service["service_id"])

    if "desk_id" not in _column_names(conn, "desk_settings"):
        conn.execute(
            "alter table desk_settings add column desk_id integer "
            "references desks (desk_id)"
        )
        conn.execute(
            "update desk_settings set desk_id = ? where desk_id is null",
            (first_desk["desk_id"],),
        )

    # A pause can say why and for how long, so the desk and the person reading
    # it know when it is coming back. Older databases have nowhere to keep it.
    for column in ("pause_reason", "paused_until"):
        if column not in _column_names(conn, "desk_settings"):
            conn.execute("alter table desk_settings add column %s text" % column)

    if "desk_id" not in _column_names(conn, "devices"):
        conn.execute(
            "alter table devices add column desk_id integer references desks (desk_id)"
        )
        conn.execute(
            "update devices set desk_id = ? where desk_id is null",
            (first_desk["desk_id"],),
        )

    # The board reports its own identity; older databases have nowhere to keep it.
    if "chip_id" not in _column_names(conn, "devices"):
        conn.execute("alter table devices add column chip_id text")
    if "mac_address" not in _column_names(conn, "devices"):
        conn.execute("alter table devices add column mac_address text")

    # A staff member may be assigned to one desk. Null means any desk.
    if "desk_id" not in _column_names(conn, "users"):
        conn.execute("alter table users add column desk_id integer references desks (desk_id)")
    if "desk_id" not in _column_names(conn, "invitations"):
        conn.execute("alter table invitations add column desk_id integer references desks (desk_id)")

    _ensure_desk_states(conn)
    _sync_ticket_numbers(conn)


def _rename_counters_table(conn):
    """Carry the old `counters` table over to `ticket_numbers`.

    `counters` held the next ticket number per service, which read as if it
    described a physical counter. The name is wrong, so the table is renamed
    once, in place, and an existing database keeps its numbers.
    """
    if not _table_exists(conn, "counters"):
        return
    if not _table_exists(conn, "ticket_numbers"):
        conn.execute("alter table counters rename to ticket_numbers")
        return

    # The schema file has already created the new table, so the old rows are
    # copied across. Where both hold the same name, the larger value wins: a
    # number is never given out twice.
    for row in conn.execute("select name, value from counters").fetchall():
        current = conn.execute(
            "select value from ticket_numbers where name = ?", (row["name"],)
        ).fetchone()
        if current is None:
            conn.execute(
                "insert into ticket_numbers (name, value) values (?, ?)",
                (row["name"], row["value"]),
            )
        elif row["value"] > current["value"]:
            conn.execute(
                "update ticket_numbers set value = ? where name = ?",
                (row["value"], row["name"]),
            )
    conn.execute("drop table counters")


def _seed_services(conn, desk_name, desk_description):
    """Give the office its services, taking the old desk profile as service A."""
    if conn.execute("select count(*) as c from services").fetchone()["c"] == 0:
        profile = None
        if _table_exists(conn, "desk_profile"):
            profile = conn.execute(
                "select name, description, target_seconds from desk_profile "
                "order by profile_id desc limit 1"
            ).fetchone()

        name = (profile["name"] if profile else desk_name) or "General Service"
        description = (
            profile["description"] if profile else desk_description
        ) or "All enquiries handled at the front desk."
        target = profile["target_seconds"] if profile else None
        _insert_service(conn, "A", name, description, target)
        for letter, starter_name, starter_description in STARTER_SERVICES:
            _insert_service(conn, letter, starter_name, starter_description, None)

    return conn.execute("select * from services order by letter limit 1").fetchone()


def _insert_service(conn, letter, name, description, target):
    conn.execute(
        "insert into services "
        "(letter, name, description, target_seconds, is_active, updated_at, updated_by) "
        "values (?, ?, ?, ?, 1, ?, 'setup')",
        (letter, name, description, target, now()),
    )


def _seed_desks(conn):
    """One counter per service on a fresh office; existing desks are left alone."""
    if conn.execute("select count(*) as c from desks").fetchone()["c"] == 0:
        for index, service in enumerate(
            conn.execute("select service_id from services order by letter").fetchall(), 1
        ):
            conn.execute(
                "insert into desks (name, service_id, is_active) values (?, ?, 1)",
                ("Desk %d" % index, service["service_id"]),
            )

    return conn.execute("select * from desks order by desk_id limit 1").fetchone()


def _rebuild_tickets(conn, service_id):
    """Turn the one-desk tickets table into the per-service one.

    SQLite cannot drop the old `ticket_no unique` constraint, so the table is
    rebuilt. Ticket ids and access tokens are copied unchanged, and the
    ticket_events rows keep pointing at them.
    """
    conn.execute("pragma foreign_keys = off")
    try:
        conn.execute("begin immediate")
        conn.execute(
            """
            create table tickets_new (
                ticket_id    integer primary key autoincrement,
                ticket_no    integer not null,
                service_id   integer not null references services (service_id),
                desk_id      integer references desks (desk_id),
                status       text    not null default 'waiting',
                source       text    not null default 'qr',
                access_token text    not null unique,
                created_at   text    not null,
                called_at    text,
                closed_at    text,
                browser_fingerprint text,
                unique (service_id, ticket_no)
            )
            """
        )
        conn.execute(
            "insert into tickets_new "
            "(ticket_id, ticket_no, service_id, desk_id, status, source, "
            " access_token, created_at, called_at, closed_at) "
            "select ticket_id, ticket_no, ?, null, status, source, "
            "       access_token, created_at, called_at, closed_at "
            "from tickets",
            (service_id,),
        )
        conn.execute("drop table tickets")
        conn.execute("alter table tickets_new rename to tickets")
        conn.execute("commit")
    except Exception:
        conn.execute("rollback")
        raise
    finally:
        conn.execute("pragma foreign_keys = on")

    # Keep the next ticket id after the highest copied one.
    conn.execute("delete from sqlite_sequence where name in ('tickets', 'tickets_new')")
    highest = conn.execute(
        "select coalesce(max(ticket_id), 0) as top from tickets"
    ).fetchone()["top"]
    conn.execute(
        "insert into sqlite_sequence (name, seq) values ('tickets', ?)", (highest,)
    )


def _ensure_desk_states(conn):
    """Every desk has a state; a new desk starts paused until staff open it."""
    for row in conn.execute("select desk_id from desks order by desk_id"):
        has_state = conn.execute(
            "select 1 from desk_settings where desk_id = ? limit 1", (row["desk_id"],)
        ).fetchone()
        if has_state is None:
            conn.execute(
                "insert into desk_settings (desk_id, service_state, updated_at, updated_by) "
                "values (?, 'paused', ?, 'setup')",
                (row["desk_id"], now()),
            )


def _sync_ticket_numbers(conn):
    """One number sequence per service, never behind a ticket that already exists."""
    legacy = conn.execute(
        "select value from ticket_numbers where name = 'ticket'"
    ).fetchone()

    rows = conn.execute("select service_id, letter from services order by letter").fetchall()
    for index, row in enumerate(rows):
        name = "ticket:" + row["letter"]
        if conn.execute(
            "select 1 from ticket_numbers where name = ?", (name,)
        ).fetchone() is None:
            conn.execute("insert into ticket_numbers (name, value) values (?, 0)", (name,))

        top = conn.execute(
            "select coalesce(max(ticket_no), 0) as top from tickets where service_id = ?",
            (row["service_id"],),
        ).fetchone()["top"]
        # The single sequence of the one-desk version belonged to the first
        # service. Keep it from going backwards during the move.
        if index == 0 and legacy is not None:
            top = max(top, legacy["value"])
        conn.execute(
            "update ticket_numbers set value = ? where name = ?", (top, name)
        )

    if legacy is not None:
        conn.execute("delete from ticket_numbers where name = 'ticket'")


def get_db():
    """The connection for the current request."""
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


def close_db(exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_app(app):
    app.teardown_appcontext(close_db)
