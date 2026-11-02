import asyncio
import sys
import os

# Ensure backend root is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.user import User
from app.models.flight import Flight

ADMIN_EMAIL = "admin@openlogbook.aero"
ADMIN_PASSWORD = os.environ["ADMIN_INITIAL_PASSWORD"]  # Required: never keep a default here

async def setup_admin():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # 1. Check if admin account exists
        result = await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        admin_user = result.scalars().first()

        if not admin_user:
            admin_user = User(
                email=ADMIN_EMAIL,
                hashed_password=get_password_hash(ADMIN_PASSWORD),
                full_name="Главный Администратор",
                license_number="ATPL-MASTER",
                is_active=True,
                is_superuser=True
            )
            session.add(admin_user)
            print(f"Created dedicated admin account: {ADMIN_EMAIL}")
        else:
            admin_user.hashed_password = get_password_hash(ADMIN_PASSWORD)
            admin_user.is_superuser = True
            admin_user.is_active = True
            print(f"Updated dedicated admin account: {ADMIN_EMAIL}")

        # 2. Revoke is_superuser from all other users
        all_users_res = await session.execute(select(User).where(User.email != ADMIN_EMAIL))
        other_users = all_users_res.scalars().all()
        for u in other_users:
            u.is_superuser = False

        await session.commit()
        print(f"Revoked superuser from {len(other_users)} regular user(s).")
        print("Dedicated admin setup complete!")

if __name__ == "__main__":
    asyncio.run(setup_admin())
