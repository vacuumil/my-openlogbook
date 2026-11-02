import time
import re
from typing import List, Dict, Any, Optional
import httpx
from fastapi import APIRouter, Depends, Query, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.core.limiter import limiter
from app.models.airport import Airport
from app.schemas.airport import AirportResponse, WeatherResponse

router = APIRouter()

# In-memory weather cache: icao -> (timestamp, data_dict)
_WEATHER_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes
MAX_WEATHER_CACHE_SIZE = 500
ICAO_PATTERN = re.compile(r"^[A-Za-z0-9]{3,4}$")

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

@router.get("/{icao}/weather", response_model=WeatherResponse)
@limiter.limit("30/minute")
async def get_airport_weather(request: Request, icao: str):
    icao_clean = icao.strip().upper()
    if not ICAO_PATTERN.match(icao_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ICAO airport code format. Expected 3 to 4 alphanumeric characters."
        )

    now = time.time()

    # Check cache
    cached = _WEATHER_CACHE.get(icao_clean)
    if cached and (now - cached.get("cached_at", 0) < CACHE_TTL_SECONDS):
        return cached["data"]

    headers = {"User-Agent": "OpenLogBook/1.0 (Aviation Electronic Logbook)"}
    timeout = httpx.Timeout(6.0, connect=3.0)

    weather_data: Dict[str, Any] = {
        "icao": icao_clean,
        "has_weather": False,
        "raw_metar": None,
        "flight_category": None,
        "obs_time": None,
        "wind_dir": None,
        "wind_speed": None,
        "wind_gust": None,
        "visibility_sm": None,
        "temp_c": None,
        "dewpoint_c": None,
        "altim_hpa": None,
        "cover": None,
        "clouds": None,
        "raw_taf": None,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
            # Query METAR and TAF concurrently or sequentially
            metar_resp, taf_resp = await asyncio_gather_weather(client, icao_clean)

            if metar_resp and metar_resp.status_code == 200:
                metar_json = metar_resp.json()
                if isinstance(metar_json, list) and len(metar_json) > 0:
                    item = metar_json[0]
                    weather_data["has_weather"] = True
                    weather_data["raw_metar"] = item.get("rawOb")
                    weather_data["flight_category"] = item.get("fltCat")
                    weather_data["obs_time"] = item.get("reportTime") or item.get("receiptTime")
                    weather_data["wind_dir"] = item.get("wdir")
                    weather_data["wind_speed"] = item.get("wspd")
                    weather_data["wind_gust"] = item.get("wgst")
                    weather_data["visibility_sm"] = item.get("visib")
                    weather_data["temp_c"] = item.get("temp")
                    weather_data["dewpoint_c"] = item.get("dewp")
                    weather_data["altim_hpa"] = item.get("altim")
                    weather_data["cover"] = item.get("cover")
                    weather_data["clouds"] = item.get("clouds")

            if taf_resp and taf_resp.status_code == 200:
                taf_json = taf_resp.json()
                if isinstance(taf_json, list) and len(taf_json) > 0:
                    weather_data["raw_taf"] = taf_json[0].get("rawTAF")

    except Exception as e:
        print(f"[Weather Warning] Failed to fetch weather for {icao_clean}: {e}")

    # Store in cache with bounded size limit (DoS prevention)
    if len(_WEATHER_CACHE) >= MAX_WEATHER_CACHE_SIZE:
        oldest_keys = sorted(_WEATHER_CACHE.keys(), key=lambda k: _WEATHER_CACHE[k].get("cached_at", 0))[:50]
        for k in oldest_keys:
            _WEATHER_CACHE.pop(k, None)

    _WEATHER_CACHE[icao_clean] = {
        "cached_at": now,
        "data": weather_data
    }

    return weather_data

async def asyncio_gather_weather(client: httpx.AsyncClient, icao: str):
    import asyncio
    metar_url = f"https://aviationweather.gov/api/data/metar?ids={icao}&format=json"
    taf_url = f"https://aviationweather.gov/api/data/taf?ids={icao}&format=json"

    async def fetch(url):
        try:
            return await client.get(url)
        except Exception:
            return None

    return await asyncio.gather(fetch(metar_url), fetch(taf_url))

@router.get("/{icao}", response_model=AirportResponse)
async def get_airport(icao: str, db: AsyncSession = Depends(get_db)):
    icao_clean = icao.strip().upper()
    if not ICAO_PATTERN.match(icao_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ICAO code format."
        )
    result = await db.execute(select(Airport).where(Airport.icao == icao_clean))
    airport = result.scalars().first()
    if not airport:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Airport not found")
    return airport
