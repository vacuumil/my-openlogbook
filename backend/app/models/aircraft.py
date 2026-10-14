import uuid
from sqlalchemy import String, Boolean, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class Aircraft(Base):
    __tablename__ = "aircraft"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    registration: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    icao_type: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="Jet", nullable=False) # SEP, MEP, Jet, Turboprop, Helicopter
    is_multi_pilot: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user = relationship("User", back_populates="aircraft")
