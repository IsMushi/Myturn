"""A very small wake-up call shared by the open event streams.

The visitor page and the wall display both follow the queue. Rather than ask
the server again every few seconds, they hold one stream open and the server
tells them when something has moved.

What travels here is not the queue itself, only the news that it changed: the
stream is handed a nudge, then reads the current state from the database and
sends that. Nothing is cached in this module, so a ticket that changes twice in
a second is still reported from the latest row rather than a remembered one.

A stream that is slow to read does not slow anything else down: each one owns a
queue that holds at most one pending wake-up, and a second signal while one is
still waiting is dropped, because the state it would recompute is the same
either way.
"""
import queue
import threading

_lock = threading.Lock()
_channels = set()


def subscribe():
    """A fresh channel for one open stream."""
    channel = queue.Queue(maxsize=1)
    with _lock:
        _channels.add(channel)
    return channel


def unsubscribe(channel):
    """Give a channel back when its stream ends."""
    with _lock:
        _channels.discard(channel)


def signal():
    """Wake every open stream so it can send the current state.

    Called after a change has been committed. Nothing is sent from here: the
    streams read the database themselves, so a ticket and the queue around it
    are always reported from the same, settled, set of rows.
    """
    with _lock:
        channels = list(_channels)
    for channel in channels:
        try:
            channel.put_nowait(None)
        except queue.Full:
            # A wake-up is already pending for this stream.
            pass
