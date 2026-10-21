"""Small time helpers shared by the routes."""
from datetime import datetime, time, timedelta, timezone

# The office is in Kigali. Rwanda keeps no daylight saving, so the office is
# UTC+2 all year and the offset never moves. What is stored is UTC, because
# that is what a timestamp should be; the day boundary, the hourly charts and
# the times the interface shows are Kigali's.
KIGALI = timezone(timedelta(hours=2))
KIGALI_OFFSET_HOURS = 2


def now():
    """Current time as an ISO 8601 string in UTC, to the second."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse(timestamp):
    if not timestamp:
        return None
    try:
        return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None


def seconds_since(timestamp):
    """Seconds between a stored timestamp and now, or None if unreadable."""
    start = parse(timestamp)
    if start is None:
        return None
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - start).total_seconds()


def soon(seconds):
    """A timestamp this many seconds ahead, in the same format as now()."""
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(
        timespec="seconds"
    )


def is_future(timestamp):
    """True while a stored timestamp is still ahead of us."""
    moment = parse(timestamp)
    if moment is None:
        return False
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment > datetime.now(timezone.utc)


def local_now():
    """The current time in Kigali."""
    return datetime.now(KIGALI)


def local_date():
    """Today's date in Kigali.

    Not the same as the UTC date for two hours a day, and the office closes
    at night, so the day it means is Kigali's.
    """
    return datetime.now(KIGALI).date()


def local_midnight():
    """The start of today's Kigali day, as an ISO 8601 string in UTC.

    The event log is kept in UTC, so the boundary of the local day has to be
    converted before it can be compared with it.
    """
    midnight = datetime.combine(local_date(), time.min, tzinfo=KIGALI)
    return midnight.astimezone(timezone.utc).isoformat(timespec="seconds")


def local_sql(expression):
    """SQL that turns a stored UTC timestamp into Kigali local time.

    SQLite knows no timezones, so the office's offset is applied in the query.
    The result is the plain "YYYY-MM-DD HH:MM:SS" form, which is what
    substr() then reads a day or an hour out of.
    """
    return "datetime(%s, '%+d hours')" % (expression, KIGALI_OFFSET_HOURS)


def local_iso(timestamp):
    """A stored UTC timestamp as an ISO 8601 string in Kigali time.

    Used where the time is read by a person rather than by a program: the
    offset in the string says which zone it is in.
    """
    moment = parse(timestamp)
    if moment is None:
        return ""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(KIGALI).isoformat(timespec="seconds")
