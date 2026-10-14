from uuid import UUID
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field

class FlightBase(BaseModel):
    date: date
    dep_icao: str = Field(..., min_length=4, max_length=4)
    arr_icao: str = Field(..., min_length=4, max_length=4)
    out_time_utc: str
    off_time_utc: str
    on_time_utc: str
    in_time_utc: str

    total_time_minutes: int = 0
    night_time_minutes: int = 0
    ifr_time_minutes: int = 0

    pic_time_minutes: int = 0
    sic_time_minutes: int = 0
    picus_time_minutes: int = 0
    dual_time_minutes: int = 0
    flight_role: Optional[str] = "SIC"
    flight_handling: Optional[str] = "PF"

    landings_day: int = 0
    landings_night: int = 0

    aircraft_reg: str
    aircraft_type: str
    approach_type: Optional[str] = None
    remarks: Optional[str] = None

class FlightCreate(FlightBase):
    id: Optional[UUID] = None # Can be generated on mobile client offline!

class FlightUpdate(BaseModel):
    date: Optional[date] = None
    dep_icao: Optional[str] = None
    arr_icao: Optional[str] = None
    out_time_utc: Optional[str] = None
    off_time_utc: Optional[str] = None
    on_time_utc: Optional[str] = None
    in_time_utc: Optional[str] = None
    total_time_minutes: Optional[int] = None
    night_time_minutes: Optional[int] = None
    ifr_time_minutes: Optional[int] = None
    pic_time_minutes: Optional[int] = None
    sic_time_minutes: Optional[int] = None
    picus_time_minutes: Optional[int] = None
    dual_time_minutes: Optional[int] = None
    flight_role: Optional[str] = None
    flight_handling: Optional[str] = None
    landings_day: Optional[int] = None
    landings_night: Optional[int] = None
    aircraft_reg: Optional[str] = None
    aircraft_type: Optional[str] = None
    approach_type: Optional[str] = None
    remarks: Optional[str] = None

class FlightResponse(FlightBase):
    id: UUID
    user_id: UUID
    is_deleted: bool
    updated_at: datetime

    class Config:
        from_attributes = True
