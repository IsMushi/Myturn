import sqlite3
conn = sqlite3.connect("api/data/myturn.db")
conn.execute("update desks set name = ? where desk_id = ?", ("General service desk", 1))
conn.commit()
print(conn.execute("select desk_id, name from desks").fetchall())