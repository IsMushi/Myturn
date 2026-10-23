import os, sys
os.chdir("api")
sys.path.insert(0, ".")
os.environ["MYTURN_DEBUG"] = "1"
from app import create_app
app = create_app()
client = app.test_client()
import json
r = client.post("/api/auth/login", json={"email": "admin@myturn.local", "password": "GsoF-V9C9-eLQ9"})
print("login", r.status_code)
csrf = r.get_json()["csrf_token"]
r2 = client.post("/api/auth/profile", json={"full_name": "MyTurn administrator", "email": "admin2@myturn.local", "current_password": "wrong"}, headers={"X-CSRF-Token": csrf})
print("wrong-pw", r2.status_code)
print(r2.get_data(as_text=True)[:300])