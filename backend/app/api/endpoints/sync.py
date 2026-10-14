from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.core.database import get_db
from app.models.flight import Flight
from app.models.user import User
from app.schemas.sync import SyncPushRequest, SyncPushResponse, SyncPullResponse
from app.api.deps import get_current_user

router = APIRouter()

@router.post("/push", response_model=SyncPushResponse)
async def sync_push(
    payload: SyncPushRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    synced_count = 0
    now = datetime.now(timezone.utc)

    for item in payload.flights:
        # Check if flight exists on server
        stmt = select(Flight).where(
            and_(Flight.id == item.id, Flight.user_id == current_user.id)
        )
        result = await db.execute(stmt)
        existing_flight = result.scalars().first()

        item_dict = item.model_dump()
        is_deleted = item_dict.pop("is_deleted", False)
        client_updated_at = item_dict.pop("updated_at")

        if existing_flight:
            # Conflict resolution: only update if client's timestamp is newer or equal
            if client_updated_at >= existing_flight.updated_at:
                for key, value in item_dict.items():
                    if hasattr(existing_flight, key):
                        setattr(existing_flight, key, value)
                existing_flight.is_deleted = is_deleted
                existing_flight.updated_at = now
                synced_count += 1
        else:
            # Create new flight from client offline entry
            new_flight = Flight(
                user_id=current_user.id,
                is_deleted=is_deleted,
                updated_at=now,
                **item_dict
            )
            db.add(new_flight)
            synced_count += 1

    await db.commit()
    return {
        "synced_count": synced_count,
        "server_time": now
    }

@router.get("/pull", response_model=SyncPullResponse)
async def sync_pull(
    since: Optional[datetime] = Query(None, description="ISO timestamp of last sync"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)

    if since:
        # Return all updated, created, or deleted records since last sync
        stmt = (
            select(Flight)
            .where(and_(Flight.user_id == current_user.id, Flight.updated_at > since))
            .order_by(Flight.updated_at.asc())
        )
    else:
        # Initial sync: only non-deleted flights
        stmt = (
            select(Flight)
            .where(and_(Flight.user_id == current_user.id, Flight.is_deleted == False))
            .order_by(Flight.date.desc())
        )

    result = await db.execute(stmt)
    flights = result.scalars().all()

    return {
        "flights": flights,
        "server_time": now
    }
