from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.copilot_audit import CopilotAuditLog
from app.schemas.financial_health import (
    CopilotInsightItem,
    CopilotQueryRequest,
    CopilotQueryResponse,
)
from app.services.financial_intelligence.copilot_engine import (
    execute_audited_copilot_query,
    get_proactive_audited_insights,
)

router = APIRouter(prefix="/copilot", tags=["copilot"])


@router.post("/query", response_model=CopilotQueryResponse)
def query_copilot(
    request: CopilotQueryRequest,
    db: Session = Depends(get_db),
):
    """
    Copilot query endpoint.
    Retrieves authorized financial facts, computes deterministic metrics,
    and returns an audited explanation with supporting evidence.
    """
    if not request.question or not request.question.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question must not be empty.",
        )

    result = execute_audited_copilot_query(
        question=request.question,
        db=db,
        user_id=request.user_id,
        context=request.context,
    )
    return CopilotQueryResponse(**result)


@router.get("/insights", response_model=List[CopilotInsightItem])
def get_copilot_insights(
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Retrieve prioritized, proactive audited financial insights for the authenticated user.
    """
    return get_proactive_audited_insights(db=db, user_id=user_id)


@router.get("/audit/{audit_id}")
def get_copilot_audit_record(
    audit_id: str,
    db: Session = Depends(get_db),
):
    """
    Retrieve audit verification record for a specific insight or recommendation.
    """
    record = db.query(CopilotAuditLog).filter(CopilotAuditLog.id == audit_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit record '{audit_id}' not found.",
        )
    return {
        "id": record.id,
        "insight_id": record.insight_id,
        "intent": record.intent,
        "query": record.query,
        "model_version": record.model_version,
        "data_snapshot": record.data_snapshot,
        "assumptions": record.assumptions,
        "findings": record.findings,
        "recommendation": record.recommendation,
        "limitations": record.limitations,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }

