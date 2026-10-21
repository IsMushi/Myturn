"""MyTurn API.

The application factory creates the Flask app, connects the route modules and
makes sure the SQLite schema exists before the first request.

Run it from this folder:

    python app.py

The API then listens on http://127.0.0.1:5000 and the Next.js web app proxies
/api/* to it.
"""
import os

from flask import Flask, jsonify
from flask_cors import CORS
from flask_sock import Sock

import config
import db
from routes.analytics import bp as analytics_bp
from routes.auth import bp as auth_bp
from routes.device import bp as device_bp
from routes.device_ws import register_ws
from routes.events import bp as events_bp
from routes.public import bp as public_bp
from routes.staff import bp as staff_bp
from routes.visitor import bp as visitor_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(config)
    app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 10, "max_message_size": 4096}

    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    db.apply_schema(
        app.config["DATABASE"],
        desk_name=app.config["DESK_NAME"],
        desk_description=app.config["DESK_DESCRIPTION"],
    )
    db.init_app(app)

    # The web app proxies /api/*, so CORS matters only when a page calls the
    # API host directly.
    CORS(app, supports_credentials=True, origins=app.config["CORS_ORIGINS"])

    sock = Sock(app)
    register_ws(sock)

    app.register_blueprint(analytics_bp)

    @app.get("/api/health")
    def health():
        """Production health check with database and desk status."""
        import sqlite3
        from util import now, seconds_since

        status = {
            "ok": True,
            "service": "myturn-api",
            "timestamp": now(),
            "version": os.environ.get("MYTURN_ENV", "dev"),
            "database": {"connected": False, "tables": 0},
            "desks": {"active": 0, "paused": 0, "closed": 0, "offline": 0},
            "devices": {"registered": 0, "online": 0},
        }

        # Check database connectivity
        try:
            conn = sqlite3.connect(app.config["DATABASE"])
            cursor = conn.cursor()

            # Count tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            status["database"]["tables"] = len(cursor.fetchall())
            status["database"]["connected"] = True

            # Count desk states. A desk has no state column of its own: the
            # state is the most recent row in desk_settings, the same row the
            # board and the dashboard read.
            cursor.execute(
                "select d.is_active, "
                "  (select ds.service_state from desk_settings ds "
                "     where ds.desk_id = d.desk_id "
                "     order by ds.setting_id desc limit 1) as state "
                "from desks d"
            )
            for is_active, state in cursor.fetchall():
                if not is_active:
                    status["desks"]["offline"] += 1
                elif state == "active":
                    status["desks"]["active"] += 1
                elif state == "closed":
                    status["desks"]["closed"] += 1
                else:
                    # Paused, or paused by default before a state is recorded.
                    status["desks"]["paused"] += 1

            # Count registered devices, and how many of them have been heard
            # from recently enough to be trusted.
            cursor.execute("SELECT last_seen FROM devices")
            devices = cursor.fetchall()
            status["devices"]["registered"] = len(devices)
            window = app.config["DEVICE_ONLINE_SECONDS"]
            for (last_seen,) in devices:
                age = seconds_since(last_seen) if last_seen else None
                if age is not None and age <= window:
                    status["devices"]["online"] += 1

            conn.close()
        except sqlite3.Error as e:
            status["ok"] = False
            status["database"]["error"] = str(e)
            return jsonify(status), 503

        return jsonify(status)

    app.register_blueprint(visitor_bp)
    app.register_blueprint(public_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(staff_bp)
    app.register_blueprint(device_bp)
    app.register_blueprint(events_bp)

    return app


app = create_app()


if __name__ == "__main__":
    # Debug stays off unless it is asked for, because the demonstration is served
    # through a tunnel and the debugger must not be reachable there.
    #
    # The bind address defaults to loopback, which is right for the browser and
    # the web app but wrong for the ESP32: the board reaches the API over the
    # network, so it needs 0.0.0.0. See MYTURN_HOST in .env.example.
    app.run(
        host=os.environ.get("MYTURN_HOST") or os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("MYTURN_DEBUG", "0") == "1",
    )
