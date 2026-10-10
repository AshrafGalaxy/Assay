from typing import List
from fastapi import APIRouter, Query
from app.schemas.financial_health import (
    RecommendationOut,
    RecommendationSimulateRequest,
    RecommendationSimulateResponse,
)
from app.services.financial_intelligence.engine import build_recommendations, simulate_reduction
from app.services.financial_intelligence.ledger import get_ledger_transactions

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _transactions(user_id: str | None):
    return get_ledger_transactions(user_id=user_id, historical_only=True)


@router.get("", response_model=List[RecommendationOut])
def list_recommendations(user_id: str | None = Query(None)):
    """Return rules-based recommendations grounded in observed synthetic transactions."""
    return [RecommendationOut(**item) for item in build_recommendations(_transactions(user_id))]


@router.post("/{recommendation_id}/simulate", response_model=RecommendationSimulateResponse)
def simulate_recommendation(
    recommendation_id: str,
    payload: RecommendationSimulateRequest,
    user_id: str | None = Query(None),
):
    """Simulate a reduction without changing the underlying ledger."""
    return RecommendationSimulateResponse(
        **simulate_reduction(
            _transactions(user_id),
            category=payload.assumption.category,
            monthly_reduction=payload.assumption.monthly_reduction,
        )
    )
