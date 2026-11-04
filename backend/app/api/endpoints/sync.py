import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, String
from app.core.database import get_db
from app.core.limiter import limiter
from app.models.flight import Flight
from app.models.user import User
from app.core.crypto import encrypt_value, decrypt_value
from app.schemas.flight import FlightResponse
from app.schemas.sync import SyncPushRequest, SyncPushResponse, SyncPullResponse, SyncRejectedItem
from app.api.deps import get_current_user

router = APIRouter()

MAX_BATCH_SIZE = 200
FORBIDDEN_MUTATE_COLUMNS = {"id", "user_id"}
COLUMN_LIMITS = {
    c.name: c.type.length for c in Flight.__table__.columns
    if isinstance(c.type, String) and c.type.length
}
MAX_DETAILS_LENGTH = 4000
MINUTE_FIELDS = [
    "total_time_minutes", "night_time_minutes", "ifr_time_minutes", "pic_time_minutes",
    "sic_time_minutes", "picus_time_minutes", "dual_time_minutes", "landings_day", "landings_night",
]

def as_utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes: they are stored in UTC
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

def to_timestamp(value: datetime) -> float:
    # SQLite returns naive datetimes: they are stored in UTC
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()

def validate_sync_item(item: dict) -> Optional[str]:
    """One bad record must not block the batch, so items are checked here instead of by the schema."""
    if not item["dep_icao"] or not item["arr_icao"]:
        return "Не указан аэропорт вылета или прилёта."
    for field, limit in COLUMN_LIMITS.items():
        value = item.get(field)
        if isinstance(value, str) and len(value) > limit:
            return f"Поле {field} длиннее {limit} символов."
    if any(item[field] < 0 for field in MINUTE_FIELDS):
        return "Время и посадки не могут быть отрицательными."
    details = item.get("details")
    if details is not None:
        if len(details) > MAX_DETAILS_LENGTH:
            return "Дополнительные данные рейса слишком велики."
        try:
            if not isinstance(json.loads(details), dict):
                raise ValueError
        except ValueError:
            return "Дополнительные данные рейса повреждены."
    return None

def flight_to_response(flight: Flight) -> FlightResponse:
    response = FlightResponse.model_validate(flight)
    response.remarks = decrypt_value(response.remarks)
    return response

@router.post("/push", response_model=SyncPushResponse)
@limiter.limit("60/minute")
async def sync_push(
    request: Request,
    payload: SyncPushRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if len(payload.flights) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Превышен максимальный размер пачки синхронизации ({MAX_BATCH_SIZE} рейсов)."
        )
    synced_count = 0
    now = datetime.now(timezone.utc)
    now_ts = now.timestamp()
    conflicts: List[Flight] = []
    rejected: List[SyncRejectedItem] = []
    valid_columns = {c.name for c in Flight.__table__.columns} - FORBIDDEN_MUTATE_COLUMNS

    # Ids are client-generated, so the lookup is not scoped by user: a foreign id must be refused
    ids = [item.id for item in payload.flights]
    result = await db.execute(select(Flight).where(Flight.id.in_(ids)))
    flights_by_id = {flight.id: flight for flight in result.scalars().all()}

    for item in payload.flights:
        item_dict = item.model_dump()
        is_deleted = item_dict.pop("is_deleted", False)
        client_updated_at = item_dict.pop("updated_at")
        base_updated_at = item_dict.pop("base_updated_at", None)

        existing_flight = flights_by_id.get(item.id)
        if existing_flight and existing_flight.user_id != current_user.id:
            rejected.append(SyncRejectedItem(id=item.id, reason="Идентификатор рейса уже занят."))
            continue

        # A deletion carries no data worth validating, and a user must always be able to remove a bad record
        if is_deleted and not existing_flight:
            synced_count += 1
            continue

        reason = None if is_deleted else validate_sync_item(item_dict)
        if reason:
            rejected.append(SyncRejectedItem(id=item.id, reason=reason))
            continue

        safe_dict = {k: v for k, v in item_dict.items() if k in valid_columns}

        # Encrypt sensitive remarks field with AES-256-GCM
        if "remarks" in safe_dict and safe_dict["remarks"]:
            safe_dict["remarks"] = encrypt_value(safe_dict["remarks"])

        if existing_flight:
            server_ts = to_timestamp(existing_flight.updated_at)
            if base_updated_at:
                # The client saw the latest version, so this is a plain edit
                accept = to_timestamp(base_updated_at) >= server_ts
            else:
                # Guard against future client clock skew (max 1 hour in future)
                client_ts = to_timestamp(client_updated_at)
                accept = (now_ts if client_ts > now_ts + 3600 else client_ts) >= server_ts

            if not accept:
                conflicts.append(existing_flight)
                continue

            if not is_deleted:
                for key, value in safe_dict.items():
                    setattr(existing_flight, key, value)
            existing_flight.is_deleted = is_deleted
            # Coarse clocks can repeat a timestamp: every change must still get a newer version,
            # or a client holding the old one would pass for up to date
            existing_flight.updated_at = max(now, as_utc(existing_flight.updated_at) + timedelta(microseconds=1))
            synced_count += 1
        else:
            # Create new flight from client offline entry
            new_flight = Flight(
                id=item.id,
                user_id=current_user.id,
                is_deleted=is_deleted,
                updated_at=now,
                **safe_dict
            )
            db.add(new_flight)
            flights_by_id[item.id] = new_flight
            synced_count += 1

    await db.commit()
    return {
        "synced_count": synced_count,
        "conflicts": [flight_to_response(flight) for flight in conflicts],
        "rejected": rejected,
        "server_time": now
    }

@router.get("/pull", response_model=SyncPullResponse)
@limiter.limit("60/minute")
async def sync_pull(
    request: Request,
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

    # Decrypt remarks before returning to client
    for f in flights:
        if f.remarks:
            f.remarks = decrypt_value(f.remarks)

    return {
        "flights": flights,
        "server_time": now
    }
