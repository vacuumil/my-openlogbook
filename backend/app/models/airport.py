from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class Airport(Base):
    __tablename__ = "airports"

    icao: Mapped[str] = mapped_column(String(4), primary_key=True, index=True)
    iata: Mapped[str] = mapped_column(String(3), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    timezone: Mapped[str] = mapped_column(String(100), default="UTC", nullable=False)
