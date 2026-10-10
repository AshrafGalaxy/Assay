from datetime import date, datetime

from app.services.financial_intelligence.engine import (
    build_cash_flow,
    build_financial_health,
    build_recommendations,
    detect_obligations,
    simulate_reduction,
)
from app.services.financial_intelligence.ledger import get_ledger_transactions


def _txs():
    return get_ledger_transactions(historical_only=True)


def test_health_is_calculated_from_ledger(synthetic_ledger):
    txs = _txs()
    assert txs, "ephemeral synthetic fixture should provide transactions"
    latest = max(date.fromisoformat(item["transaction_date"]) for item in txs)
    result = build_financial_health(txs, as_of=latest)
    assert result["income"] >= 0
    assert result["spending"] >= 0
    assert "health_score" in result
    assert 0 <= result["health_score"] <= 100


def test_cash_flow_has_chronological_months(synthetic_ledger):
    result = build_cash_flow(_txs())
    months = [item["month"] for item in result["monthly_summary"]]
    assert months
    assert months == sorted(months, key=lambda label: datetime.strptime(label, "%b %Y"))


def test_obligations_are_recurring_debits_only(synthetic_ledger):
    result = detect_obligations(_txs())
    assert result["total_monthly_obligations"] >= 0
    for item in result["items"]:
        assert item["amount"] > 0
        assert item["frequency"] == "monthly"


def test_recommendation_and_simulation_are_grounded_in_observed_category_spend(synthetic_ledger):
    txs = _txs()
    recommendations = build_recommendations(txs)
    if recommendations:
        category = recommendations[0]["category"]
        result = simulate_reduction(txs, category=category, monthly_reduction=500)
        assert result["monthly_impact"] >= 0
        assert result["annualized_impact"] == round(result["monthly_impact"] * 12, 2)
    else:
        categories = {item["category"] for item in txs if item["type"] == "debit"}
        category = next(iter(categories))
        result = simulate_reduction(txs, category=category, monthly_reduction=100)
        assert "projected_monthly_buffer" in result
