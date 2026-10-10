from typing import List
from fastapi import APIRouter
from app.schemas.financial_health import (
    RecommendationOut,
    RecommendationSimulateRequest,
    RecommendationSimulateResponse,
)
from app.services.financial_intelligence.demo_ledger import get_demo_transactions
from app.services.financial_intelligence.engine import build_recommendations, simulate_reduction

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=List[RecommendationOut])
def list_recommendations():
    """Return rules-based recommendations grounded in observed transactions."""
    return [RecommendationOut(**item) for item in build_recommendations(get_demo_transactions())]


@router.post("/{recommendation_id}/simulate", response_model=RecommendationSimulateResponse)
def simulate_recommendation(recommendation_id: str, payload: RecommendationSimulateRequest):
    """Simulate a reduction without changing the underlying ledger."""
    return RecommendationSimulateResponse(**simulate_reduction(
        get_demo_transactions(),
        category=payload.assumption.category,
        monthly_reduction=payload.assumption.monthly_reduction,
    ))
