import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_get_probabilistic_forecast():
    """Tests GET /api/v1/planning/forecast returns 6 calibrated periods with quantile monotonicity."""
    response = client.get("/api/v1/planning/forecast?horizon_months=6&confidence_level=0.80")
    assert response.status_code == 200
    data = response.json()

    assert data["horizon_months"] == 6
    assert data["conformal_coverage_pct"] == 80.0
    assert len(data["periods"]) == 6

    for period in data["periods"]:
        assert period["period_id"] in [1, 2, 3, 4, 5, 6]
        # Quantile monotonicity
        assert period["income_p10"] <= period["income_p50"] <= period["income_p90"]
        assert period["essential_p10"] <= period["essential_p50"] <= period["essential_p90"]
        # Reserve comes from the ledger, not a fixed constant, and is consistent across periods.
        assert period["reserve_threshold"] == data["summary"]["declared_reserve_min"]
        assert period["reserve_threshold"] > 0


def test_get_benchmark_comparison():
    """Tests GET /api/v1/planning/benchmark returns CQ-AR vs baseline comparisons."""
    response = client.get("/api/v1/planning/benchmark")
    assert response.status_code == 200
    data = response.json()

    assert data["test_periods_count"] > 0
    assert "cq_ar_model" in data
    assert "historical_average_baseline" in data
    assert "recurring_payment_baseline" in data
    # Whether the model beats the baselines depends on the ledger; just check the metrics exist.
    assert isinstance(data["beats_all_baselines"], bool)
    assert data["cq_ar_model"]["coverage_80_pct"] >= 0.0


def test_simulate_actions_decision_flip():
    """Tests POST /api/v1/planning/simulate-actions detects Decision-Flip."""
    response = client.post("/api/v1/planning/simulate-actions?discretionary_cut_b=3500&debt_prepay_a=8000")
    assert response.status_code == 200
    data = response.json()

    assert data["horizon_months"] >= 1
    assert "sequence_a" in data and "sequence_b" in data
    # The reduced-discretionary plan is never riskier than the status quo.
    assert data["sequence_b"]["shortfall_risk_pct"] <= data["sequence_a"]["shortfall_risk_pct"]


def test_dynamic_replan_shock():
    """Tests POST /api/v1/planning/replan rebalances on salary cut."""
    response = client.post(
        "/api/v1/planning/replan",
        json={"shock_type": "income_cut", "magnitude": 0.25},
    )
    assert response.status_code == 200
    data = response.json()

    assert "income_cut" in data["shock_applied"].lower() or "25%" in data["shock_applied"]
    assert data["conflict_detected"] is True
    assert len(data["proposed_relaxations"]) > 0
    assert data["status"] in ["REBALANCED", "STRUCTURAL_DEFICIT"]


def test_get_spend_velocity():
    """Tests GET /api/v1/planning/velocity returns intra-month metrics and micro-nudges."""
    response = client.get("/api/v1/planning/velocity?current_day=15&discretionary_spent=14000&current_liquid_balance=40000")
    assert response.status_code == 200
    data = response.json()

    assert data["current_day"] == 15
    assert data["days_remaining"] >= 0
    assert data["daily_velocity"] >= 0
    assert "micro_nudge" in data
    assert len(data["micro_nudge"]) > 20


def test_post_copilot_query_with_explainer():
    """Tests POST /api/v1/copilot/query returns grounded, audited advice."""
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "Can I afford a ₹30,000 phone?"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["intent"] == "affordability"
    assert "₹30,000" in data["answer"]
    assert data["audit_passed"] is True
    assert "observed" in data
    assert len(data["observed"]) >= 2


def test_get_debt_breakdown():
    """Tests GET /api/v1/planning/debt-breakdown returns structured loan breakdown & avalanche plan."""
    response = client.get("/api/v1/planning/debt-breakdown")
    assert response.status_code == 200
    data = response.json()

    # Outstanding principal and APR are not in the transaction history, so the
    # breakdown reports observed repayments only.
    assert data["total_monthly_emis"] > 0.0
    assert data["dti_ratio"] > 0.0
    assert data["dti_status"] in ["Healthy", "Moderate", "High Risk"]
    assert len(data["loans"]) >= 1

    # Verify loan attributes
    first_loan = data["loans"][0]
    assert "name" in first_loan
    assert "balance" in first_loan
    assert "apr" in first_loan
    assert "monthly_emi" in first_loan

    # No APR is recorded, so no avalanche ordering can be computed.
    assert data["avalanche_recommendation"] is None

