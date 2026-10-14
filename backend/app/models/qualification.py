import uuid
from datetime import date
from sqlalchemy import String, Date, Text, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class Qualification(Base):
    __tablename__ = "qualifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False) # medical, check, document, custom
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="qualifications")
