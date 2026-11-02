import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, delete
from app.core.crypto import decrypt_value
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User
from app.models.flight import Flight
from app.schemas.user import validate_password_strength
from app.api.deps import get_current_superuser

router = APIRouter()

class AdminUserItem(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: Optional[str] = None
    license_number: Optional[str] = None
    is_active: bool
    is_superuser: bool
    created_at: datetime
    flight_count: int

    class Config:
        from_attributes = True

class AdminStatusUpdate(BaseModel):
    is_active: bool

class AdminPasswordReset(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_password_strength(v)

class AdminSystemStats(BaseModel):
    total_users: int
    active_users: int
    total_flights: int
    deleted_flights_count: int
    total_flight_hours: float
    db_status: str

class AdminFlightItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_name: Optional[str] = None
    date: str
    dep_icao: str
    arr_icao: str
    out_time_utc: str
    off_time_utc: Optional[str] = None
    on_time_utc: Optional[str] = None
    in_time_utc: str
    total_time_minutes: int
    night_time_minutes: int
    ifr_time_minutes: int
    pic_time_minutes: int
    sic_time_minutes: int
    flight_role: Optional[str] = "SIC"
    flight_handling: Optional[str] = "PF"
    landings_day: int
    landings_night: int
    aircraft_reg: str
    aircraft_type: str
    approach_type: Optional[str] = None
    remarks: Optional[str] = None
    is_deleted: bool
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/users", response_model=List[AdminUserItem])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superuser)
):
    """List all registered pilots with their active flight statistics (Admin only)"""
    # Query users
    users_result = await db.execute(select(User).order_by(desc(User.created_at)))
    users = users_result.scalars().all()

    # Query flight counts per user (FILTER ONLY ACTIVE FLIGHTS, excluding is_deleted = True)
    flight_counts_result = await db.execute(
        select(Flight.user_id, func.count(Flight.id))
        .where(Flight.is_deleted == False)
        .group_by(Flight.user_id)
    )
    counts_map = dict(flight_counts_result.all())

    items = []
    for u in users:
        items.append(AdminUserItem(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            license_number=u.license_number,
            is_active=u.is_active,
            is_superuser=u.is_superuser,
            created_at=u.created_at,
            flight_count=counts_map.get(u.id, 0)
        ))
    return items

@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: uuid.UUID,
    data: AdminStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superuser)
):
    """Toggle user active / blocked status"""
    if admin.id == user_id and not data.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own administrative account"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = data.is_active
    await db.commit()
    return {"message": f"User status updated to {'active' if data.is_active else 'suspended'}"}

@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: uuid.UUID,
    data: AdminPasswordReset,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superuser)
):
    """Administrative password reset"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    return {"message": f"Password for {user.email} successfully updated"}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superuser)
):
    """Permanently delete user and cascade delete flights"""
    if admin.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own administrative account"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(user)
    await db.commit()
    return {"message": f"User {user.email} and all associated data permanently deleted"}

@router.get("/flights", response_model=List[AdminFlightItem])
async def list_admin_flights(
    user_id: Optional[uuid.UUID] = None,
    status_filter: str = "all", # 'all' | 'active' | 'deleted'
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superuser)
):
    """List flights across all users with full audit information (Admin only)"""
    stmt = (
        select(Flight, User.email, User.full_name)
        .join(User, Flight.user_id == User.id)
        .order_by(desc(Flight.date), desc(Flight.out_time_utc))
    )

    if user_id:
        stmt = stmt.where(Flight.user_id == user_id)

    if status_filter == "active":
        stmt = stmt.where(Flight.is_deleted == False)
    elif status_filter == "deleted":
        stmt = stmt.where(Flight.is_deleted == True)

    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            (func.lower(Flight.dep_icao).like(q)) |
            (func.lower(Flight.arr_icao).like(q)) |
            (func.lower(Flight.aircraft_reg).like(q)) |
            (func.lower(Flight.aircraft_type).like(q)) |
            (func.lower(User.email).like(q)) |
            (func.lower(User.full_name).like(q))
        )

    stmt = stmt.offset(skip).limit(limit)
    results = await db.execute(stmt)

    items = []
    for flight, email, full_name in results.all():
        items.append(AdminFlightItem(
            id=flight.id,
            user_id=flight.user_id,
            user_email=email,
            user_name=full_name,
            date=flight.date.isoformat() if hasattr(flight.date, "isoformat") else str(flight.date),
            dep_icao=flight.dep_icao,
            arr_icao=flight.arr_icao,
            out_time_utc=flight.out_time_utc,
            off_time_utc=flight.off_time_utc,
            on_time_utc=flight.on_time_utc,
            in_time_utc=flight.in_time_utc,
            total_time_minutes=flight.total_time_minutes,
            night_time_minutes=flight.night_time_minutes,
            ifr_time_minutes=flight.ifr_time_minutes,
            pic_time_minutes=flight.pic_time_minutes,
            sic_time_minutes=flight.sic_time_minutes,
            flight_role=flight.flight_role,
            flight_handling=flight.flight_handling,
            landings_day=flight.landings_day,
            landings_night=flight.landings_night,
            aircraft_reg=flight.aircraft_reg,
            aircraft_type=flight.aircraft_type,
            approach_type=flight.approach_type,
            remarks=decrypt_value(flight.remarks),
            is_deleted=flight.is_deleted,
            updated_at=flight.updated_at
        ))
    return items

@router.put("/flights/{flight_id}/restore")
async def restore_flight(
    flight_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superuser)
):
    """Restore soft-deleted flight back to active state"""
    result = await db.execute(select(Flight).where(Flight.id == flight_id))
    flight = result.scalars().first()
    if not flight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flight not found")

    flight.is_deleted = False
    flight.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Flight restored successfully", "flight_id": str(flight_id)}

@router.delete("/flights/{flight_id}/permanent")
async def permanently_delete_flight(
    flight_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superuser)
):
    """Permanently remove flight row from database (Hard delete)"""
    result = await db.execute(select(Flight).where(Flight.id == flight_id))
    flight = result.scalars().first()
    if not flight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flight not found")

    await db.delete(flight)
    await db.commit()
    return {"message": "Flight permanently deleted from database", "flight_id": str(flight_id)}

@router.get("/stats", response_model=AdminSystemStats)
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superuser)
):
    """System-wide metrics and database health"""
    total_users_res = await db.execute(select(func.count(User.id)))
    total_users = total_users_res.scalar() or 0

    active_users_res = await db.execute(select(func.count(User.id)).where(User.is_active == True))
    active_users = active_users_res.scalar() or 0

    # Count active flights
    active_flights_res = await db.execute(select(func.count(Flight.id)).where(Flight.is_deleted == False))
    total_flights = active_flights_res.scalar() or 0

    # Count deleted flights
    deleted_flights_res = await db.execute(select(func.count(Flight.id)).where(Flight.is_deleted == True))
    deleted_flights_count = deleted_flights_res.scalar() or 0

    total_minutes_res = await db.execute(select(func.sum(Flight.total_time_minutes)).where(Flight.is_deleted == False))
    total_minutes = total_minutes_res.scalar() or 0

    return AdminSystemStats(
        total_users=total_users,
        active_users=active_users,
        total_flights=total_flights,
        deleted_flights_count=deleted_flights_count,
        total_flight_hours=round(total_minutes / 60.0, 1),
        db_status="healthy (PostgreSQL / asyncpg)"
    )
