import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from app.core.database import Base


class CopilotAuditLog(Base):
    __tablename__ = "copilot_audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    insight_id = Column(String, nullable=False, index=True)
    intent = Column(String, nullable=False)
    query = Column(String, nullable=False)
    model_version = Column(String, default="assay-engine-v2.1+rules-audited")
    data_snapshot = Column(Text, nullable=True)  # JSON-encoded snapshot of financial inputs
    assumptions = Column(Text, nullable=True)    # JSON-encoded list of assumptions
    findings = Column(Text, nullable=True)       # JSON-encoded structured findings
    recommendation = Column(Text, nullable=True) # JSON-encoded recommendation
    limitations = Column(Text, nullable=True)    # JSON-encoded limitations
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
    )
