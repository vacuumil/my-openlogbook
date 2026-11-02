import asyncio
import os
import sys
import sqlite3
import uuid
from datetime import datetime, date, timezone
from sqlalchemy import select
from app.core.database import AsyncSessionLocal, engine, Base
from app.models.user import User
from app.models.airport import Airport
from app.models.flight import Flight
from app.models.aircraft import Aircraft
from app.models.qualification import Qualification

def parse_uuid(val):
    if not val:
        return uuid.uuid4()
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except Exception:
        return uuid.uuid4()

def parse_dt(val):
    if not val:
        return datetime.now(timezone.utc)
    if isinstance(val, datetime):
        return val
    try:
        # Try ISO format
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)

def parse_date(val):
    if not val:
        return date.today()
    if isinstance(val, date):
        return val
    try:
        return datetime.strptime(str(val)[:10], "%Y-%m-%d").date()
    except Exception:
        return date.today()

async def run_migration():
    print("=" * 60)
    print(">> OpenLogBook: Automated SQLite -> PostgreSQL Migration")
    print("=" * 60)

    # 1. Initialize schema in PostgreSQL
    print("1. Creating tables in target PostgreSQL database...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("   [OK] PostgreSQL tables ready.")

    # 2. Locate source SQLite database
    sqlite_candidates = [
        os.getenv("SQLITE_DB_PATH", ""),
        "/app/data/openlogbook.db",
        "openlogbook.db",
        "backend/openlogbook.db"
    ]
    sqlite_path = None
    for p in sqlite_candidates:
        if p and os.path.exists(p) and os.path.getsize(p) > 0:
            sqlite_path = p
            break

    if not sqlite_path:
        print("2. No source SQLite file found. PostgreSQL started as fresh database.")
        return

    print(f"2. Found source SQLite database at: {sqlite_path} ({os.path.getsize(sqlite_path)} bytes)")

    # 3. Connect to SQLite
    s_conn = sqlite3.connect(sqlite_path)
    s_conn.row_factory = sqlite3.Row
    s_cur = s_conn.cursor()

    def table_exists(table_name):
        s_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        return s_cur.fetchone() is not None

    async with AsyncSessionLocal() as session:
        # Migrate Users
        if table_exists("users"):
            s_cur.execute("SELECT * FROM users")
            user_rows = s_cur.fetchall()
            print(f"3. Found {len(user_rows)} user(s) in SQLite.")
            migrated_users = 0
            for r in user_rows:
                u_id = parse_uuid(r["id"])
                existing = await session.execute(select(User).where(User.id == u_id))
                if not existing.scalars().first():
                    cols = r.keys()
                    user = User(
                        id=u_id,
                        email=r["email"],
                        hashed_password=r["hashed_password"],
                        full_name=r["full_name"] if "full_name" in cols else None,
                        license_number=r["license_number"] if "license_number" in cols else None,
                        profile_json=r["profile_json"] if "profile_json" in cols else None,
                        is_active=bool(r["is_active"]),
                        is_superuser=bool(r["is_superuser"]) if "is_superuser" in cols else False,
                        created_at=parse_dt(r["created_at"]) if "created_at" in cols else datetime.now(timezone.utc)
                    )
                    session.add(user)
                    migrated_users += 1
            await session.commit()
            print(f"   [OK] Migrated {migrated_users} new user(s) to PostgreSQL.")

        # Migrate Airports (Optimized for 29,000+ records)
        if table_exists("airports"):
            s_cur.execute("SELECT * FROM airports")
            airport_rows = s_cur.fetchall()
            print(f"4. Found {len(airport_rows)} airport(s) in SQLite.")
            
            # Fetch existing ICAOs in one bulk query
            existing_res = await session.execute(select(Airport.icao))
            existing_icaos = set(existing_res.scalars().all())
            
            to_insert = []
            migrated_airports = 0
            for r in airport_rows:
                icao = str(r["icao"]).upper().strip()
                if icao not in existing_icaos:
                    existing_icaos.add(icao)
                    cols = r.keys()
                    ap = Airport(
                        icao=icao,
                        iata=r["iata"] if "iata" in cols and r["iata"] else None,
                        name=r["name"],
                        latitude=float(r["latitude"]),
                        longitude=float(r["longitude"]),
                        timezone=r["timezone"] if "timezone" in cols else "UTC"
                    )
                    to_insert.append(ap)
                    migrated_airports += 1
                    
                    if len(to_insert) >= 2000:
                        session.add_all(to_insert)
                        await session.commit()
                        to_insert.clear()

            if to_insert:
                session.add_all(to_insert)
                await session.commit()
                to_insert.clear()

            print(f"   [OK] Migrated {migrated_airports} airport(s) to PostgreSQL.")

        # Migrate Flights
        if table_exists("flights"):
            s_cur.execute("SELECT * FROM flights")
            flight_rows = s_cur.fetchall()
            print(f"5. Found {len(flight_rows)} flight(s) in SQLite.")
            migrated_flights = 0
            for r in flight_rows:
                f_id = parse_uuid(r["id"])
                existing = await session.execute(select(Flight).where(Flight.id == f_id))
                if not existing.scalars().first():
                    cols = r.keys()
                    flight = Flight(
                        id=f_id,
                        user_id=parse_uuid(r["user_id"]),
                        date=parse_date(r["date"]),
                        dep_icao=str(r["dep_icao"]).upper().strip(),
                        arr_icao=str(r["arr_icao"]).upper().strip(),
                        out_time_utc=str(r["out_time_utc"]),
                        off_time_utc=str(r["off_time_utc"]),
                        on_time_utc=str(r["on_time_utc"]),
                        in_time_utc=str(r["in_time_utc"]),
                        total_time_minutes=int(r["total_time_minutes"] or 0),
                        night_time_minutes=int(r["night_time_minutes"] or 0),
                        ifr_time_minutes=int(r["ifr_time_minutes"] or 0),
                        pic_time_minutes=int(r["pic_time_minutes"] or 0),
                        sic_time_minutes=int(r["sic_time_minutes"] or 0),
                        picus_time_minutes=int(r["picus_time_minutes"] or 0),
                        dual_time_minutes=int(r["dual_time_minutes"] or 0),
                        flight_role=str(r["flight_role"]) if "flight_role" in cols and r["flight_role"] else "SIC",
                        flight_handling=str(r["flight_handling"]) if "flight_handling" in cols and r["flight_handling"] else "PF",
                        landings_day=int(r["landings_day"] or 0),
                        landings_night=int(r["landings_night"] or 0),
                        aircraft_reg=str(r["aircraft_reg"]),
                        aircraft_type=str(r["aircraft_type"]),
                        approach_type=r["approach_type"] if "approach_type" in cols else None,
                        remarks=r["remarks"] if "remarks" in cols else None,
                        is_deleted=bool(r["is_deleted"]) if "is_deleted" in cols else False,
                        updated_at=parse_dt(r["updated_at"]) if "updated_at" in cols else datetime.now(timezone.utc)
                    )
                    session.add(flight)
                    migrated_flights += 1
            await session.commit()
            print(f"   [OK] Migrated {migrated_flights} flight(s) to PostgreSQL.")

        # Migrate Aircraft & Qualifications if exist
        if table_exists("aircraft"):
            s_cur.execute("SELECT * FROM aircraft")
            ac_rows = s_cur.fetchall()
            for r in ac_rows:
                ac_id = parse_uuid(r["id"])
                existing = await session.execute(select(Aircraft).where(Aircraft.id == ac_id))
                if not existing.scalars().first():
                    cols = r.keys()
                    session.add(Aircraft(
                        id=ac_id,
                        user_id=parse_uuid(r["user_id"]),
                        registration=r["registration"],
                        icao_type=r["icao_type"],
                        category=r["category"] if "category" in cols else "Jet",
                        is_multi_pilot=bool(r["is_multi_pilot"]) if "is_multi_pilot" in cols else True
                    ))
            await session.commit()

        if table_exists("qualifications"):
            s_cur.execute("SELECT * FROM qualifications")
            q_rows = s_cur.fetchall()
            for r in q_rows:
                q_id = parse_uuid(r["id"])
                existing = await session.execute(select(Qualification).where(Qualification.id == q_id))
                if not existing.scalars().first():
                    cols = r.keys()
                    session.add(Qualification(
                        id=q_id,
                        user_id=parse_uuid(r["user_id"]),
                        type=r["type"],
                        name=r["name"],
                        expires_at=parse_date(r["expires_at"]),
                        notes=r["notes"] if "notes" in cols else None
                    ))
            await session.commit()

    s_conn.close()
    print("=" * 60)
    print(">> Automated Migration to PostgreSQL COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_migration())
