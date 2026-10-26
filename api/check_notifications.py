"""Mocked transport + isolated queue checks. Sends NO real email or SMS."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error


class ImmediateThread:
    def __init__(self, target, args, daemon):
        self.target, self.args = target, args
        assert daemon

    def start(self):
        self.target(*self.args)


class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.settings = patch.multiple(config, OPENSMS_API_KEY="opensms_test-key-not-real",
            OPENSMS_API_URL="https://opensms.dev", OPENSMS_DEVICE_ID="test-device",
            SMS_COUNTRY_CODE="250", SMTP_HOST="smtp.example.test",
            SMTP_PORT=587, SMTP_USERNAME="test-user", SMTP_PASSWORD="test-password",
            SMTP_FROM="queue@example.test", SMTP_SECURITY="starttls")
        self.settings.start()
        self.addCleanup(self.settings.stop)

    def test_phone_normalisation(self):
        for raw, expected in [("0788 123 456", "+250788123456"), ("+250788123456", "+250788123456"),
                              ("250788123456", "+250788123456"), ("00250788123456", "+250788123456"),
                              ("+12015550123", "+12015550123"), ("person@example.test", None),
                              ("abc123456789", None), ("123", None), ("+" + "1"*16, None)]:
            with self.subTest(raw=raw):
                self.assertEqual(sms._normalise_phone(raw), expected)

    def test_opensms_payload_and_authentication(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(
            {"id": "job-1", "status": "pending"}).encode()
        with patch("sms.threading.Thread", ImmediateThread), patch("sms.urllib.request.urlopen", return_value=response) as send:
            self.assertTrue(sms.send_sms("0788123456", "Ticket A001, service point 1"))
            req = send.call_args.args[0]
            self.assertEqual(req.full_url, "https://opensms.dev/api/v1/messages")
            self.assertEqual(req.method, "POST")
            headers = dict((k.lower(), v) for k, v in req.header_items())
            self.assertEqual(headers["authorization"], "Bearer opensms_test-key-not-real")
            self.assertIn("MyTurn", headers["user-agent"])
            self.assertEqual(json.loads(req.data), {"to": "+250788123456",
                "message": "Ticket A001, service point 1", "deviceId": "test-device"})
            self.assertEqual(send.call_args.kwargs["timeout"], 10)

    def test_opensms_default_device(self):
        with patch.object(config, "OPENSMS_DEVICE_ID", ""), patch("sms.threading.Thread") as worker:
            sms.send_sms("+250788123456", "test")
            self.assertNotIn("deviceId", worker.call_args.kwargs["args"][0])

    def test_missing_sms_key_and_invalid_recipient_never_send(self):
        with patch("sms.threading.Thread") as worker, patch.object(config, "OPENSMS_API_KEY", ""):
            self.assertFalse(sms.send_sms("+250788123456", "test"))
            self.assertFalse(sms.send_sms("email@example.test", "test"))
            worker.assert_not_called()

    def test_sms_rejection_and_timeout_are_not_delivery_or_retried(self):
        for error in [TimeoutError(), urllib.error.HTTPError("https://opensms.dev", 401, "refused", {}, None)]:
            with self.subTest(error=type(error).__name__), patch("sms.urllib.request.urlopen", side_effect=error) as send:
                with self.assertLogs("myturn.sms", "WARNING") as logs:
                    sms._post({"to": "+250788123456", "message": "test"})
                self.assertEqual(send.call_count, 1)
                self.assertNotIn("+250788123456", " ".join(logs.output))
                self.assertNotIn("opensms_test-key-not-real", " ".join(logs.output))

    def test_provider_acceptance_not_logged_as_delivery(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"id":"job-1","status":"pending"}'
        with patch("sms.urllib.request.urlopen", return_value=response), self.assertLogs("myturn.sms", "INFO") as logs:
            sms._post({"to": "+250788123456", "message": "test"})
        text = " ".join(logs.output)
        self.assertIn("delivery not yet confirmed", text)
        self.assertIn("job-1", text)
        self.assertNotIn("+250788123456", text)

    def test_smtp_starttls_email(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.send_message.return_value = {}
        with patch("email_notifications.threading.Thread", ImmediateThread), patch("email_notifications.smtplib.SMTP", return_value=smtp):
            self.assertTrue(email_notifications.send_email("visitor@example.test", "Ticket A001", "Go to service point 1"))
            smtp.starttls.assert_called_once()
            smtp.login.assert_called_once_with("test-user", "test-password")
            message = smtp.send_message.call_args.args[0]
            self.assertEqual(message["To"], "visitor@example.test")
            self.assertEqual(message["From"], "queue@example.test")
            self.assertIn("service point 1", message.get_content())
            methods = [call[0] for call in smtp.method_calls]
            self.assertLess(methods.index("starttls"), methods.index("login"))

    def test_smtp_ssl_email(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.send_message.return_value = {}
        with patch.object(config, "SMTP_SECURITY", "ssl"), patch.object(config, "SMTP_PORT", 465), \
             patch("email_notifications.threading.Thread", ImmediateThread), \
             patch("email_notifications.smtplib.SMTP_SSL", return_value=smtp) as connect:
            self.assertTrue(email_notifications.send_email("visitor@example.test", "Ticket", "Called"))
            self.assertEqual(connect.call_args.args, ("smtp.example.test", 465))
            smtp.starttls.assert_not_called()
            smtp.send_message.assert_called_once()

    def test_email_configuration_and_header_injection(self):
        with patch("email_notifications.threading.Thread") as worker:
            for recipient in ["bad", "x@example.test\r\nBcc: other@example.test", "a@example.test,b@example.test"]:
                self.assertFalse(email_notifications.send_email(recipient, "Ticket", "Called"))
            self.assertFalse(email_notifications.send_email("a@example.test", "Ticket\r\nBcc: b@example.test", "Called"))
            with patch.object(config, "SMTP_HOST", ""):
                self.assertFalse(email_notifications.send_email("a@example.test", "Ticket", "Called"))
            with patch.object(config, "SMTP_SECURITY", "none"):
                self.assertFalse(email_notifications.send_email("a@example.test", "Ticket", "Called"))
            worker.assert_not_called()

    def test_smtp_failure_is_contained(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.send_message.side_effect = email_notifications.smtplib.SMTPException("test")
        with patch("email_notifications.threading.Thread", ImmediateThread), \
             patch("email_notifications.smtplib.SMTP", return_value=smtp), \
             self.assertLogs("myturn.email", "WARNING"):
            self.assertTrue(email_notifications.send_email("a@example.test", "Ticket", "Called"))

    def test_dispatch_uses_only_the_chosen_channel(self):
        with patch("notifications.send_email") as email, patch("notifications.send_sms") as text:
            notifications.notify_called("A001", "Service point 1", "visitor@example.test")
            email.assert_called_once()
            text.assert_not_called()
            notifications.notify_called("A002", "Service point 2", "+250788123456")
            text.assert_called_once()
            self.assertIn("A002", text.call_args.args[1])
            self.assertIn("Service point 2", text.call_args.args[1])
            notifications.notify_called("A003", "Service point 1", None)
            self.assertEqual(email.call_count, 1)
            self.assertEqual(text.call_count, 1)

    def test_requeue_notice_names_both_numbers(self):
        with patch("notifications.send_email") as email, patch("notifications.send_sms") as text:
            notifications.notify_requeued("A007", "A012", "General Service", "+250788123456")
            text.assert_called_once()
            message = text.call_args.args[1]
            self.assertIn("A007", message)
            self.assertIn("A012", message)
            self.assertIn("General Service", message)
            email.assert_not_called()
            notifications.notify_requeued("A007", "A012", "General Service", None)
            self.assertEqual(text.call_count, 1, "no contact means no message")
            notifications.notify_requeued("A007", "A012", None, "visitor@example.test")
            email.assert_called_once()
            self.assertIn("A007", email.call_args.args[1])
            self.assertIn("A012", email.call_args.args[1])

    def test_development_sink_records_instead_of_sending(self):
        with tempfile.TemporaryDirectory() as folder:
            sink = Path(folder) / "notifications.log"
            with patch.object(config, "SMTP_HOST", ""), patch.object(config, "SMTP_FROM", ""), \
                 patch.object(config, "OPENSMS_API_KEY", ""), \
                 patch.object(config, "NOTIFY_DEV_SINK", True), \
                 patch.object(config, "NOTIFY_SINK_FILE", str(sink)), \
                 patch("notifications.send_email") as email, patch("notifications.send_sms") as text:
                email.return_value = False
                text.return_value = False
                notifications.notify_called("A001", "General Service", "visitor@example.test")
                notifications.notify_called("A002", "Admissions", "0788 123 456")
                self.assertTrue(sink.exists())
                lines = [json.loads(line) for line in sink.read_text(encoding="utf-8").splitlines()]
            self.assertEqual([line["channel"] for line in lines], ["email", "sms"])
            self.assertEqual(lines[0]["ticket"], "A001")
            self.assertEqual(lines[0]["desk"], "General Service")
            self.assertEqual(lines[1]["desk"], "Admissions")
            self.assertIn("A002", lines[1]["message"])
            self.assertIn("Admissions", lines[1]["message"])
            # A record is never a delivery, and no contact detail is written whole.
            self.assertEqual([line["delivered"] for line in lines], [False, False])
            self.assertIn("no provider configured", lines[0]["note"])
            self.assertEqual(lines[0]["recipient"], "v***@example.test")
            self.assertEqual(lines[1]["recipient"], "***456")
            self.assertNotIn("visitor@example.test", sink.read_text(encoding="utf-8"))
            self.assertNotIn("788123456", sink.read_text(encoding="utf-8"))

    def test_development_sink_is_silent_when_a_provider_sent(self):
        with tempfile.TemporaryDirectory() as folder:
            sink = Path(folder) / "notifications.log"
            with patch.object(config, "NOTIFY_DEV_SINK", True), \
                 patch.object(config, "NOTIFY_SINK_FILE", str(sink)), \
                 patch("notifications.send_email", return_value=True):
                notifications.notify_called("A003", "General Service", "visitor@example.test")
            self.assertFalse(sink.exists())

    def test_development_sink_is_off_by_default(self):
        with tempfile.TemporaryDirectory() as folder:
            sink = Path(folder) / "notifications.log"
            with patch.object(config, "SMTP_HOST", ""), patch.object(config, "SMTP_FROM", ""), \
                 patch.object(config, "NOTIFY_DEV_SINK", False), \
                 patch.object(config, "NOTIFY_SINK_FILE", str(sink)), \
                 patch("notifications.send_email", return_value=False):
                notifications.notify_called("A004", "General Service", "visitor@example.test")
            self.assertFalse(sink.exists())

    def test_committed_call_and_recall_trigger_notifications(self):
        client = app.test_client()
        response = client.post("/api/staff/login", json={"password": "isolated-notification-check", "name": "Check"})
        self.assertEqual(response.status_code, 200)
        headers = {"X-CSRF-Token": response.json["csrf_token"]}
        self.assertEqual(client.post("/api/staff/service", json={"service_state": "active"}, headers=headers).status_code, 200)
        visitor = app.test_client()
        self.assertEqual(visitor.post("/api/tickets", json={"service": "A", "contact": "visitor@example.test"}).status_code, 201)
        with patch("notifications.send_email") as email, patch("notifications.send_sms") as text:
            response = client.post("/api/staff/call-next", json={}, headers=headers)
            self.assertEqual(response.status_code, 200, response.json)
            ticket_id = response.json["ticket_id"]
            email.assert_called_once()
            text.assert_not_called()
            self.assertEqual(client.post(f"/api/staff/tickets/{ticket_id}/recall", json={}, headers=headers).status_code, 200)
            self.assertEqual(email.call_count, 2)
            self.assertEqual(client.post("/api/staff/call-next", json={}, headers=headers).status_code, 409)
            self.assertEqual(email.call_count, 2, "Rejected calls must not notify")
            client.post(f"/api/staff/tickets/{ticket_id}/action", json={"action": "complete"}, headers=headers)
            self.assertEqual(visitor.post("/api/tickets", json={"service": "A", "contact": "+250788123456"}).status_code, 201)
            response = client.post("/api/staff/call-next", json={}, headers=headers)
            self.assertEqual(response.status_code, 200, response.json)
            text.assert_called_once()
            client.post(f"/api/staff/tickets/{response.json['ticket_id']}/action", json={"action": "complete"}, headers=headers)
            visitor.post("/api/tickets", json={"service": "A", "contact": "second@example.test"})
            email.side_effect = RuntimeError("simulated provider failure")
            with self.assertLogs("myturn.notifications", "WARNING"):
                response = client.post("/api/staff/call-next", json={}, headers=headers)
            self.assertEqual(response.status_code, 200, "Provider failure must not undo a committed call")

    def _signed_in_desk(self):
        """A desk session with a free desk and an empty waiting line."""
        from util import now

        client = app.test_client()
        response = client.post(
            "/api/staff/login",
            json={"password": "isolated-notification-check", "name": "Check"},
        )
        self.assertEqual(response.status_code, 200)
        headers = {"X-CSRF-Token": response.json["csrf_token"]}
        self.assertEqual(
            client.post(
                "/api/staff/service",
                json={"service_state": "active"},
                headers=headers,
            ).status_code,
            200,
        )
        with app.app_context():
            from db import get_db

            conn = get_db()
            conn.execute(
                "update tickets set status = 'completed', closed_at = ? "
                "where status = 'called'",
                (now(),),
            )
            conn.execute(
                "update tickets set status = 'cancelled', closed_at = ? "
                "where status = 'waiting'",
                (now(),),
            )
        return client, headers

    def tearDown(self):
        """No test leaves a call or a waiting ticket behind for the next one."""
        from util import now

        with app.app_context():
            from db import get_db

            conn = get_db()
            conn.execute(
                "update tickets set status = 'completed', closed_at = ? "
                "where status = 'called'",
                (now(),),
            )
            conn.execute(
                "update tickets set status = 'cancelled', closed_at = ? "
                "where status = 'waiting'",
                (now(),),
            )

    def test_expired_call_notifies_the_visitor_with_the_new_number(self):
        """The sweep that requeues an abandoned call also tells the visitor."""
        from util import soon

        client, headers = self._signed_in_desk()
        visitor = app.test_client()
        self.assertEqual(
            visitor.post(
                "/api/tickets", json={"service": "A", "contact": "+250788123456"}
            ).status_code,
            201,
        )
        self.assertEqual(
            client.post("/api/staff/call-next", json={}, headers=headers).status_code,
            200,
        )

        with app.app_context():
            from db import get_db

            conn = get_db()
            called = conn.execute(
                "select t.ticket_id, t.ticket_no, s.letter from tickets t "
                "join services s on s.service_id = t.service_id "
                "where t.status = 'called' order by t.ticket_id desc limit 1"
            ).fetchone()
            self.assertIsNotNone(called)
            conn.execute(
                "update tickets set called_at = ? where ticket_id = ?",
                (soon(-3600), called["ticket_id"]),
            )
            old_label = "%s%03d" % (called["letter"], called["ticket_no"])
            ticket_id = called["ticket_id"]

        with patch("notifications.send_sms") as text:
            self.assertEqual(client.get("/api/public/state").status_code, 200)
            text.assert_called_once()
            message = text.call_args.args[1]

        with app.app_context():
            from db import get_db

            row = get_db().execute(
                "select t.ticket_no, s.letter from tickets t "
                "join services s on s.service_id = t.service_id "
                "where t.ticket_id = ?",
                (ticket_id,),
            ).fetchone()
            new_label = "%s%03d" % (row["letter"], row["ticket_no"])

        self.assertIn("was not answered", message)
        self.assertIn(old_label, message)
        self.assertIn(new_label, message)

    def test_call_next_after_the_hold_tells_the_visitor_the_number_changed(self):
        """The staff-triggered requeue sends the same notice as the sweep."""
        from util import soon

        client, headers = self._signed_in_desk()
        visitor = app.test_client()
        self.assertEqual(
            visitor.post(
                "/api/tickets", json={"service": "A", "contact": "+250788123456"}
            ).status_code,
            201,
        )
        self.assertEqual(
            client.post("/api/staff/call-next", json={}, headers=headers).status_code,
            200,
        )

        with app.app_context():
            from db import get_db

            conn = get_db()
            called = conn.execute(
                "select ticket_id, ticket_no from tickets "
                "where status = 'called' order by ticket_id desc limit 1"
            ).fetchone()
            old_label = "A%03d" % called["ticket_no"]
            conn.execute(
                "update tickets set called_at = ? where ticket_id = ?",
                (soon(-3600), called["ticket_id"]),
            )

        with patch("notifications.send_sms") as text:
            response = client.post("/api/staff/call-next", json={}, headers=headers)
            self.assertEqual(response.status_code, 200, response.json)
            messages = [call.args[1] for call in text.call_args_list]

        notices = [message for message in messages if "was not answered" in message]
        self.assertEqual(len(notices), 1, messages)
        self.assertIn(old_label, notices[0])


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="notifications-", dir=Path(os.environ["LOCALAPPDATA"]) / "Temp/opencode") as folder:
        os.environ.update(MYTURN_DB=str(Path(folder) / "check.db"), MYTURN_DATA_DIR=folder,
            MYTURN_SECRET="isolated-notification-check", MYTURN_STAFF_PASSWORD="isolated-notification-check",
            MYTURN_SECURE_COOKIES="0", MYTURN_OPENSMS_API_KEY="", MYTURN_SMTP_HOST="")
        import config
        import sms
        import email_notifications
        import notifications
        from app import app
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(NotificationTests))
        raise SystemExit(0 if result.wasSuccessful() else 1)
