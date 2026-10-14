from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.airport import Airport
from app.services.night_service import calculate_astronomical_night_time

router = APIRouter()

class NightCalcRequest(BaseModel):
    dep_icao: str
    arr_icao: str
    date: str # YYYY-MM-DD
    off_time_utc: str # HH:MM
    on_time_utc: str # HH:MM

class NightCalcResponse(BaseModel):
    dep_icao: str
    arr_icao: str
    night_minutes: int
    night_formatted: str

@router.post("/night-time", response_model=NightCalcResponse)
async def calculate_night_time(req: NightCalcRequest, db: AsyncSession = Depends(get_db)):
    dep_res = await db.execute(select(Airport).where(Airport.icao == req.dep_icao.upper()))
    dep_airport = dep_res.scalars().first()

    arr_res = await db.execute(select(Airport).where(Airport.icao == req.arr_icao.upper()))
    arr_airport = arr_res.scalars().first()

    if not dep_airport or not arr_airport:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Airport coordinates not found for {req.dep_icao} or {req.arr_icao}."
        )

    try:
        off_h, off_m = map(int, req.off_time_utc.split(":"))
        on_h, on_m = map(int, req.on_time_utc.split(":"))
        d = datetime.strptime(req.date, "%Y-%m-%d")

        off_dt = datetime(d.year, d.month, d.day, off_h, off_m, tzinfo=timezone.utc)
        on_dt = datetime(d.year, d.month, d.day, on_h, on_m, tzinfo=timezone.utc)
        if on_dt < off_dt:
            # Crossed midnight
            on_dt = on_dt.replace(day=on_dt.day + 1)

        night_mins = calculate_astronomical_night_time(
            dep_lat=dep_airport.latitude,
            dep_lon=dep_airport.longitude,
            arr_lat=arr_airport.latitude,
            arr_lon=arr_airport.longitude,
            off_time=off_dt,
            on_time=on_dt
        )

        h = night_mins // 60
        m = night_mins % 60

        return {
            "dep_icao": req.dep_icao.upper(),
            "arr_icao": req.arr_icao.upper(),
            "night_minutes": night_mins,
            "night_formatted": f"{h:02d}:{m:02d}"
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
