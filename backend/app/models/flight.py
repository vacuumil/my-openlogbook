import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Integer, Date, DateTime, Boolean, Text, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class Flight(Base):
    __tablename__ = "flights"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    dep_icao: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    arr_icao: Mapped[str] = mapped_column(String(4), nullable=False, index=True)

    # Block & Flight times (UTC, HH:MM format)
    out_time_utc: Mapped[str] = mapped_column(String(10), nullable=False)
    off_time_utc: Mapped[str] = mapped_column(String(10), nullable=False)
    on_time_utc: Mapped[str] = mapped_column(String(10), nullable=False)
    in_time_utc: Mapped[str] = mapped_column(String(10), nullable=False)

    # Duration breakdowns in minutes
    total_time_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    night_time_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ifr_time_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Pilot Function Times (EASA / FAA standards)
    pic_time_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sic_time_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    picus_time_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dual_time_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    flight_role: Mapped[str] = mapped_column(String(50), default="SIC", nullable=True)
    flight_handling: Mapped[str] = mapped_column(String(20), default="PF", nullable=True)

    # Landings
    landings_day: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    landings_night: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Aircraft & Operations
    aircraft_reg: Mapped[str] = mapped_column(String(50), nullable=False)
    aircraft_type: Mapped[str] = mapped_column(String(20), nullable=False)
    approach_type: Mapped[str] = mapped_column(String(100), nullable=True)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)

    # Sync and tombstone management
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

    user = relationship("User", back_populates="flights")
