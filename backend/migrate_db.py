import sqlite3
import os

db_path = "openlogbook.db"
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
        
    conn.commit()
    conn.close()
    print("Migration applied successfully!")
else:
    print("No openlogbook.db found, will be auto-created with full schema on next startup.")
