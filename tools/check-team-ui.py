"""Read-only browser checks for /admin/team. All account API calls are mocked."""

import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    admin = {"user_id": 1, "full_name": "Admin Tester", "email": "admin@example.test",
             "role": "admin", "is_active": True, "created_at": "2026-01-01T00:00:00+00:00",
             "last_login_at": None}
    member = {"user_id": 2, "full_name": "Staff Tester", "email": "staff@example.test",
              "role": "staff", "is_active": True, "created_at": "2026-01-01T00:00:00+00:00",
              "last_login_at": None}
    member2 = {**member, "user_id": 3, "full_name": "Second Tester", "email": "second@example.test"}
    member3 = {**member, "user_id": 4, "full_name": "Third Tester", "email": "third@example.test"}
    users = [admin, member, member2, member3]
    invited = []
    writes = []
    fail_delete = {"once": True}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        # The proxy only needs a cookie's presence; no real account is used.
        context.add_cookies([{"name": "session", "value": "mock-session", "url": args.base_url}])
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def mock(route):
            req = route.request
            path = req.url.split("/api/", 1)[-1].split("?", 1)[0]
            if path == "auth/me":
                return route.fulfill(json={"user": admin, "shared": False, "csrf_token": "mock-csrf"})
            if path == "auth/users" and req.method == "GET":
                return route.fulfill(json={"users": users, "invitations": invited})
            if path == "auth/invitations" and req.method == "POST":
                writes.append((req.method, path, req.headers.get("x-csrf-token")))
                email = req.post_data_json["email"]
                invited.append({"invitation_id": 11, "email": email, "role": "staff",
                                "created_at": "2026-10-20T09:00:00+00:00",
                                "expires_at": "2026-10-30T09:00:00+00:00"})
                return route.fulfill(status=201, json={"email": email, "role": "staff",
                                                       "replaced": False, "expires_in_hours": 48,
                                                       "register_path": "/auth/register?token=mock-only"})
            if path == "auth/users/2" and req.method == "DELETE":
                writes.append((req.method, path, req.headers.get("x-csrf-token")))
                assert req.post_data_json == {"confirm_email": member["email"]}
                if fail_delete["once"]:
                    fail_delete["once"] = False
                    return route.fulfill(status=503, json={"error": "Please try again"})
                users.remove(member)
                return route.fulfill(json={"deleted": 2, "email": member["email"]})
            if path == "auth/users/batch" and req.method == "POST":
                payload = req.post_data_json
                writes.append((req.method, path, req.headers.get("x-csrf-token")))
                assert {row["user_id"] for row in payload["accounts"]} == {3, 4}
                if payload["action"] == "delete":
                    assert payload["confirmation"] == "DELETE 2"
                    if fail_delete["once"]:
                        fail_delete["once"] = False
                        return route.fulfill(status=409, json={"error": "Selection is stale"})
                    users.remove(member2)
                    users.remove(member3)
                else:
                    for row in (member2, member3):
                        row["is_active"] = payload["action"] == "activate"
                return route.fulfill(json={"action": payload["action"], "selected": 2, "changed": 2})
            if path == "public/state":
                return route.fulfill(json={"waiting": 0, "services": []})
            if path == "auth/desks":
                return route.fulfill(json={"desks": []})
            return route.abort()

        page.route("**/api/**", mock)
        page.goto(args.base_url + "/admin/team", wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="Accounts", exact=True)).to_be_visible()
        assert page.get_by_role("button", name="Delete account for Admin Tester").count() == 0
        assert page.get_by_label("Email address").count() == 0

        page.get_by_role("button", name="Invite a member").click()
        invite_dialog = page.get_by_role("dialog", name="Invite a staff member")
        expect(invite_dialog).to_be_visible()
        page.screenshot(path=str(args.output_dir / "team-invite.png"))
        invite_dialog.get_by_role("button", name="Create invitation").click()
        expect(invite_dialog.get_by_text("Enter your email address")).to_be_visible()
        invite_dialog.get_by_label("Email address").fill("new@example.test")
        invite_dialog.get_by_role("button", name="Create invitation").click()
        expect(invite_dialog).to_have_count(0)
        expect(page.get_by_text("Register link: /auth/register?token=mock-only")).to_be_visible()
        expect(page.get_by_text("new@example.test", exact=True)).to_be_visible()

        page.get_by_role("button", name="More actions for Staff Tester").click()
        page.get_by_role("button", name="Delete account", exact=True).click()
        delete_dialog = page.get_by_role("dialog", name="Delete account?")
        expect(delete_dialog).to_be_visible()
        assert delete_dialog.get_by_role("button", name="Delete account").is_disabled()
        delete_dialog.get_by_label("Type staff@example.test to confirm").fill("staff@example.test")
        page.screenshot(path=str(args.output_dir / "team-delete.png"))
        delete_dialog.get_by_role("button", name="Delete account").click()
        expect(delete_dialog.get_by_text("Please try again")).to_be_visible()
        assert page.locator('button[aria-label="More actions for Staff Tester"]').count() == 1
        delete_dialog.get_by_role("button", name="Delete account").click()
        expect(delete_dialog).to_have_count(0)
        # The confirmation is a toast, so it lands beside the row that changed.
        notice = page.get_by_test_id("admin-notice")
        expect(notice).to_be_visible()
        expect(notice).to_contain_text("The account for staff@example.test was permanently deleted.")
        expect(notice).to_contain_text("Its activity history remains.")
        assert page.get_by_role("button", name="More actions for Staff Tester").count() == 0
        page.wait_for_timeout(100)
        assert page.evaluate("document.activeElement?.textContent?.trim()") == "Accounts"
        assert page.get_by_role("checkbox", name="Select Admin Tester (admin@example.test)").is_disabled()
        page.get_by_role("checkbox", name="Select all accounts except yours").check()
        expect(page.get_by_text("2 selected")).to_be_visible()
        assert page.get_by_role("button", name="More actions for Second Tester").is_disabled()
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(args.output_dir / "team-selected-mobile.png"), full_page=True)
        page.set_viewport_size({"width": 1280, "height": 900})
        page.get_by_role("group", name="Selected account actions").get_by_role("button", name="Switch off").click()
        expect(notice).to_contain_text("2 accounts were switched off.")
        page.get_by_role("checkbox", name="Select all accounts except yours").check()
        page.get_by_role("group", name="Selected account actions").get_by_role("button", name="Switch on").click()
        expect(notice).to_contain_text("2 accounts were switched on.")
        page.get_by_role("checkbox", name="Select all accounts except yours").check()
        page.get_by_role("group", name="Selected account actions").get_by_role("button", name="Delete selected").click()
        bulk_dialog = page.get_by_role("dialog", name="Delete 2 accounts?")
        expect(bulk_dialog).to_be_visible()
        assert bulk_dialog.get_by_text("second@example.test", exact=False).is_visible()
        assert bulk_dialog.get_by_role("button", name="Delete 2 accounts").is_disabled()
        bulk_dialog.get_by_label("Type DELETE 2 to confirm").fill("DELETE 2")
        page.screenshot(path=str(args.output_dir / "team-bulk-delete.png"))
        fail_delete["once"] = True
        bulk_dialog.get_by_role("button", name="Delete 2 accounts").click()
        expect(bulk_dialog.get_by_text("Selection is stale")).to_be_visible()
        assert len(users) == 3
        bulk_dialog.get_by_role("button", name="Delete 2 accounts").click()
        expect(bulk_dialog).to_have_count(0)
        expect(notice).to_contain_text("2 accounts were permanently deleted.")
        # One toast, replaced each time: the confirmations do not stack up.
        assert page.get_by_test_id("admin-notice").count() == 1
        assert len(users) == 1
        assert writes == [("POST", "auth/invitations", "mock-csrf"),
                          ("DELETE", "auth/users/2", "mock-csrf"),
                          ("DELETE", "auth/users/2", "mock-csrf"),
                          ("POST", "auth/users/batch", "mock-csrf"),
                          ("POST", "auth/users/batch", "mock-csrf"),
                          ("POST", "auth/users/batch", "mock-csrf"),
                          ("POST", "auth/users/batch", "mock-csrf")], writes
        page.set_viewport_size({"width": 390, "height": 844})
        page.get_by_role("button", name="Invite a member").click()
        expect(page.get_by_role("dialog", name="Invite a staff member")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.get_by_role("dialog", name="Invite a staff member").get_by_role("button", name="Cancel").click()
        expect(page.get_by_role("dialog", name="Invite a staff member")).to_have_count(0)
        assert not errors, errors
        browser.close()
    print("PASS invite, row menu, selection, bulk on/off, confirmed bulk delete, retry, CSRF and roster refresh; no real accounts touched")


if __name__ == "__main__":
    main()
