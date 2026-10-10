import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Boolean, Integer, DateTime, ForeignKey
from app.core.database import Base


class ForecastSettings(Base):
    __tablename__ = "forecast_settings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True, unique=True)
    horizon_months = Column(Integer, default=6)
    minimum_reserve = Column(Float, default=15000.0)
    include_income = Column(Boolean, default=True)
    include_essential = Column(Boolean, default=True)
    include_discretionary = Column(Boolean, default=True)
    include_debt = Column(Boolean, default=True)
    include_obligations = Column(Boolean, default=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
