"""Tests for the monthly Cash Flow Forecast endpoint / engine."""

from app.services.financial_intelligence.engine import build_cash_flow_forecast
from app.services.financial_intelligence.ledger import get_ledger_transactions, get_user_profile


def test_forecast_horizons_and_accounting():
    txs = get_ledger_transactions(historical_only=True)
    profile = get_user_profile()
    for horizon in (1, 3, 6):
        view = build_cash_flow_forecast(txs, horizon_months=horizon, profile=profile)
        assert view["horizon_months"] == horizon
        assert len(view["periods"]) == horizon
        assert view["is_projection"] is True
        assert view["forecast_updated_at"]
        assert view["shortfall_probability"] is not None
        assert 0.0 <= view["shortfall_probability"] <= 1.0
        assert view["shortfall_method"] in {
            "monte_carlo_income_noise",
            "deterministic_zero_volatility",
        }
        # Accounting identity on first period
        p0 = view["periods"][0]
        expected = (
            p0["opening_balance"]
            + p0["income"]
            - p0["essential_expenses"]
            - p0["discretionary_spending"]
            - p0["mandatory_debt"]
            - p0["additional_debt_repayment"]
            - p0["savings_contribution"]
        )
        assert abs(expected - p0["closing_balance"]) < 0.02
        assert view["insights"]
        assert view["limitations"]


def test_forecast_rejects_bad_horizon():
    txs = get_ledger_transactions(historical_only=True)
    try:
        build_cash_flow_forecast(txs, horizon_months=2)
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "horizon_months" in str(exc)


def test_forecast_api():
    from fastapi.testclient import TestClient
    from app.main import app

    response = TestClient(app).get("/api/v1/analytics/cash-flow/forecast?horizon_months=3")
    assert response.status_code == 200
    body = response.json()
    assert body["horizon_months"] == 3
    assert len(body["periods"]) == 3
    assert "shortfall_probability" in body
    assert body["risks"] is not None
    assert body["insights"]
