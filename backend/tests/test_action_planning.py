"""
Unit tests for ActionPlanner and Decision-Flip Proof (FIN 02 Addition 1).
Verifies:
- Cash balance conservation over 6 periods
- Minimum cash reserve enforcement (R_min)
- Monte Carlo shortfall risk integration
- Decision-Flip proof where Sequence B flips to preferred over Sequence A under uncertainty
"""

import pytest
from app.services.planning.action_planner import ActionPlanner


def test_action_planner_simulation_and_decision_flip():
    planner = ActionPlanner(declared_reserve_min=25000.0, horizon_months=6)

    starting_cash = 45000.0
    incomes = [75000.0, 75000.0, 87000.0, 75000.0, 75000.0, 87000.0]
    essentials = [49500.0, 49500.0, 52000.0, 49500.0, 49500.0, 52000.0]

    sim_res = planner.compare_and_prove_decision_flip(
        starting_cash=starting_cash,
        incomes=incomes,
        essential_expenses=essentials,
    )

    seq_a = sim_res.sequence_a
    seq_b = sim_res.sequence_b

    # Verify period balance count
    assert len(seq_a.period_balances) == 6
    assert len(seq_b.period_balances) == 6

    # Verify cash conservation on Sequence A:
    # Period 1 balance: starting_cash + income_0 - ess_0 - disc_a - debt_a
    expected_p1 = starting_cash + incomes[0] - essentials[0] - seq_a.discretionary_budget_monthly - seq_a.debt_payment_monthly
    assert abs(seq_a.period_balances[0] - expected_p1) < 0.1

    # Verify Decision-Flip proof:
    # Sequence A must have high shortfall risk under downside uncertainty (> 20%)
    assert seq_a.shortfall_risk_pct > 20.0
    assert not seq_a.is_reserve_safe

    # Sequence B must have low shortfall risk (<= 10%)
    assert seq_b.shortfall_risk_pct <= 10.0
    assert seq_b.is_reserve_safe

    # Preference must flip to Sequence B
    assert sim_res.decision_flip_detected is True
    assert "Sequence B" in sim_res.preferred_sequence
    assert len(sim_res.decision_flip_explanation) > 50
