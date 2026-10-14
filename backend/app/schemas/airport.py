from typing import Optional
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
