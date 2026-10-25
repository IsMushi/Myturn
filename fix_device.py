import sqlite3, hashlib
key = open("api/data/device_key.txt").read().strip()
conn = sqlite3.connect("api/data/myturn.db")
# Remove stray device registered during testing
conn.execute("delete from device_reports where device_id in (select device_id from devices where label = 'Registeration')")
conn.execute("delete from devices where label = 'Registeration'")
# Re-insert the seeded board if missing
exists = conn.execute("select 1 from devices where label = 'Service desk 1'").fetchone()
if not exists:
    conn.execute(
        "insert into devices (label, device_key_hash, desk_id) values (?, ?, ?)",
        ("Service desk 1", hashlib.sha256(key.encode()).hexdigest(), 1),
    )
conn.commit()
print(conn.execute("select device_id, label, desk_id from devices").fetchall())