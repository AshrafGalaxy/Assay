from app.services.financial_intelligence.engine import simulate_what_if
from app.services.financial_intelligence.ledger import get_ledger_transactions, get_user_profile


def test_what_if_returns_two_plans_and_baseline():
    txs = get_ledger_transactions(historical_only=True)
    profile = get_user_profile()
    result = simulate_what_if(
        txs,
        assumptions={
            "horizon_months": 6,
            "discretionary_reduction_pct": 20,
            "extra_debt_payment": 2000,
            "savings_contribution_delta": 0,
            "income_change_pct": 0,
            "essential_expense_shock": 0,
        },
        profile=profile,
    )
    assert result["horizon_months"] == 6
    assert result["baseline"]["id"] == "baseline"
    assert {p["id"] for p in result["plans"]} == {"plan_a", "plan_b"}
    assert result["recommended_plan_id"] in {"plan_a", "plan_b"}
    assert len(result["plans"][0]["periods"]) == 6
    assert "reserve_breach_rate" in result["plans"][0]
    assert result["limitations"]


def test_what_if_rejects_invalid_horizon():
    txs = get_ledger_transactions(historical_only=True)
    try:
        simulate_what_if(txs, assumptions={"horizon_months": 2})
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "horizon_months" in str(exc)


def test_what_if_income_shock_changes_balances():
    txs = get_ledger_transactions(historical_only=True)
    profile = get_user_profile()
    base = simulate_what_if(
        txs,
        assumptions={"horizon_months": 3, "discretionary_reduction_pct": 10, "income_change_pct": 0},
        profile=profile,
    )
    shocked = simulate_what_if(
        txs,
        assumptions={"horizon_months": 3, "discretionary_reduction_pct": 10, "income_change_pct": -30},
        profile=profile,
    )
    assert shocked["plans"][0]["ending_balance"] < base["plans"][0]["ending_balance"]
