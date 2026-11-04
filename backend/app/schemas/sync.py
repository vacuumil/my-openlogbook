from uuid import UUID
from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.flight import FlightResponse

class ClientFlightSyncItem(BaseModel):
    id: UUID
    date: date
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
    details: Optional[str] = None
    is_deleted: bool = False
    updated_at: datetime
    # Server version this edit was based on: lets the server tell a plain edit from a
    # real conflict without trusting the device clock
    base_updated_at: Optional[datetime] = None

class SyncPushRequest(BaseModel):
    flights: List[ClientFlightSyncItem] = Field(..., max_length=200, description="Batch of flights to sync (max 200 items)")

class SyncRejectedItem(BaseModel):
    id: UUID
    reason: str

class SyncPushResponse(BaseModel):
    synced_count: int
    # Server won: the client must replace its copy with these
    conflicts: List[FlightResponse] = []
    # Invalid items: the client keeps them and shows the reason
    rejected: List[SyncRejectedItem] = []
    server_time: datetime

class SyncPullResponse(BaseModel):
    flights: List[FlightResponse]
    server_time: datetime
