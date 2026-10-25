-- MyTurn database schema (SQLite)
-- Matches Table 7 and the appendix of the project report.
--
-- One office, several services, several desks. A visitor joins the queue of a
-- service; a desk belongs to exactly one service and calls that service's next
-- ticket. Two desks on the same service may each hold one call at a time.
--
-- Indexes are created by db.apply_schema() after an older, one-desk database
-- has been migrated, because they refer to columns that database does not have
-- yet. Keeping them out of this file is what lets `create table if not exists`
-- run first on both a fresh and an existing file.
--
-- The next ticket number for each service, one row per service letter
-- (ticket:A, ticket:B, ...). Nothing else belongs here.
create table if not exists ticket_numbers (
    name  text primary key,
    value integer not null default 0
);

create table if not exists services (
    service_id     integer primary key autoincrement,
    letter         text    not null unique,   -- A, B, C: the ticket prefix
    name           text    not null,
    description    text    not null,
    target_seconds integer,
    is_active      integer not null default 1,
    updated_at     text    not null,
    updated_by     text    not null default 'setup'
);

create table if not exists desks (
    desk_id    integer primary key autoincrement,
    name       text    not null,
    service_id integer not null references services (service_id),
    is_active  integer not null default 1
);

create table if not exists tickets (
    ticket_id    integer primary key autoincrement,
    ticket_no    integer not null,
    service_id   integer not null references services (service_id),
    -- Null while waiting. Set when a desk calls the ticket, and kept afterwards
    -- so the record still says which counter served it.
    desk_id      integer references desks (desk_id),
    status       text    not null default 'waiting',
    source       text    not null default 'qr',
    access_token text    not null unique,
    -- Optional: a phone number or an email address the visitor left so the desk
    -- can reach them. It is not an account and is never shown on the display.
    contact      text,
    created_at   text    not null,
    called_at    text,
    closed_at    text,
    -- Browser fingerprint for duplicate detection (VIS-10, QUE-19).
    -- Stored as a hash of navigator.userAgent + timezone + screen resolution.
    browser_fingerprint text,
    unique (service_id, ticket_no)
);

create table if not exists ticket_events (
    event_id   integer primary key autoincrement,
    ticket_id  integer not null references tickets (ticket_id),
    event_type text    not null,
    -- Why it happened, when the event type alone does not say. A requeue is
    -- written by the hold rule and by the board-assisted rule, and the log
    -- should show which one ended the turn.
    detail     text,
    event_time text    not null,
    actor      text    not null default 'system'
);

-- One row per change of a desk's state. A desk is the thing that opens, pauses
-- or closes; the service it belongs to is available while one of its desks is.
create table if not exists desk_settings (
    setting_id    integer primary key autoincrement,
    desk_id       integer not null references desks (desk_id),
    service_state text    not null,
    updated_at    text    not null,
    updated_by    text,
    -- A pause may say why and until when. Both are written by the person at the
    -- desk, never inferred; a desk that does not say leaves them empty.
    pause_reason  text,
    paused_until  text
);

create table if not exists devices (
    device_id       integer primary key autoincrement,
    label           text    not null,
    device_key_hash text    not null unique,
    -- The counter this board watches. Null only until seed.py assigns it.
    desk_id         integer references desks (desk_id),
    last_seen       text,
    -- What the board says it is. Both come from the ESP32's silicon and are
    -- reported by the firmware, so two boards can be told apart in the log.
    chip_id         text,
    mac_address     text
);

create table if not exists device_self_test (
    device_id       integer primary key references devices (device_id),
    distance_cm     real,
    flags           text not null default '',
    reported_at     text not null
);

-- What happened to an account: invited, registered, switched off, made an
-- administrator, password changed. The queue keeps its own history in
-- ticket_events; this is the same idea for the people who work the desk, so the
-- administration page can show who did what instead of only the current state.
create table if not exists users (
    user_id       integer primary key autoincrement,
    full_name     text    not null,
    email         text    collate nocase not null unique,
    password_hash text    not null,
    role          text    not null check (role in ('admin', 'staff')),
    desk_id       integer references desks (desk_id),
    is_active     integer not null default 1,
    created_at    text    not null,
    last_login_at text
);

create table if not exists invitations (
    invitation_id integer primary key autoincrement,
    email         text    collate nocase not null,
    role          text    not null check (role in ('staff', 'admin')),
    desk_id       integer references desks (desk_id),
    token_hash    text    not null unique,
    invited_by    text    not null,
    created_at    text    not null,
    expires_at    text    not null,
    accepted_at   text
);

-- What happened to an account: invited, registered, switched off, made an
-- administrator, password changed. The queue keeps its own history in
-- ticket_events; this is the same idea for the people who work the desk, so the
-- administration page can show who did what instead of only the current state.
create table if not exists account_events (
    event_id   integer primary key autoincrement,
    event_type text    not null,
    email      text    not null,
    detail     text,
    actor      text    not null default 'system',
    event_time text    not null
);

create table if not exists password_resets (
    reset_id   integer primary key autoincrement,
    user_id    integer not null references users (user_id) on delete cascade,
    token_hash text    not null unique,
    created_at text    not null,
    expires_at text    not null,
    used_at    text
);