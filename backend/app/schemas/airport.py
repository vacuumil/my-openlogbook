from typing import Optional, List, Any
from pydantic import BaseModel

class AirportBase(BaseModel):
    icao: str
    iata: Optional[str] = None
    name: str
    latitude: float
    longitude: float
    timezone: str = "UTC"

class AirportCreate(AirportBase):
    pass

class AirportResponse(AirportBase):
    class Config:
        from_attributes = True

class WeatherResponse(BaseModel):
    icao: str
    has_weather: bool = False
    raw_metar: Optional[str] = None
    flight_category: Optional[str] = None  # VFR, MVFR, IFR, LIFR
    obs_time: Optional[str] = None
    wind_dir: Optional[Any] = None
    wind_speed: Optional[Any] = None
    wind_gust: Optional[Any] = None
    visibility_sm: Optional[Any] = None
    temp_c: Optional[float] = None
    dewpoint_c: Optional[float] = None
    altim_hpa: Optional[float] = None
    cover: Optional[str] = None
    clouds: Optional[List[dict]] = None
    raw_taf: Optional[str] = None
