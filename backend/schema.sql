-- MyTurn database schema (SQLite)
-- Matches Table 7 and the appendix of the project report.

create table if not exists counters (
    name  text primary key,
    value integer not null default 0
);

insert or ignore into counters (name, value) values ('ticket', 0);

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

-- The desk serves one visitor at a time, so at most one ticket may be called.
create unique index if not exists idx_tickets_one_called
    on tickets (status) where status = 'called';

create table if not exists ticket_events (
    event_id   integer primary key autoincrement,
    ticket_id  integer not null references tickets (ticket_id),
    event_type text    not null,
    event_time text    not null,
    actor      text    not null default 'system'
);

create index if not exists idx_ticket_events_ticket
    on ticket_events (ticket_id, event_id);

create table if not exists desk_settings (
    setting_id    integer primary key autoincrement,
    service_state text    not null,
    updated_at    text    not null,
    updated_by    text
);

create table if not exists devices (
    device_id       integer primary key autoincrement,
    label           text    not null,
    device_key_hash text    not null unique,
    last_seen       text
);

create table if not exists device_reports (
    report_id   integer primary key autoincrement,
    device_id   integer not null references devices (device_id),
    distance_cm real,
    occupied    integer not null default 0,
    approach    integer not null default 0,
    led_state   text,
    reported_at text    not null
);

create index if not exists idx_device_reports_device
    on device_reports (device_id, report_id);
