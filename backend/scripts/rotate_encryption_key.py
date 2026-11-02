"""
Script to rotate SQLite database encryption keys:
1. Reads all encrypted records (User.full_name, User.license_number, User.profile_json, Flight.remarks).
2. Decrypts them (using current or OLD_ENCRYPTION_KEY).
3. Re-encrypts them with the active ENCRYPTION_KEY.
4. Commits changes atomically.

Usage:
    export OLD_ENCRYPTION_KEY="your-previous-key"
    export ENCRYPTION_KEY="your-new-32-byte-key"
    python -m scripts.rotate_encryption_key
"""
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.flight import Flight
from app.core.crypto import decrypt_value, encrypt_value

async def rotate_keys():
    print("[*] Starting Master Encryption Key re-encryption process...")
    async with AsyncSessionLocal() as session:
        # 1. Rotate Users
        user_res = await session.execute(select(User))
        users = user_res.scalars().all()
        user_count = 0
        for u in users:
            changed = False
            if u.full_name:
                plain = decrypt_value(u.full_name)
                u.full_name = encrypt_value(plain)
                changed = True
            if u.license_number:
                plain = decrypt_value(u.license_number)
                u.license_number = encrypt_value(plain)
                changed = True
            if u.profile_json:
                plain = decrypt_value(u.profile_json)
                u.profile_json = encrypt_value(plain)
                changed = True
            if changed:
                user_count += 1

        # 2. Rotate Flights
        flight_res = await session.execute(select(Flight).where(Flight.remarks.isnot(None)))
        flights = flight_res.scalars().all()
        flight_count = 0
        for f in flights:
            if f.remarks:
                plain = decrypt_value(f.remarks)
                f.remarks = encrypt_value(plain)
                flight_count += 1

        await session.commit()
        print(f"[✓] Key rotation successfully completed!")
        print(f"    - Updated Users: {user_count}")
        print(f"    - Updated Flights: {flight_count}")

if __name__ == "__main__":
    asyncio.run(rotate_keys())
