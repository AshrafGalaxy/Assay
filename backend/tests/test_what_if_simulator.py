from app.services.financial_intelligence.engine import simulate_what_if
from app.services.financial_intelligence.ledger import get_ledger_transactions, get_user_profile


def test_what_if_returns_two_plans_and_baseline(synthetic_ledger):
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


def test_what_if_rejects_invalid_horizon(synthetic_ledger):
    txs = get_ledger_transactions(historical_only=True)
    try:
        simulate_what_if(txs, assumptions={"horizon_months": 2})
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "horizon_months" in str(exc)


def test_what_if_income_shock_changes_balances(synthetic_ledger):
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
    assert shocked["baseline"]["ending_balance"] <= base["baseline"]["ending_balance"]


def test_typed_amounts_move_only_the_revised_plan(synthetic_ledger):
    """Expected Cash stays on the ledger. Revised Expected Cash follows typed rupees."""
    txs = get_ledger_transactions(historical_only=True)
    profile = get_user_profile()
    base = simulate_what_if(txs, assumptions={"horizon_months": 6}, profile=profile)
    rate = base["baseline_run_rate"]
    assert base["status_quo"]["ending_balance"] == base["user_plan"]["ending_balance"]

    higher = simulate_what_if(
        txs,
        assumptions={
            "horizon_months": 6,
            "monthly_income": rate["income"],
            "monthly_spending": rate["essential"] + rate["discretionary"] + 5000,
            "monthly_debt": rate["emi"] + 500,
            "monthly_savings": rate["savings"],
            "one_time_expense": 0,
        },
        profile=profile,
    )
    assert higher["status_quo"]["ending_balance"] == base["status_quo"]["ending_balance"]
    assert higher["user_plan"]["ending_balance"] < higher["status_quo"]["ending_balance"]

    lower_spend = max(0.0, rate["essential"] + rate["discretionary"] - 4000)
    lower_debt = max(0.0, rate["emi"] - 400)
    lower = simulate_what_if(
        txs,
        assumptions={
            "horizon_months": 6,
            "monthly_income": rate["income"],
            "monthly_spending": lower_spend,
            "monthly_debt": lower_debt,
            "monthly_savings": rate["savings"],
            "one_time_expense": 0,
        },
        profile=profile,
    )
    assert lower["status_quo"]["ending_balance"] == base["status_quo"]["ending_balance"]
    assert lower["user_plan"]["ending_balance"] > lower["status_quo"]["ending_balance"]
