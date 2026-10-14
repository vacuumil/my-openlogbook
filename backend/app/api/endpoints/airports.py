from typing import List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.models.airport import Airport
from app.schemas.airport import AirportResponse

router = APIRouter()

@router.get("/search", response_model=List[AirportResponse])
async def search_airports(
    q: str = Query(..., min_length=2, description="Search by ICAO, IATA, or airport name"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    query_str = f"%{q.upper()}%"
    name_query = f"%{q}%"

    stmt = (
        select(Airport)
        .where(
            or_(
                Airport.icao.ilike(query_str),
                Airport.iata.ilike(query_str),
                Airport.name.ilike(name_query)
            )
        )
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{icao}", response_model=AirportResponse)
async def get_airport(icao: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Airport).where(Airport.icao == icao.upper()))
    airport = result.scalars().first()
    if not airport:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Airport not found")
    return airport
