"""Authenticated, bidirectional ESP32 stream; browsers continue to use SSE.

Each socket owns its reads and writes on one request thread. Queue broadcasts
wake it to send settled state, without network writes inside staff transactions.
No plaintext device keys are kept in the connection registry or URLs.
"""
import json
import queue
import threading
import time

from flask import current_app
from simple_websocket import ConnectionClosed

from broadcast import subscribe, unsubscribe
from db import get_db
from queue_rules import sweep_queue
from routes.device import setting_payload, store_reading
from security import hash_device_key

HELLO_TIMEOUT_SECONDS = 5
STATE_HEARTBEAT_SECONDS = 5
IDLE_TIMEOUT_SECONDS = 30
MAX_MESSAGE_BYTES = 4096
CONNECTED = {}
_connections_lock = threading.Lock()


def _object(raw):
    if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise ValueError("a small JSON text object is required")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("a JSON object is required")
    return value


def _fingerprint(state):
    # Ages and server_time change even when the actual desk state has not.
    return tuple(state[field] for field in (
        "desk_id", "service_state", "call_event_id", "call_event",
    ))


def register_ws(sock):
    @sock.route("/ws/device")
    def device_ws(ws):
        device_id = None
        channel = None
        try:
            hello = _object(ws.receive(timeout=HELLO_TIMEOUT_SECONDS))
            key = hello.get("key")
            if hello.get("type") != "hello" or not isinstance(key, str) or not 1 <= len(key) <= 512:
                ws.close(reason=1008, message="device hello required")
                return
            digest = hash_device_key(key)
            del key, hello
            conn = get_db()
            device = conn.execute(
                "select device_id from devices where device_key_hash = ?", (digest,),
            ).fetchone()
            if device is None:
                ws.close(reason=1008, message="device authentication failed")
                return
            device_id = device["device_id"]
            with _connections_lock:
                CONNECTED[device_id] = ws
            # A new connection supersedes the old one. Each handler closes only
            # its own socket, and old cleanup must not unregister its replacement.
            channel = subscribe()
            last_state = None
            last_send = 0
            last_receive = time.monotonic()
            last_sequence = 0
            rate_start = last_receive
            rate_count = 0

            while True:
                with _connections_lock:
                    replaced = CONNECTED.get(device_id) is not ws
                if replaced:
                    ws.close(reason=1001, message="device reconnected")
                    return
                tick = time.monotonic()
                dirty = last_state is None
                try:
                    channel.get_nowait()
                    dirty = True
                except queue.Empty:
                    pass
                heartbeat = tick - last_send >= STATE_HEARTBEAT_SECONDS
                if dirty or heartbeat:
                    # Re-read identity/assignment on heartbeat; revoked keys do
                    # not keep receiving state for the lifetime of a socket.
                    valid = conn.execute(
                        "select device_id from devices where device_id = ? and device_key_hash = ?",
                        (device_id, digest),
                    ).fetchone()
                    if valid is None:
                        ws.close(reason=1008, message="device authentication changed")
                        return
                    sweep_queue(conn)
                    state = setting_payload(conn, device_id)
                    fingerprint = _fingerprint(state)
                    if heartbeat or fingerprint != last_state:
                        ws.send(json.dumps({"type": "state", "initial": last_state is None, **state}))
                        last_state = fingerprint
                        last_send = tick

                raw = ws.receive(timeout=0.05)
                if raw is None:
                    if time.monotonic() - last_receive > IDLE_TIMEOUT_SECONDS:
                        ws.close(reason=1001, message="device heartbeat timed out")
                        return
                    continue
                last_receive = time.monotonic()
                if last_receive - rate_start >= 1:
                    rate_start, rate_count = last_receive, 0
                rate_count += 1
                if rate_count > 50:
                    ws.close(reason=1008, message="device message rate exceeded")
                    return
                data = _object(raw)
                if data.get("type") == "ping":
                    ws.send(json.dumps({"type": "pong"}))
                elif data.get("type") == "reading":
                    sequence = data.get("sequence")
                    if type(sequence) is not int or not 1 <= sequence <= 2147483647:
                        raise ValueError("reading sequence must be a positive integer")
                    if sequence > last_sequence:
                        reported = store_reading(conn, device_id, data)
                        last_sequence = sequence
                    else:
                        reported = None  # Duplicate: acknowledge, never reinsert stale telemetry.
                    ws.send(json.dumps({"type": "ack", "sequence": sequence, "server_time": reported}))
                else:
                    raise ValueError("unknown device message type")
        except ConnectionClosed:
            pass
        except (ValueError, TypeError):
            try:
                ws.close(reason=1008, message="invalid device message")
            except ConnectionClosed:
                pass
        except Exception:
            current_app.logger.exception("Device WebSocket failed (device id %s)", device_id)
        finally:
            if channel is not None:
                unsubscribe(channel)
            if device_id is not None:
                with _connections_lock:
                    if CONNECTED.get(device_id) is ws:
                        CONNECTED.pop(device_id, None)
