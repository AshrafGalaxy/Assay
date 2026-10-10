"""
Unit tests for DynamicReplanner and Constraint Relaxation Hierarchy (FIN 02 Addition 1).
Verifies:
- Scenario 1: -25% Salary Cut triggering Level 1/2 relaxations
- Scenario 2: +₹35,000 Medical Emergency Shock triggering conflict detection
- Scenario 3: Infeasible Target identifying structural deficits
"""

import pytest
from app.services.planning.replanner import DynamicReplanner
from app.schemas.planning import ReplanRequest


def test_dynamic_replanner_income_cut_shock():
    replanner = DynamicReplanner(declared_reserve_min=25000.0, horizon_months=6)

    starting_cash = 30000.0
    incomes = [75000.0] * 6
    essentials = [49500.0] * 6

    req = ReplanRequest(shock_type="income_cut", magnitude=0.25)
    res = replanner.evaluate_and_replan(
        starting_cash=starting_cash,
        baseline_incomes=incomes,
        baseline_essential=essentials,
        baseline_discretionary=16500.0,
        baseline_savings_goal=8000.0,
        shock_request=req,
    )

    assert res.conflict_detected is True
    assert "Month" in (res.conflict_description or "")
    assert len(res.proposed_relaxations) >= 1
    # Savings contribution relaxation must be Level 1
    assert res.proposed_relaxations[0].target == "Monthly Savings Contribution"
    assert len(res.rebalanced_period_balances) == 6


def test_dynamic_replanner_medical_shock():
    replanner = DynamicReplanner(declared_reserve_min=25000.0, horizon_months=6)

    starting_cash = 32000.0
    incomes = [75000.0] * 6
    essentials = [49500.0] * 6

    req = ReplanRequest(shock_type="medical_shock", magnitude=35000.0)
    res = replanner.evaluate_and_replan(
        starting_cash=starting_cash,
        baseline_incomes=incomes,
        baseline_essential=essentials,
        baseline_discretionary=16500.0,
        baseline_savings_goal=8000.0,
        shock_request=req,
    )

    assert "medical" in res.shock_applied.lower()
    assert res.conflict_detected is True
    assert len(res.proposed_relaxations) >= 1


def test_dynamic_replanner_infeasible_target():
    replanner = DynamicReplanner(declared_reserve_min=25000.0, horizon_months=6)

    starting_cash = 26000.0
    incomes = [50000.0] * 6
    essentials = [48000.0] * 6  # Essentials leave almost zero headroom

    req = ReplanRequest(shock_type="infeasible_target", magnitude=40000.0)
    res = replanner.evaluate_and_replan(
        starting_cash=starting_cash,
        baseline_incomes=incomes,
        baseline_essential=essentials,
        baseline_discretionary=16500.0,
        baseline_savings_goal=40000.0,
        shock_request=req,
    )

    assert res.conflict_detected is True
    assert res.status == "STRUCTURAL_DEFICIT"
    assert any("structural" in r.rationale.lower() for r in res.proposed_relaxations)
