"""Create or reset the first administrator.

Run it once from this folder:

    python seed_admin.py

The address and the password come from MYTURN_ADMIN_EMAIL and
MYTURN_ADMIN_PASSWORD in .env. Nothing in the running application reads that
password, and there is no public page that can create an administrator, so this
command is the only way in when the team table is empty.

Everyone after this account is created from an invitation an administrator sends
from the admin dashboard.
"""
import argparse
import sys

import config
from db import apply_schema, connect
from security import clean_email, clean_name, hash_password, password_problem
from util import now


def main():
    parser = argparse.ArgumentParser(description="Create the first MyTurn administrator.")
    parser.add_argument("--email", default=config.ADMIN_EMAIL,
                        help="defaults to MYTURN_ADMIN_EMAIL")
    parser.add_argument("--password", default=config.ADMIN_PASSWORD,
                        help="defaults to MYTURN_ADMIN_PASSWORD")
    parser.add_argument("--name", default=config.ADMIN_NAME,
                        help="defaults to MYTURN_ADMIN_NAME")
    parser.add_argument("--update-password", action="store_true",
                        help="also replace the password of an account that already exists")
    args = parser.parse_args()

    email = clean_email(args.email)
    if email is None:
        print("Set MYTURN_ADMIN_EMAIL in .env, or pass --email, to a real address.")
        return 2

    if not args.password:
        print("Set MYTURN_ADMIN_PASSWORD in .env, or pass --password.")
        return 2

    # The check is relaxed here on purpose: this password is chosen by the team
    # at setup time and is allowed to be as long as they like, but it still has
    # to clear the same bar the registration page applies.
    problem = password_problem(args.password)
    if problem and not args.update_password:
        print("That password is refused: %s." % problem)
        return 2

    apply_schema(config.DATABASE)
    conn = connect(config.DATABASE)
    try:
        existing = conn.execute("select * from users where email = ?", (email,)).fetchone()

        if existing is None:
            conn.execute(
                "insert into users (full_name, email, password_hash, role, created_at, "
                "is_active) values (?, ?, ?, 'admin', ?, 1)",
                (clean_name(args.name) or "Administrator", email,
                 hash_password(args.password), now()),
            )
            print("Created the administrator %s." % email)
        else:
            changed = []
            if existing["role"] != "admin":
                conn.execute("update users set role = 'admin' where user_id = ?",
                             (existing["user_id"],))
                changed.append("role set to admin")
            if not existing["is_active"]:
                conn.execute("update users set is_active = 1 where user_id = ?",
                             (existing["user_id"],))
                changed.append("switched back on")
            if args.update_password:
                conn.execute("update users set password_hash = ? where user_id = ?",
                             (hash_password(args.password), existing["user_id"]))
                changed.append("password replaced")
            print("Updated %s: %s." % (email, ", ".join(changed) or "nothing to change"))
    finally:
        conn.close()

    print()
    print("Sign in at /auth/login with that address and password.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
