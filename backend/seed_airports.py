"""
Seed airports database from mwgg/Airports dataset
"""
import urllib.request
import json
import sqlite3
import os

AIRPORTS_URL = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json"
DB_PATH = os.path.join(os.path.dirname(__file__), "openlogbook.db")

def seed():
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found.")
        return

    print("Fetching airports dataset...")
    req = urllib.request.Request(AIRPORTS_URL, headers={"User-Agent": "OpenLogBook/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Failed to download airports: {e}")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    inserted = 0
    for code, apt in data.items():
        icao = (apt.get("icao") or code or "").strip().upper()
        if not icao or len(icao) > 4:
            continue
        iata = (apt.get("iata") or "").strip().upper()
        if len(iata) > 3:
            iata = iata[:3]
        name = (apt.get("name") or apt.get("city") or icao)[:255]
        try:
            lat = float(apt.get("lat", 0.0))
            lon = float(apt.get("lon", 0.0))
        except (ValueError, TypeError):
            continue
        tz = (apt.get("tz") or "UTC")[:100]

        cur.execute("""
            INSERT INTO airports (icao, iata, name, latitude, longitude, timezone)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(icao) DO UPDATE SET
                iata=excluded.iata,
                name=excluded.name,
                latitude=excluded.latitude,
                longitude=excluded.longitude,
                timezone=excluded.timezone
        """, (icao, iata or None, name, lat, lon, tz))
        inserted += 1

    conn.commit()
    conn.close()
    print(f"Successfully seeded {inserted} airports into {DB_PATH}!")

if __name__ == "__main__":
    seed()
