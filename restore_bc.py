import sqlite3, datetime
conn = sqlite3.connect("api/data/myturn.db")
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
# Services B and C
conn.execute(
    "insert into services (letter, name, description, target_seconds, is_active, updated_at, updated_by) values (?,?,?,?,?,?,?)",
    ("B", "Admissions", "Course applications, enrolment and student records.", 900, 1, now, "setup"),
)
conn.execute(
    "insert into services (letter, name, description, target_seconds, is_active, updated_at, updated_by) values (?,?,?,?,?,?,?)",
    ("C", "Finance", "Fees, payments and billing enquiries.", 600, 1, now, "setup"),
)
# ticket_numbers for B and C
conn.execute("insert or ignore into ticket_numbers (name, value) values (?, 0)", ("ticket:B",))
conn.execute("insert or ignore into ticket_numbers (name, value) values (?, 0)", ("ticket:C",))
# Desks 2 and 3 (service_ids: B=2, C=3 after insert; but service_id autoincrement; let's look up)
svc_b = conn.execute("select service_id from services where letter='B'").fetchone()[0]
svc_c = conn.execute("select service_id from services where letter='C'").fetchone()[0]
conn.execute("insert into desks (name, service_id, is_active) values (?,?,?)", ("Admissions desk", svc_b, 1))
conn.execute("insert into desks (name, service_id, is_active) values (?,?,?)", ("Finance desk", svc_c, 1))
conn.commit()
print("services:", conn.execute("select service_id, letter, name from services").fetchall())
print("desks:", conn.execute("select desk_id, name, service_id from desks").fetchall())
print("ticket_numbers:", conn.execute("select * from ticket_numbers").fetchall())