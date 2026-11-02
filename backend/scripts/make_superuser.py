import asyncio
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User

async def make_superuser(email: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email.strip()))
        user = result.scalars().first()
        if not user:
            print(f"Error: User with email '{email}' not found.")
            return False

        user.is_superuser = True
        user.is_active = True
        await session.commit()
        print(f"Success: User '{email}' (ID: {user.id}) is now a SUPERUSER.")
        return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python make_superuser.py <user_email>")
        sys.exit(1)
    target_email = sys.argv[1]
    asyncio.run(make_superuser(target_email))
