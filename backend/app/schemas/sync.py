from uuid import UUID
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.schemas.flight import FlightResponse

class ClientFlightSyncItem(BaseModel):
    id: UUID
    date: str
    dep_icao: str
    arr_icao: str
    out_time_utc: str
    off_time_utc: str
    on_time_utc: str
    in_time_utc: str
    total_time_minutes: int
    night_time_minutes: int
    ifr_time_minutes: int
    pic_time_minutes: int
    sic_time_minutes: int
    picus_time_minutes: int
    dual_time_minutes: int
    flight_role: Optional[str] = "SIC"
    flight_handling: Optional[str] = "PF"
    landings_day: int
    landings_night: int
    aircraft_reg: str
    aircraft_type: str
    approach_type: Optional[str] = None
    remarks: Optional[str] = None
    is_deleted: bool = False
    updated_at: datetime

class SyncPushRequest(BaseModel):
    flights: List[ClientFlightSyncItem]

class SyncPushResponse(BaseModel):
    synced_count: int
    server_time: datetime

class SyncPullResponse(BaseModel):
    flights: List[FlightResponse]
    server_time: datetime
