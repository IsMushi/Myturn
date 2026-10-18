"""MyTurn API.

The application factory creates the Flask app, connects the route modules and
makes sure the SQLite schema exists before the first request.

Run it from this folder:

    python app.py

The API then listens on http://127.0.0.1:5000 and the Next.js frontend proxies
/api/* to it.
"""
import os

from flask import Flask, jsonify
from flask_cors import CORS

import config
import db
from routes.device import bp as device_bp
from routes.public import bp as public_bp
from routes.staff import bp as staff_bp
from routes.visitor import bp as visitor_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(config)

    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    db.apply_schema(app.config["DATABASE"])
    db.init_app(app)

    # The frontend proxies /api/*, so CORS matters only when a page calls the
    # API host directly.
    CORS(app, supports_credentials=True, origins=app.config["CORS_ORIGINS"])

    @app.get("/api/health")
    def health():
        return jsonify(ok=True, service="myturn-api", time=os.environ.get("MYTURN_ENV", "dev"))

    app.register_blueprint(visitor_bp)
    app.register_blueprint(public_bp)
    app.register_blueprint(staff_bp)
    app.register_blueprint(device_bp)

    return app


app = create_app()


if __name__ == "__main__":
    # Debug stays off unless it is asked for, because the demonstration is served
    # through a tunnel and the debugger must not be reachable there.
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("MYTURN_DEBUG", "0") == "1",
    )
