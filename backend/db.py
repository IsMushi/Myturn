"""SQLite access helpers.

Transactions are opened by hand ("begin immediate") in the routes that write, so
two staff sessions cannot take the same ticket, and so a device report cannot
interleave with a ticket action.
"""
import sqlite3
from pathlib import Path

from flask import current_app, g

SCHEMA_FILE = Path(__file__).resolve().parent / "schema.sql"


def connect(database):
    """Open one connection with the settings the project relies on."""
    conn = sqlite3.connect(database, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    conn.execute("pragma busy_timeout = 5000")
    return conn


def apply_schema(database, schema_file=SCHEMA_FILE):
    """Create the tables and indexes if they do not exist yet."""
    path = Path(database)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(str(path))
    try:
        conn.execute("pragma journal_mode = wal")
        conn.executescript(Path(schema_file).read_text(encoding="utf-8"))
    finally:
        conn.close()


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
