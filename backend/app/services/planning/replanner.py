"""
Dynamic Replanning & Constraint Relaxation Engine (FIN 02 Addition 1).
Evaluates financial shocks and resolves constraint conflicts via a prioritized relaxation ladder:
- Scenario 1: -25% Salary Cut
- Scenario 2: +₹35,000 Medical Emergency Shock
- Scenario 3: Infeasible Savings Target (Essential obligations exceed available cash)
Explicitly identifies conflicts and proposed relaxations.
"""

from typing import List, Dict, Any, Optional
from app.schemas.planning import ReplanRequest, ReplanResponse, RelaxationItem


class DynamicReplanner:
    """Dynamic replanning service with prioritized constraint relaxation ladder."""

    def __init__(self, declared_reserve_min: float = 25000.0, horizon_months: int = 6):
        self.declared_reserve_min = declared_reserve_min
        self.horizon_months = horizon_months

    def evaluate_and_replan(
        self,
        starting_cash: float,
        baseline_incomes: List[float],
        baseline_essential: List[float],
        baseline_discretionary: float,
        baseline_savings_goal: float,
        shock_request: Optional[ReplanRequest] = None,
    ) -> ReplanResponse:
        """
        Simulates the requested shock, detects constraint conflicts against R_min,
        and applies the 3-tier relaxation hierarchy to restore solvency.
        """
        shock_type = shock_request.shock_type if shock_request else "income_cut"
        magnitude = shock_request.magnitude if (shock_request and shock_request.magnitude is not None) else None

        incomes = list(baseline_incomes[:self.horizon_months])
        essentials = list(baseline_essential[:self.horizon_months])
        T = len(incomes)

        shock_description = ""
        # 1. Apply Shock to Trajectory
        if shock_type == "income_cut":
            cut_ratio = magnitude if magnitude else 0.25
            shock_description = f"Sudden {int(cut_ratio * 100)}% reduction in monthly income across all {T} periods."
            incomes = [round(inc * (1.0 - cut_ratio), 2) for inc in incomes]

        elif shock_type == "medical_shock":
            # Default shock size: one month of observed essential spending.
            shock_val = magnitude if magnitude else (sum(essentials) / len(essentials) if essentials else 0.0)
            shock_description = f"Unexpected one-time medical emergency expense shock of ₹{shock_val:,.0f} in Month 2."
            if T > 1:
                essentials[1] = round(essentials[1] + shock_val, 2)
            else:
                essentials[0] = round(essentials[0] + shock_val, 2)

        elif shock_type == "infeasible_target":
            # Default target: more than the cash flow can support (all essential spending).
            target_val = magnitude if magnitude else (max(essentials) if essentials else 0.0)
            baseline_savings_goal = target_val
            shock_description = f"User imposed an aggressive savings target of ₹{target_val:,.0f}/month."

        else:
            shock_description = f"Custom scenario evaluated: {shock_type}"

        # 2. Check for Conflict under Unrelaxed Baseline Plan
        # Unrelaxed: pays baseline_discretionary + baseline_savings_goal
        conflict_detected = False
        conflict_period = -1
        unrelaxed_balance = starting_cash

        for t in range(T):
            net = incomes[t] - essentials[t] - baseline_discretionary - baseline_savings_goal
            unrelaxed_balance += net
            if unrelaxed_balance < self.declared_reserve_min:
                conflict_detected = True
                conflict_period = t + 1
                break

        # 3. Apply 3-Tier Relaxation Hierarchy
        proposed_relaxations: List[RelaxationItem] = []
        active_savings = baseline_savings_goal
        active_discretionary = baseline_discretionary
        status = "REBALANCED"

        if conflict_detected:
            # Level 1 Relaxation: Reduce Savings Contribution to absorb shock
            # Reduce savings down to 0 if needed
            savings_relief = min(active_savings, baseline_savings_goal)
            active_savings = max(0.0, baseline_savings_goal - savings_relief)
            proposed_relaxations.append(
                RelaxationItem(
                    target="Monthly Savings Contribution",
                    original_value=baseline_savings_goal,
                    relaxed_value=active_savings,
                    rationale=f"Level 1 Relaxation: Paused discretionary savings accumulation to prevent cash reserve breach in Month {conflict_period}."
                )
            )

            # Re-test solvency after Level 1
            solvency_restored = True
            test_balance = starting_cash
            for t in range(T):
                test_balance += incomes[t] - essentials[t] - active_discretionary - active_savings
                if test_balance < self.declared_reserve_min:
                    solvency_restored = False
                    break

            # Level 2 Relaxation: Trim Discretionary Spending if Level 1 is insufficient
            if not solvency_restored:
                # Halve discretionary spending; no fixed floor — the data decides.
                relaxed_discretionary = round(active_discretionary * 0.5, 2)
                proposed_relaxations.append(
                    RelaxationItem(
                        target="Discretionary Spending Cap",
                        original_value=active_discretionary,
                        relaxed_value=relaxed_discretionary,
                        rationale="Level 2 Relaxation: Halved the discretionary budget to protect the cash reserve."
                    )
                )
                active_discretionary = relaxed_discretionary

            # Level 3 Relaxation: Check if Structural Deficit persists (Essentials > Income)
            final_balance = starting_cash
            for t in range(T):
                final_balance += incomes[t] - essentials[t] - active_discretionary - active_savings
                if final_balance < self.declared_reserve_min:
                    status = "STRUCTURAL_DEFICIT"
                    break

            if status == "STRUCTURAL_DEFICIT":
                deficit_amount = round(self.declared_reserve_min - final_balance, 2)
                proposed_relaxations.append(
                    RelaxationItem(
                        target="Emergency Reserve Buffer",
                        original_value=self.declared_reserve_min,
                        relaxed_value=max(0.0, round(final_balance, 2)),
                        rationale=f"Level 3 Structural Deficit: Essential obligations exceed available cash flow by ₹{deficit_amount:,.2f}. Bridge financing or debt moratorium recommended."
                    )
                )

        # 4. Generate Rebalanced Period Balances
        rebalanced_balances: List[float] = []
        cur_bal = starting_cash
        for t in range(T):
            net = incomes[t] - essentials[t] - active_discretionary - active_savings
            cur_bal = round(cur_bal + net, 2)
            rebalanced_balances.append(cur_bal)

        conflict_msg = None
        if conflict_detected:
            conflict_msg = (
                f"Constraint violation identified in Month {conflict_period}: Net cash flow breached "
                f"your Safety Buffer of ₹{self.declared_reserve_min:,.0f} under the original plan."
            )

        # Shortfall risk after relaxation: the share of rebalanced periods below the reserve.
        below = sum(1 for b in rebalanced_balances if b < self.declared_reserve_min)
        shortfall_risk_after = round(100.0 * below / len(rebalanced_balances), 1) if rebalanced_balances else 0.0

        return ReplanResponse(
            shock_applied=shock_description,
            conflict_detected=conflict_detected,
            conflict_description=conflict_msg,
            proposed_relaxations=proposed_relaxations,
            rebalanced_period_balances=rebalanced_balances,
            ending_cash_balance=rebalanced_balances[-1] if rebalanced_balances else starting_cash,
            shortfall_risk_after_replan_pct=shortfall_risk_after,
            status=status,
        )
