import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.core.database import get_db
from app.models.flight import Flight
from app.models.user import User
from app.core.crypto import encrypt_value, decrypt_value
from app.schemas.flight import FlightCreate, FlightUpdate, FlightResponse
from app.api.deps import get_current_user

router = APIRouter()

@router.get("/", response_model=List[FlightResponse])
async def list_flights(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Flight)
        .where(and_(Flight.user_id == current_user.id, Flight.is_deleted == False))
        .order_by(Flight.date.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    flights = result.scalars().all()
    for f in flights:
        if f.remarks:
            f.remarks = decrypt_value(f.remarks)
    return flights

@router.post("/", response_model=FlightResponse, status_code=status.HTTP_201_CREATED)
async def create_flight(
    flight_in: FlightCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    flight_data = flight_in.model_dump()
    flight_id = flight_data.pop("id", None) or uuid.uuid4()

    if flight_data.get("remarks"):
        flight_data["remarks"] = encrypt_value(flight_data["remarks"])

    flight = Flight(
        id=flight_id,
        user_id=current_user.id,
        **flight_data
    )
    db.add(flight)
    await db.commit()
    await db.refresh(flight)
    if flight.remarks:
        flight.remarks = decrypt_value(flight.remarks)
    return flight

@router.get("/{flight_id}", response_model=FlightResponse)
async def get_flight(
    flight_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Flight).where(and_(Flight.id == flight_id, Flight.user_id == current_user.id, Flight.is_deleted == False))
    )
    flight = result.scalars().first()
    if not flight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flight not found")
    if flight.remarks:
        flight.remarks = decrypt_value(flight.remarks)
    return flight

@router.put("/{flight_id}", response_model=FlightResponse)
async def update_flight(
    flight_id: uuid.UUID,
    flight_in: FlightUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Flight).where(and_(Flight.id == flight_id, Flight.user_id == current_user.id, Flight.is_deleted == False))
    )
    flight = result.scalars().first()
    if not flight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flight not found")

    update_data = flight_in.model_dump(exclude_unset=True)
    if "remarks" in update_data and update_data["remarks"]:
        update_data["remarks"] = encrypt_value(update_data["remarks"])

    for field, value in update_data.items():
        setattr(flight, field, value)

    flight.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(flight)
    if flight.remarks:
        flight.remarks = decrypt_value(flight.remarks)
    return flight

@router.delete("/{flight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flight(
    flight_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Flight).where(and_(Flight.id == flight_id, Flight.user_id == current_user.id))
    )
    flight = result.scalars().first()
    if not flight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flight not found")

    # Soft delete for offline synchronization
    flight.is_deleted = True
    flight.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None
