from datetime import date

from app.services.financial_intelligence.demo_ledger import get_demo_transactions
from app.services.financial_intelligence.engine import (
    build_cash_flow,
    build_financial_health,
    build_recommendations,
    detect_obligations,
    simulate_reduction,
)


def test_health_is_calculated_from_the_active_month():
    result = build_financial_health(get_demo_transactions(), as_of=date(2026, 9, 19))
    assert result["income"] == 85000.0
    assert result["spending"] == 50299.0
    assert result["savings"] == 34701.0
    assert result["health_score"] > 0


def test_cash_flow_has_three_chronological_months():
    result = build_cash_flow(get_demo_transactions())
    assert [item["month"] for item in result["monthly_summary"]] == ["Jul 2026", "Aug 2026", "Sep 2026"]


def test_obligations_are_recurring_debits_only():
    result = detect_obligations(get_demo_transactions())
    assert result["total_monthly_obligations"] == 27899.0
    assert len(result["items"]) == 3


def test_recommendation_and_simulation_are_grounded_in_observed_category_spend():
    recommendations = build_recommendations(get_demo_transactions())
    assert any(item["category"] == "Food & Dining" for item in recommendations)
    result = simulate_reduction(get_demo_transactions(), category="Food & Dining", monthly_reduction=2000)
    assert result["monthly_impact"] == 2000.0
    assert result["annualized_impact"] == 24000.0
