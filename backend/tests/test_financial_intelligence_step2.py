"""Tests for Assay Financial Intelligence Step 2: Forecast Engine & Functional Features."""

from datetime import date

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.account import Account
from app.models.transaction import Transaction
from app.services.financial_intelligence.engine import (
    build_cash_flow_forecast,
    build_forecast_scenarios,
    calculate_affordability,
    get_upcoming_obligations_projection,
)
from app.services.financial_intelligence.ledger import get_ledger_transactions, get_user_profile

client = TestClient(app)


def test_forecast_reconciliation_across_periods():
    """Verify that closing balance of period t reconciles with opening balance of period t+1."""
    txs = get_ledger_transactions(historical_only=True)
    profile = get_user_profile()

    for horizon in (3, 6, 12):
        forecast = build_cash_flow_forecast(
            txs,
            horizon_months=horizon,
            profile=profile,
            opening_balance=50000.0,
            minimum_reserve=15000.0,
        )
        periods = forecast["periods"]
        assert len(periods) == horizon

        for i in range(len(periods) - 1):
            curr_period = periods[i]
            next_period = periods[i + 1]

            # Mathematical reconciliation
            assert abs(curr_period["closing_balance"] - next_period["opening_balance"]) < 0.01

            # Inflow/outflow reconciliation for period i
            calc_closing = (
                curr_period["opening_balance"]
                + curr_period["income"]
                - curr_period["essential_expenses"]
                - curr_period["discretionary_spending"]
                - curr_period["mandatory_debt"]
                - curr_period["additional_debt_repayment"]
                - curr_period["savings_contribution"]
            )
            assert abs(calc_closing - curr_period["closing_balance"]) < 0.02


def test_forecast_settings_persistence_api():
    """Verify GET and POST /settings/forecast persistence and validation."""
    # 1. Get default settings
    get_res = client.get("/api/v1/settings/forecast")
    assert get_res.status_code == 200
    data = get_res.json()
    assert "horizon_months" in data
    assert "minimum_reserve" in data

    # 2. Update settings
    payload = {
        "horizon_months": 12,
        "minimum_reserve": 20000.0,
        "include_income": True,
        "include_essential": True,
        "include_discretionary": False,
        "include_debt": True,
        "include_obligations": True,
    }
    post_res = client.post("/api/v1/settings/forecast", json=payload)
    assert post_res.status_code == 200
    saved = post_res.json()
    assert saved["horizon_months"] == 12
    assert saved["minimum_reserve"] == 20000.0
    assert saved["include_discretionary"] is False

    # 3. Verify retrieval reflects changes
    get_res2 = client.get("/api/v1/settings/forecast")
    assert get_res2.status_code == 200
    assert get_res2.json()["minimum_reserve"] == 20000.0
    assert get_res2.json()["include_discretionary"] is False

    # 4. Reject invalid horizon
    bad_res = client.post("/api/v1/settings/forecast", json={**payload, "horizon_months": 5})
    assert bad_res.status_code == 422


def test_scenario_analysis_api():
    """Verify Best, Expected, and Worst scenarios calculation."""
    res = client.get("/api/v1/analytics/cash-flow/scenarios?horizon_months=6")
    assert res.status_code == 200
    data = res.json()
    assert data["horizon_months"] == 6
    assert len(data["scenarios"]) == 3

    types = {s["type"] for s in data["scenarios"]}
    assert types == {"best", "expected", "worst"}

    best = next(s for s in data["scenarios"] if s["type"] == "best")
    expected = next(s for s in data["scenarios"] if s["type"] == "expected")
    worst = next(s for s in data["scenarios"] if s["type"] == "worst")

    # Best ending balance > Expected ending balance > Worst ending balance
    assert best["ending_balance"] > expected["ending_balance"]
    assert expected["ending_balance"] > worst["ending_balance"]

    assert "probability_of_running_out_of_cash" in data
    assert 0.0 <= data["probability_of_running_out_of_cash"] <= 1.0


def test_affordability_check_calculation():
    """Verify forward-looking affordability assessment."""
    # A purchase larger than the cash balance has to fail. ₹50,000 does not,
    # because the balance is the ledger total, not a small demo balance.
    res = client.post(
        "/api/v1/analytics/affordability",
        json={
            "purchase_amount": 10000000.0,
            "purchase_date": "2026-10-25",
            "expense_type": "onetime",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["purchase_amount"] == 10000000.0
    assert body["verdict"] in {"shortfall", "caution"}
    assert len(body["alternatives"]) >= 2

    # Scenario B: Small purchase staying above buffer
    res_small = client.post(
        "/api/v1/analytics/affordability",
        json={
            "purchase_amount": 500.0,
            "purchase_date": "2026-10-25",
            "expense_type": "onetime",
        },
    )
    assert res_small.status_code == 200
    body_small = res_small.json()
    assert body_small["verdict"] in {"affordable", "caution"}


def test_upcoming_obligations_projection_api():
    """Verify chronological obligations projection for 6M and 12M."""
    res6 = client.get("/api/v1/analytics/obligations?horizon_months=6")
    assert res6.status_code == 200
    data6 = res6.json()
    assert data6["horizon_months"] == 6
    assert data6["count"] > 0
    assert data6["total_commitments"] > 0
    today = date.today().isoformat()
    assert all(item["due_date_iso"] >= today for item in data6["obligations"])

    res12 = client.get("/api/v1/analytics/obligations?horizon_months=12")
    assert res12.status_code == 200
    data12 = res12.json()
    assert data12["horizon_months"] == 12
    # 12-month commitments should be greater than 6-month commitments
    assert data12["total_commitments"] >= data6["total_commitments"]


def test_internal_transfers_excluded_from_spending():
    """Verify internal account transfers do not count as spending."""
    db = SessionLocal()
    try:
        # Create a mock internal transfer
        tx = Transaction(
            amount=5000.0,
            type="debit",
            category="Transfer",
            merchant_name="Self Transfer to HDFC",
            transaction_date="2026-10-05",
            source_type="manual",
        )
        db.add(tx)
        db.commit()

        # Check spending breakdown
        spend_res = client.get("/api/v1/analytics/spending")
        assert spend_res.status_code == 200
        cats = [c["name"] for c in spend_res.json()["categories"]]
        assert "Transfer" not in cats

        # Clean up
        db.delete(tx)
        db.commit()
    finally:
        db.close()
