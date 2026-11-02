import sqlite3
import os

db_path = os.getenv("SQLITE_DB_PATH", "openlogbook.db")
if not os.path.exists(db_path) and os.getenv("DATABASE_URL"):
    url = os.getenv("DATABASE_URL")
    if "sqlite" in url:
        db_path = url.split(":///")[-1]
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(flights)")
    cols = [r[1] for r in cur.fetchall()]
    print("Existing columns in flights:", cols)

    if "flight_role" not in cols:
        print("Adding flight_role...")
        cur.execute("ALTER TABLE flights ADD COLUMN flight_role VARCHAR(50) DEFAULT 'SIC'")
    if "flight_handling" not in cols:
        print("Adding flight_handling...")
        cur.execute("ALTER TABLE flights ADD COLUMN flight_handling VARCHAR(20) DEFAULT 'PF'")

    cur.execute("PRAGMA table_info(users)")
    user_cols = [r[1] for r in cur.fetchall()]
    print("Existing columns in users:", user_cols)
    if "profile_json" not in user_cols:
        print("Adding profile_json to users...")
        cur.execute("ALTER TABLE users ADD COLUMN profile_json TEXT")
        
    conn.commit()
    conn.close()
    print("Migration applied successfully!")
else:
    print("No openlogbook.db found, will be auto-created with full schema on next startup.")
