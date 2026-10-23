"""Check service-point messages in an isolated office; never touch live data."""
import os
from pathlib import Path
import tempfile
from unittest.mock import patch


def main():
    root = Path(os.environ["LOCALAPPDATA"]) / "Temp" / "opencode"
    with tempfile.TemporaryDirectory(prefix="service-point-", dir=root) as folder:
        os.environ.update({
            "MYTURN_DB": str(Path(folder) / "check.db"),
            "MYTURN_DATA_DIR": folder,
            "MYTURN_SECRET": "isolated-terminology-check",
            "MYTURN_STAFF_PASSWORD": "isolated-check-password",
            "MYTURN_SECURE_COOKIES": "0",
        })
        from app import app
        from queue_rules import hold_limit

        with app.app_context():
            with patch("queue_rules.seconds_since", return_value=999), \
                 patch("queue_rules._evidence", return_value=(True, [
                     {"distance_cm": 40, "occupied": True, "approach": False}
                 ])):
                assert hold_limit(None, {"called_at": "test"})[2] == "the service point is occupied"
            with patch("queue_rules.seconds_since", return_value=999), \
                 patch("queue_rules._evidence", return_value=(True, [
                     {"distance_cm": 400, "occupied": False, "approach": False}
                 ])):
                assert hold_limit(None, {"called_at": "test"})[2] == "the service point is empty"
                with patch.dict(app.config, MIN_CALL_SECONDS=app.config["HOLD_SECONDS"]):
                    assert hold_limit(None, {"called_at": "test"})[2] == "the service point is empty"

        client = app.test_client()
        response = client.post("/api/staff/login", json={"password": "isolated-check-password", "name": "Check"})
        assert response.status_code == 200, response.get_json()
        headers = {"X-CSRF-Token": response.get_json()["csrf_token"]}
        response = client.post("/api/staff/service", json={"service_state": "active"}, headers=headers)
        assert response.status_code == 200, response.get_json()
        with patch("routes.staff._desk_occupied", return_value=True):
            for endpoint in ["/api/staff/call-next", "/api/staff/call"]:
                response = client.post(endpoint, json={"ticket_id": 1}, headers=headers)
                assert response.status_code == 409, response.get_json()
                assert response.get_json()["error"] == "the service point is occupied; wait for it to clear"
        print("PASS: 5 service-point message checks; live office untouched")


if __name__ == "__main__":
    main()
