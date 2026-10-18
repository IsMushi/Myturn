"""Small time helpers shared by the routes."""
from datetime import datetime, timezone


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
