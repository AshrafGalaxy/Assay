"""
Intra-Month Spending Velocity & Micro-Nudge Engine (FIN 02 Pillar 2).
Tracks daily discretionary spend velocity, projects month-end cash buffer,
and issues proactive micro-nudges before minimum reserve breaches occur.
"""

from typing import Dict, Any, List
from datetime import date


class SpendVelocityEngine:
    """Computes daily burn velocity and behavioral micro-nudges."""

    def __init__(self, reserve_floor: float = None):
        self.reserve_floor = reserve_floor or 0.0

    def analyze_velocity(
        self,
        current_day: int,
        days_in_month: int,
        discretionary_spent_so_far: float,
        current_liquid_balance: float,
        upcoming_fixed_bills: float,
        monthly_discretionary_budget: float,
    ) -> Dict[str, Any]:
        """
        Computes the velocity metrics and generates targeted micro-nudges.
        """
        safe_day = max(1, min(current_day, days_in_month))
        days_remaining = max(0, days_in_month - safe_day)

        # 1. Daily spend velocity
        daily_velocity = round(discretionary_spent_so_far / safe_day, 2)

        # 2. Projected month-end spend
        projected_month_end_spend = round(discretionary_spent_so_far + (days_remaining * daily_velocity), 2)

        # 3. Projected trough and reserve cushion
        projected_ending_cash = round(
            current_liquid_balance - upcoming_fixed_bills - (days_remaining * daily_velocity), 2
        )
        reserve_cushion = round(projected_ending_cash - self.reserve_floor, 2)
        is_reserve_threatened = reserve_cushion < 0

        # 4. Safe recovery pace
        budget_remaining = max(0.0, monthly_discretionary_budget - discretionary_spent_so_far)
        safe_daily_cap = round(budget_remaining / max(1, days_remaining), 2) if days_remaining > 0 else 0.0

        # 5. Targeted Behavioral Micro-Nudge
        if is_reserve_threatened:
            severity = "critical" if projected_ending_cash < 0 else "warning"
            if severity == "critical":
                nudge = (
                    f"Spending Alert: At your current pace of ₹{daily_velocity:,.0f}/day, you will experience an overdraft "
                    f"of ₹{abs(projected_ending_cash):,.0f} before next payday. "
                    f"Recommended Action: Cap discretionary spending to ₹{safe_daily_cap:,.0f}/day for the next {days_remaining} days "
                    f"to lower your Risk of Running Short."
                )
            else:
                nudge = (
                    f"Safety Buffer alert: At your current pace of ₹{daily_velocity:,.0f}/day, Expected Cash drops to ₹{projected_ending_cash:,.0f}, "
                    f"₹{abs(reserve_cushion):,.0f} below your Safety Buffer of ₹{self.reserve_floor:,.0f}. "
                    f"Recommended Action: Tighten discretionary leisure spend to ₹{safe_daily_cap:,.0f}/day for the remaining {days_remaining} days."
                )
        else:
            severity = "safe"
            nudge = (
                f"On track: At ₹{daily_velocity:,.0f}/day, Expected Cash stays at ₹{projected_ending_cash:,.0f}, "
                f"with Money Above Buffer of ₹{reserve_cushion:,.0f} over your Safety Buffer of ₹{self.reserve_floor:,.0f}."
            )

        return {
            "current_day": safe_day,
            "days_remaining": days_remaining,
            "daily_velocity": daily_velocity,
            "projected_month_end_spend": projected_month_end_spend,
            "projected_ending_cash": projected_ending_cash,
            "reserve_floor": self.reserve_floor,
            "reserve_cushion": reserve_cushion,
            "is_reserve_threatened": is_reserve_threatened,
            "safe_daily_cap": safe_daily_cap,
            "severity": severity,
            "micro_nudge": nudge,
        }
