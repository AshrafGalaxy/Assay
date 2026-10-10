"""Pure, explainable personal-finance calculations.

This module intentionally does not know about FastAPI, SQLAlchemy, or an LLM.
It accepts normalised transaction dictionaries, which makes it usable with the
synthetic ledger now and Supabase repositories later.
"""

from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Iterable

import numpy as np


def _money(value: float) -> float:
    return round(float(value), 2)


def _date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    val_str = str(value).strip().replace("Z", "+00:00")
    if val_str.lower().startswith("today"):
        return date.today()
    if val_str.lower().startswith("yesterday"):
        return date.today() - timedelta(days=1)
    try:
        return datetime.fromisoformat(val_str).date()
    except Exception:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d %b, %I:%M %p", "%d %b %Y"):
        try:
            return datetime.strptime(val_str, fmt).date()
        except Exception:
            continue
    return date.today()


def _month_key(value: date) -> tuple[int, int]:
    return value.year, value.month


def _month_label(value: tuple[int, int]) -> str:
    return date(value[0], value[1], 1).strftime("%b %Y")


def _transactions_for_month(
    transactions: Iterable[dict[str, Any]], month: tuple[int, int]
) -> list[dict[str, Any]]:
    return [transaction for transaction in transactions if _month_key(_date(transaction["transaction_date"])) == month]


def _previous_month(month: tuple[int, int]) -> tuple[int, int]:
    year, month_number = month
    return (year - 1, 12) if month_number == 1 else (year, month_number - 1)


def _category_spend(transactions: Iterable[dict[str, Any]]) -> dict[str, float]:
    totals: defaultdict[str, float] = defaultdict(float)
    for transaction in transactions:
        if transaction["type"] == "debit":
            cat = transaction.get("category") or "Other"
            totals[cat] += float(transaction["amount"])
    return {category: _money(amount) for category, amount in totals.items()}


def build_financial_health(
    transactions: list[dict[str, Any]], *, as_of: date | None = None
) -> dict[str, Any]:
    """Calculate a financial-health snapshot from the latest active month."""
    if not transactions:
        return {
            "income": 0.0, "spending": 0.0, "savings": 0.0, "savings_rate": 0.0,
            "fixed_expenses": 0.0, "variable_expenses": 0.0, "recurring_obligations": 0.0,
            "projected_month_end_balance": 0.0, "health_score": 0,
            "signals": [{"type": "insufficient_data", "description": "Add transactions to calculate financial health.", "severity": "info"}],
        }

    today = date.today()
    all_dates = [_date(transaction["transaction_date"]) for transaction in transactions]
    past_and_present = [d for d in all_dates if d <= today]
    target_date = max(past_and_present) if past_and_present else max(all_dates)
    effective_date = as_of or target_date
    active_month = _month_key(effective_date)
    active_transactions = _transactions_for_month(transactions, active_month)
    income = sum(float(transaction["amount"]) for transaction in active_transactions if transaction["type"] == "credit")
    spending = sum(float(transaction["amount"]) for transaction in active_transactions if transaction["type"] == "debit")
    fixed_expenses = sum(float(transaction["amount"]) for transaction in active_transactions if transaction["type"] == "debit" and transaction.get("is_fixed"))
    recurring_obligations = sum(float(transaction["amount"]) for transaction in active_transactions if transaction["type"] == "debit" and transaction.get("is_recurring"))
    savings = income - spending
    savings_rate = savings / income if income else 0.0

    days_in_month = monthrange(effective_date.year, effective_date.month)[1]
    daily_burn_rate = spending / effective_date.day if effective_date.day else 0.0
    projected_month_end_balance = income - (daily_burn_rate * days_in_month)
    variable_expenses = spending - fixed_expenses

    previous_spend = _category_spend(_transactions_for_month(transactions, _previous_month(active_month)))
    current_spend = _category_spend(active_transactions)
    signals: list[dict[str, Any]] = []
    largest_change = 0.0
    for category, amount in current_spend.items():
        prior_amount = previous_spend.get(category, 0.0)
        if prior_amount <= 0 or amount <= prior_amount:
            continue
        change_percent = ((amount - prior_amount) / prior_amount) * 100
        largest_change = max(largest_change, change_percent)
        if change_percent >= 20:
            signals.append({
                "type": "spending_increase", "category": category,
                "change_percent": _money(change_percent),
                "description": f"{category} spending is {_money(change_percent):.0f}% higher than last month.",
                "severity": "warning" if change_percent < 50 else "alert",
            })
    if savings_rate >= 0.2:
        signals.append({"type": "healthy_savings", "category": "Savings", "change_percent": _money(savings_rate * 100), "description": "You are saving at least 20% of this month's income.", "severity": "info"})
    # 2-cycle structural break / Life Shift detection across consecutive cycles
    prev_month_key = _previous_month(active_month)
    prev_prev_month_key = _previous_month(prev_month_key)
    prev_income = sum(float(tx["amount"]) for tx in _transactions_for_month(transactions, prev_month_key) if tx["type"] == "credit")
    prev_prev_income = sum(float(tx["amount"]) for tx in _transactions_for_month(transactions, prev_prev_month_key) if tx["type"] == "credit")
    if prev_prev_income > 0 and prev_income > 0:
        shift_m1 = (prev_income - prev_prev_income) / prev_prev_income
        shift_m0 = (income - prev_prev_income) / prev_prev_income if income > 0 else 0
        if shift_m1 >= 0.35 and shift_m0 >= 0.35:
            signals.insert(0, {
                "type": "structural_break_life_shift",
                "category": "Income",
                "change_percent": _money(shift_m0 * 100),
                "description": f"Life Shift Detected: Income surged by {_money(shift_m0 * 100):.0f}% across consecutive cycles. Models adapted to new baseline.",
                "severity": "info",
            })

    if not signals:
        signals.append({"type": "stable_spending", "description": "No material spending increase was detected against the prior month.", "severity": "info"})

    fixed_ratio = fixed_expenses / income if income else 1.0
    score = 100
    if savings_rate < 0:
        score -= 35
    elif savings_rate < 0.1:
        score -= 25
    elif savings_rate < 0.2:
        score -= 10
    if fixed_ratio > 0.6:
        score -= 15
    if projected_month_end_balance < 0:
        score -= 25
    if largest_change >= 50:
        score -= 10

    return {
        "income": _money(income), "spending": _money(spending), "savings": _money(savings),
        "savings_rate": round(savings_rate, 4), "fixed_expenses": _money(fixed_expenses),
        "variable_expenses": _money(variable_expenses), "recurring_obligations": _money(recurring_obligations),
        "projected_month_end_balance": _money(projected_month_end_balance), "health_score": max(0, min(100, score)),
        "signals": signals,
    }


def build_cash_flow(transactions: list[dict[str, Any]], *, months: int = 3) -> dict[str, Any]:
    """Create chronological monthly cash-flow totals and a month-end projection."""
    if not transactions:
        return {"monthly_summary": [], "projected_month_end": 0.0, "daily_burn_rate": 0.0}
    all_months = sorted({_month_key(_date(transaction["transaction_date"])) for transaction in transactions})[-months:]
    summary = []
    for month in all_months:
        entries = _transactions_for_month(transactions, month)
        inflow = sum(float(transaction["amount"]) for transaction in entries if transaction["type"] == "credit")
        outflow = sum(float(transaction["amount"]) for transaction in entries if transaction["type"] == "debit")
        summary.append({"month": _month_label(month), "inflow": _money(inflow), "outflow": _money(outflow), "net": _money(inflow - outflow)})
    health = build_financial_health(transactions)
    active_day = max(_date(transaction["transaction_date"]) for transaction in transactions).day
    return {
        "monthly_summary": summary,
        "projected_month_end": health["projected_month_end_balance"],
        "daily_burn_rate": _money(health["spending"] / active_day),
    }


def detect_obligations(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    """Return current-month recurring debit transactions as obligations."""
    if not transactions:
        return {"total_monthly_obligations": 0.0, "items": []}
    active_month = _month_key(max(_date(transaction["transaction_date"]) for transaction in transactions))
    recurring = [
        transaction for transaction in _transactions_for_month(transactions, active_month)
        if transaction["type"] == "debit" and transaction.get("is_recurring")
    ]
    items = [
        {
            "id": transaction.get("id", f"obligation_{index}"), "name": transaction["merchant_name"],
            "amount": _money(transaction["amount"]), "frequency": "monthly",
            "due_day": _date(transaction["transaction_date"]).day,
            "category": transaction["category"],
        }
        for index, transaction in enumerate(recurring, start=1)
    ]
    return {"total_monthly_obligations": _money(sum(item["amount"] for item in items)), "items": items}


def build_recommendations(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Generate explainable recommendations from observed monthly spending."""
    if not transactions:
        return []
    active_month = _month_key(max(_date(transaction["transaction_date"]) for transaction in transactions))
    active_transactions = _transactions_for_month(transactions, active_month)
    current_spend = _category_spend(active_transactions)
    previous_spend = _category_spend(_transactions_for_month(transactions, _previous_month(active_month)))
    recommendations = []
    for category, amount in sorted(current_spend.items(), key=lambda item: item[1], reverse=True):
        discretionary_amount = sum(
            float(transaction["amount"]) for transaction in active_transactions
            if transaction["type"] == "debit" and transaction["category"] == category and transaction.get("is_discretionary")
        )
        prior_amount = previous_spend.get(category, 0.0)
        increase = ((amount - prior_amount) / prior_amount) if prior_amount else 0.0
        if discretionary_amount <= 0 and increase < 0.2:
            continue
        potential = _money(discretionary_amount * 0.15 if discretionary_amount else amount * 0.1)
        if potential <= 0:
            continue
        action_type = "subscription_audit" if category == "Subscriptions" else "spending_reduction"
        reason = f"{category} is {increase * 100:.0f}% higher than last month" if increase >= 0.2 else f"{category} includes ₹{discretionary_amount:,.0f} of discretionary spending"
        recommendations.append({
            "id": f"rec_{category.lower().replace(' ', '_').replace('&', 'and')}",
            "title": f"Review {category} spending", "category": category,
            "potential_monthly_savings": potential,
            "impact_description": f"{reason}. Reducing it by 15% could free about ₹{potential:,.0f} each month.",
            "action_type": action_type,
        })
    return recommendations[:3]


def simulate_reduction(transactions: list[dict[str, Any]], *, category: str, monthly_reduction: float) -> dict[str, Any]:
    """Calculate a transparent what-if result without mutating transaction data."""
    if monthly_reduction <= 0:
        raise ValueError("monthly_reduction must be greater than zero")
    health = build_financial_health(transactions)
    current_spend = _category_spend(_transactions_for_month(
        transactions, _month_key(max(_date(transaction["transaction_date"]) for transaction in transactions))
    ))
    observed_category_spend = current_spend.get(category, 0.0)
    applied_reduction = min(monthly_reduction, observed_category_spend)
    return {
        "baseline_monthly_buffer": health["projected_month_end_balance"],
        "projected_monthly_buffer": _money(health["projected_month_end_balance"] + applied_reduction),
        "monthly_impact": _money(applied_reduction), "annualized_impact": _money(applied_reduction * 12),
        "confidence": 0.8 if observed_category_spend else 0.4,
        "assumption": f"{category} spending is reduced by ₹{applied_reduction:,.0f} per month.",
    }


def _baseline_run_rate(transactions: list[dict[str, Any]]) -> dict[str, float]:
    """Derive monthly run-rates from observed ledger history (does not mutate records)."""
    if not transactions:
        return {
            "income": 0.0, "essential": 0.0, "discretionary": 0.0,
            "emi": 0.0, "savings": 0.0, "opening": 0.0,
        }
    cash = build_cash_flow(transactions, months=6)
    months = cash["monthly_summary"] or []
    n = max(1, len(months))
    income = sum(item["inflow"] for item in months) / n

    essential = 0.0
    discretionary = 0.0
    emi = 0.0
    savings = 0.0
    for tx in transactions:
        if tx["type"] != "debit":
            continue
        amount = float(tx["amount"])
        category = str(tx.get("category", ""))
        if category in {"Debt & EMI", "Debt"}:
            emi += amount
        elif category == "Savings Transfer":
            savings += amount
        elif tx.get("is_discretionary"):
            discretionary += amount
        else:
            essential += amount

    # Average across distinct months present in the ledger.
    month_count = len({_month_key(_date(tx["transaction_date"])) for tx in transactions}) or 1
    health = build_financial_health(transactions)
    return {
        "income": _money(income),
        "essential": _money(essential / month_count),
        "discretionary": _money(discretionary / month_count),
        "emi": _money(emi / month_count),
        "savings": _money(savings / month_count),
        "opening": _money(health["projected_month_end_balance"]),
    }


def _project_plan_path(
    *,
    opening: float,
    income: float,
    essential: float,
    discretionary: float,
    emi: float,
    savings: float,
    extra_debt: float,
    essential_shock: float,
    minimum_reserve: float,
    horizon: int,
    income_volatility: float,
) -> dict[str, Any]:
    """Project month-by-month closing balances for one action plan."""
    periods: list[dict[str, Any]] = []
    balance = opening
    cumulative_savings = 0.0
    cumulative_extra_debt = 0.0
    debt_remaining = _money(emi * horizon * 1.5)  # opaque outstanding proxy when loan terms absent
    violations: list[dict[str, Any]] = []

    for index in range(horizon):
        period_essential = essential + (essential_shock if index == 0 else 0.0)
        period_emi = emi
        period_extra = max(0.0, extra_debt)
        period_disc = max(0.0, discretionary)
        planned_savings = max(0.0, savings)

        required = period_essential + period_emi
        available_after_required = balance + income - required
        # Hard constraint: mandatory obligations are always paid (may drive balance negative).
        cash_before_flex = _money(available_after_required - period_disc - period_extra)
        realized_savings = _money(min(planned_savings, max(0.0, cash_before_flex)))
        closing = _money(
            balance + income - period_essential - period_disc - period_emi - period_extra - realized_savings
        )

        reserve_violated = closing < minimum_reserve
        headroom = _money(closing - minimum_reserve)
        if reserve_violated:
            violations.append({
                "period_index": index + 1,
                "period_label": f"M{index + 1}",
                "type": "reserve_breach",
                "severity": "critical",
                "required_cash": minimum_reserve,
                "available_cash": closing,
                "deficit": _money(minimum_reserve - closing),
                "reason": (
                    f"Closing cash {closing:,.2f} falls below minimum reserve "
                    f"{minimum_reserve:,.2f} after mandatory payments."
                ),
                "corrective_actions": [
                    "Reduce discretionary spending further",
                    "Lower additional debt repayment",
                    "Reduce planned savings contribution",
                    "Increase eligible income",
                ],
            })

        if available_after_required < 0:
            violations.append({
                "period_index": index + 1,
                "period_label": f"M{index + 1}",
                "type": "mandatory_shortfall",
                "severity": "critical",
                "required_cash": required,
                "available_cash": _money(balance + income),
                "deficit": _money(abs(available_after_required)),
                "reason": "Income plus opening cash cannot cover essential expenses and mandatory EMI.",
                "corrective_actions": [
                    "Increase income",
                    "Reduce essential non-mandatory costs if possible",
                    "Restructure debt outside this simulator",
                ],
            })

        band = _money(income * max(0.0, income_volatility))
        cumulative_savings = _money(cumulative_savings + realized_savings)
        cumulative_extra_debt = _money(cumulative_extra_debt + period_extra)
        debt_remaining = _money(max(0.0, debt_remaining - period_emi - period_extra))

        periods.append({
            "period_index": index + 1,
            "period_label": f"M{index + 1}",
            "opening_balance": _money(balance),
            "income": _money(income),
            "essential_expenses": _money(period_essential),
            "mandatory_debt": _money(period_emi),
            "additional_debt_repayment": _money(period_extra),
            "discretionary_spending": _money(period_disc),
            "savings_contribution": realized_savings,
            "planned_savings": _money(planned_savings),
            "closing_balance": closing,
            "minimum_reserve": _money(minimum_reserve),
            "reserve_violated": reserve_violated,
            "reserve_headroom": headroom,
            # Transparent volatility band (not a calibrated ML interval).
            "balance_low": _money(closing - band),
            "balance_high": _money(closing + band),
            "debt_remaining": debt_remaining,
        })
        balance = closing

    closings = [p["closing_balance"] for p in periods]
    breach_count = sum(1 for p in periods if p["reserve_violated"])
    # Documented metric: share of projected periods below reserve (not a Bayesian probability).
    reserve_breach_rate = breach_count / horizon if horizon else 0.0
    infeasible = any(v["type"] == "mandatory_shortfall" for v in violations)

    return {
        "periods": periods,
        "ending_balance": closings[-1] if closings else opening,
        "minimum_balance": min(closings) if closings else opening,
        "reserve_breach_rate": round(reserve_breach_rate, 4),
        "periods_below_reserve": breach_count,
        "cumulative_savings": cumulative_savings,
        "cumulative_extra_debt": cumulative_extra_debt,
        "debt_remaining": debt_remaining,
        "violations": violations,
        "feasible": not infeasible,
        "interest_saved_estimate": None,  # requires loan APR terms not present in ledger
    }


def simulate_what_if(
    transactions: list[dict[str, Any]],
    *,
    assumptions: dict[str, Any],
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compare baseline vs Protect Liquidity vs Accelerate Debt under scenario assumptions.

    Does not mutate the underlying transaction ledger. Shortfall risk is reported as the
    share of projected periods with closing cash below the minimum reserve — a transparent
    period-count metric, not a calibrated probabilistic model.
    """
    horizon = int(assumptions.get("horizon_months") or 6)
    if horizon not in {1, 3, 6}:
        raise ValueError("horizon_months must be 1, 3, or 6")

    disc_reduction_pct = float(assumptions.get("discretionary_reduction_pct") or 0.0)
    if not 0 <= disc_reduction_pct <= 90:
        raise ValueError("discretionary_reduction_pct must be between 0 and 90")

    extra_debt = max(0.0, float(assumptions.get("extra_debt_payment") or 0.0))
    savings_delta = float(assumptions.get("savings_contribution_delta") or 0.0)
    income_change_pct = float(assumptions.get("income_change_pct") or 0.0)
    if not -50 <= income_change_pct <= 50:
        raise ValueError("income_change_pct must be between -50 and 50")
    essential_shock = max(0.0, float(assumptions.get("essential_expense_shock") or 0.0))

    profile = profile or {}
    run_rate = _baseline_run_rate(transactions)
    minimum_reserve = float(
        assumptions["minimum_reserve"]
        if assumptions.get("minimum_reserve") is not None
        else profile.get("minimum_reserve", max(10000.0, run_rate["income"] * 0.25))
    )
    savings_target = float(
        assumptions["savings_target"]
        if assumptions.get("savings_target") is not None
        else profile.get("savings_target", run_rate["savings"] * horizon)
    )
    income_volatility = float(profile.get("income_volatility") or 0.05)
    opening = run_rate["opening"]

    base_income = _money(run_rate["income"] * (1.0 + income_change_pct / 100.0))
    base_essential = run_rate["essential"]
    base_disc = run_rate["discretionary"]
    base_emi = run_rate["emi"] if run_rate["emi"] > 0 else float(profile.get("monthly_emi") or 0.0)
    base_savings = max(0.0, run_rate["savings"] + savings_delta)

    reduced_disc = _money(base_disc * (1.0 - disc_reduction_pct / 100.0))

    # Baseline: current trajectory with scenario income/shock/reserve, no strategy tweaks.
    baseline = _project_plan_path(
        opening=opening,
        income=base_income,
        essential=base_essential,
        discretionary=base_disc,
        emi=base_emi,
        savings=base_savings,
        extra_debt=0.0,
        essential_shock=essential_shock,
        minimum_reserve=minimum_reserve,
        horizon=horizon,
        income_volatility=income_volatility,
    )
    baseline.update({
        "id": "baseline",
        "name": "Current trajectory",
        "summary": "Continue observed discretionary, savings, and mandatory debt patterns under the scenario assumptions.",
        "trade_offs": ["No additional discipline beyond current habits", "Higher shortfall exposure if shocks persist"],
    })

    # Plan A — Protect Liquidity
    plan_a_savings = _money(max(base_savings, reduced_disc * 0.25))
    plan_a = _project_plan_path(
        opening=opening,
        income=base_income,
        essential=base_essential,
        discretionary=reduced_disc,
        emi=base_emi,
        savings=plan_a_savings,
        extra_debt=0.0,
        essential_shock=essential_shock,
        minimum_reserve=minimum_reserve,
        horizon=horizon,
        income_volatility=income_volatility,
    )
    plan_a.update({
        "id": "plan_a",
        "name": "Protect Liquidity",
        "summary": (
            f"Cut discretionary spending by {disc_reduction_pct:.0f}% , preserve mandatory EMI, "
            "and prioritise cash reserve before aggressive debt prepayment."
        ),
        "trade_offs": [
            "Slower debt payoff than Plan B",
            "Lifestyle spend is constrained",
            "Savings continue when cash allows",
        ],
    })

    # Plan B — Accelerate Debt Repayment
    plan_b_extra = _money(extra_debt if extra_debt > 0 else max(1000.0, reduced_disc * 0.35))
    plan_b_savings = _money(max(0.0, base_savings * 0.5))
    plan_b = _project_plan_path(
        opening=opening,
        income=base_income,
        essential=base_essential,
        discretionary=reduced_disc,
        emi=base_emi,
        savings=plan_b_savings,
        extra_debt=plan_b_extra,
        essential_shock=essential_shock,
        minimum_reserve=minimum_reserve,
        horizon=horizon,
        income_volatility=income_volatility,
    )
    plan_b.update({
        "id": "plan_b",
        "name": "Accelerate Debt Repayment",
        "summary": (
            f"Apply about ₹{plan_b_extra:,.0f}/mo extra toward debt while keeping a reduced discretionary budget. "
            "Savings contributions are tempered to fund repayment."
        ),
        "trade_offs": [
            "Higher liquidity risk vs Plan A",
            "Lower near-term savings progress",
            "Faster debt balance reduction",
        ],
    })

    # Savings-target feasibility under Plan A constraints (Disc already reduced, extra debt 0).
    max_feasible_savings = plan_a["cumulative_savings"]
    target_feasible = max_feasible_savings + 1e-9 >= savings_target
    if not target_feasible:
        plan_a["violations"] = list(plan_a["violations"]) + [{
            "period_index": horizon,
            "period_label": f"M{horizon}",
            "type": "savings_target_infeasible",
            "severity": "warning",
            "required_cash": savings_target,
            "available_cash": max_feasible_savings,
            "deficit": _money(savings_target - max_feasible_savings),
            "reason": "Savings target exceeds cumulative contributions feasible while holding the reserve.",
            "corrective_actions": [
                "Lower the savings target",
                "Extend the target timeline",
                "Increase income or reduce essentials",
            ],
        }]

    candidates = [plan_a, plan_b]
    # Prefer feasible plans with lower reserve breach rate, then higher ending balance.
    def _score(plan: dict[str, Any]) -> tuple:
        return (
            1 if plan["feasible"] else 0,
            -plan["reserve_breach_rate"],
            plan["minimum_balance"],
            plan["ending_balance"],
        )

    recommended = max(candidates, key=_score)
    preference_reason = (
        f"{recommended['name']} is preferred because it is "
        f"{'feasible' if recommended['feasible'] else 'the least infeasible'}, "
        f"with a reserve-breach period share of {recommended['reserve_breach_rate'] * 100:.1f}% "
        f"and a minimum projected balance of ₹{recommended['minimum_balance']:,.0f}."
    )

    what_changed: list[str] = []
    if income_change_pct:
        what_changed.append(f"Income assumption adjusted by {income_change_pct:+.1f}%.")
    if disc_reduction_pct:
        what_changed.append(f"Discretionary spend reduced by {disc_reduction_pct:.0f}% in both plans.")
    if essential_shock:
        what_changed.append(f"One-time essential shock of ₹{essential_shock:,.0f} applied in month 1.")
    if extra_debt:
        what_changed.append(f"Extra debt repayment lever set to ₹{extra_debt:,.0f}/mo (Plan B uses at least this).")
    if savings_delta:
        what_changed.append(f"Planned savings contribution changed by ₹{savings_delta:,.0f}/mo.")
    if assumptions.get("minimum_reserve") is not None:
        what_changed.append(f"Minimum reserve set to ₹{minimum_reserve:,.0f}.")
    if not what_changed:
        what_changed.append("No scenario deltas beyond strategy defaults; comparing plan behaviours on current run-rates.")

    limitations = [
        "Projections use observed monthly run-rates from the synthetic ledger; they are not a calibrated ML forecast.",
        "reserve_breach_rate is the share of projected periods below the reserve — not a Bayesian default probability.",
        "balance_low/balance_high apply a simple income-volatility band from the user profile.",
        "Interest saved is unavailable without loan APR / tenure terms in the ledger.",
        "Historical transactions are never mutated by this simulation.",
    ]

    return {
        "forecast_updated_at": date.today().isoformat(),
        "horizon_months": horizon,
        "minimum_reserve": _money(minimum_reserve),
        "savings_target": _money(savings_target),
        "savings_target_feasible": target_feasible,
        "income_volatility": income_volatility,
        "opening_balance": _money(opening),
        "baseline_run_rate": run_rate,
        "assumptions": {
            "horizon_months": horizon,
            "discretionary_reduction_pct": disc_reduction_pct,
            "extra_debt_payment": _money(extra_debt),
            "savings_contribution_delta": _money(savings_delta),
            "income_change_pct": income_change_pct,
            "essential_expense_shock": _money(essential_shock),
            "minimum_reserve": _money(minimum_reserve),
            "savings_target": _money(savings_target),
        },
        "baseline": baseline,
        "plans": [plan_a, plan_b],
        "recommended_plan_id": recommended["id"],
        "preference_reason": preference_reason,
        "what_changed": what_changed,
        "limitations": limitations,
        "data_quality": {
            "transaction_count": len(transactions),
            "sufficient_history": len(transactions) >= 12,
            "opening_below_reserve": opening < minimum_reserve,
        },
    }


def _estimate_shortfall_risk(
    *,
    opening: float,
    income: float,
    essential: float,
    discretionary: float,
    emi: float,
    savings: float,
    minimum_reserve: float,
    horizon: int,
    income_volatility: float,
    n_paths: int = 200,
    seed: int = 42,
) -> dict[str, Any]:
    """Monte Carlo shortfall risk under income noise (documented, reproducible).

    Method: for each path, sample monthly income ~ Normal(μ=income, σ=income·vol),
    clip at 0, then roll the same deterministic cash identity used by `_project_plan_path`.
    shortfall_probability = share of paths where any period closing < minimum_reserve.
    expected_shortfall = mean over paths of max(0, reserve − path minimum closing).

    This is a scenario-simulation estimate, not a calibrated Bayesian default probability.
    """
    if horizon <= 0 or n_paths <= 0:
        return {
            "shortfall_probability": None,
            "expected_shortfall": None,
            "method": "unavailable",
            "n_paths": 0,
            "note": "Insufficient inputs for shortfall simulation.",
        }

    vol = max(0.0, float(income_volatility))
    if income <= 0 and vol <= 0:
        # Deterministic zero-income path — probability is 0 or 1 from a single trajectory.
        path = _project_plan_path(
            opening=opening,
            income=income,
            essential=essential,
            discretionary=discretionary,
            emi=emi,
            savings=savings,
            extra_debt=0.0,
            essential_shock=0.0,
            minimum_reserve=minimum_reserve,
            horizon=horizon,
            income_volatility=0.0,
        )
        breached = path["periods_below_reserve"] > 0
        deficit = max(0.0, minimum_reserve - path["minimum_balance"])
        return {
            "shortfall_probability": 1.0 if breached else 0.0,
            "expected_shortfall": _money(deficit if breached else 0.0),
            "method": "deterministic_zero_volatility",
            "n_paths": 1,
            "note": "Income volatility is zero; risk collapses to the single projected path.",
        }

    rng = np.random.default_rng(seed)
    sigma = max(income * vol, 1.0)
    breach_flags: list[bool] = []
    deficits: list[float] = []

    for _ in range(n_paths):
        balance = opening
        path_min = opening
        breached = False
        for _month in range(horizon):
            sampled_income = float(max(0.0, rng.normal(income, sigma)))
            required = essential + emi
            cash_before_flex = balance + sampled_income - required - discretionary
            realized_savings = min(savings, max(0.0, cash_before_flex))
            closing = balance + sampled_income - essential - discretionary - emi - realized_savings
            path_min = min(path_min, closing)
            if closing < minimum_reserve:
                breached = True
            balance = closing
        breach_flags.append(breached)
        deficits.append(max(0.0, minimum_reserve - path_min))

    probability = sum(1 for flag in breach_flags if flag) / n_paths
    return {
        "shortfall_probability": round(probability, 4),
        "expected_shortfall": _money(float(np.mean(deficits))),
        "method": "monte_carlo_income_noise",
        "n_paths": n_paths,
        "note": (
            f"Income each month drawn from Normal(μ=run-rate income, σ=income×{vol:.3f}); "
            "essentials/EMI/discretionary/savings held at run-rate. Seeded for reproducibility."
        ),
    }


def _build_forecast_risks(
    *,
    path: dict[str, Any],
    run_rate: dict[str, float],
    shortfall: dict[str, Any],
    data_quality: dict[str, Any],
    income_volatility: float,
    minimum_reserve: float,
    savings_target: float,
    savings_target_feasible: bool,
) -> list[dict[str, Any]]:
    risks: list[dict[str, Any]] = []
    periods = path["periods"]

    if data_quality.get("opening_below_reserve"):
        risks.append({
            "id": "opening_below_reserve",
            "severity": "critical",
            "title": "Opening cash already below reserve",
            "what": f"Current opening balance is below the declared reserve of ₹{minimum_reserve:,.0f}.",
            "when": "Now (period M1 opening)",
            "factors": ["Opening balance", "Minimum reserve"],
            "impact": "Immediate liquidity constraint before any forecast month completes.",
            "action": "Open the What-If Simulator to cut discretionary spend or pause extra savings.",
        })

    for violation in path.get("violations") or []:
        if violation["type"] == "reserve_breach":
            risks.append({
                "id": f"reserve_breach_m{violation['period_index']}",
                "severity": "critical",
                "title": f"Reserve breach projected in {violation['period_label']}",
                "what": violation["reason"],
                "when": violation["period_label"],
                "factors": ["Essential expenses", "Mandatory debt", "Discretionary spending", "Income"],
                "impact": f"Expected deficit versus reserve: ₹{violation['deficit']:,.0f}.",
                "action": "Investigate discretionary cuts and EMI timing in the What-If Simulator.",
            })
        elif violation["type"] == "mandatory_shortfall":
            risks.append({
                "id": f"mandatory_shortfall_m{violation['period_index']}",
                "severity": "critical",
                "title": f"Cannot cover essentials + EMI in {violation['period_label']}",
                "what": violation["reason"],
                "when": violation["period_label"],
                "factors": ["Income", "Essential expenses", "Mandatory debt"],
                "impact": f"Mandatory shortfall of ₹{violation['deficit']:,.0f}.",
                "action": "Increase income assumptions or reduce non-mandatory essentials in What-If.",
            })

    income = run_rate["income"]
    mandatory = run_rate["essential"] + run_rate["emi"]
    if income > 0 and mandatory > income:
        risks.append({
            "id": "income_below_mandatory",
            "severity": "critical",
            "title": "Income below essential costs and EMI",
            "what": (
                f"Run-rate income ₹{income:,.0f} does not cover essentials ₹{run_rate['essential']:,.0f} "
                f"+ EMI ₹{run_rate['emi']:,.0f}."
            ),
            "when": "Every projected month under current run-rates",
            "factors": ["Income", "Essential expenses", "Mandatory debt"],
            "impact": "Structural deficit before discretionary spend or savings.",
            "action": "Review income variability and fixed obligations; stress-test in What-If.",
        })

    if income_volatility >= 0.15:
        risks.append({
            "id": "elevated_income_volatility",
            "severity": "elevated",
            "title": "Elevated income variability",
            "what": f"Profile income volatility is {income_volatility * 100:.1f}%.",
            "when": "Across the forecast horizon",
            "factors": ["Income volatility"],
            "impact": (
                f"Monte Carlo shortfall probability ≈ "
                f"{(shortfall.get('shortfall_probability') or 0) * 100:.1f}% "
                f"({shortfall.get('method')})."
            ),
            "action": "Prefer Protect Liquidity plans and keep a higher cash buffer.",
        })

    available_after_mandatory = income - mandatory
    if income > 0 and available_after_mandatory < run_rate["discretionary"] * 0.25:
        risks.append({
            "id": "limited_savings_capacity",
            "severity": "elevated",
            "title": "Limited capacity to save",
            "what": (
                f"After essentials and EMI, about ₹{max(0.0, available_after_mandatory):,.0f}/mo remains "
                f"before discretionary spend of ₹{run_rate['discretionary']:,.0f}."
            ),
            "when": "Each month under current habits",
            "factors": ["Discretionary spending", "Mandatory outflows"],
            "impact": "Savings contributions are easily crowded out.",
            "action": "Reduce discretionary spending in the What-If Simulator.",
        })

    if not savings_target_feasible:
        risks.append({
            "id": "savings_target_stretch",
            "severity": "elevated",
            "title": "Savings target looks stretched",
            "what": f"Target ₹{savings_target:,.0f} may exceed feasible cumulative savings on this horizon.",
            "when": f"By end of M{len(periods)}",
            "factors": ["Savings target", "Reserve constraint", "Discretionary spending"],
            "impact": "Goal may be infeasible without income increase or spend cuts.",
            "action": "Lower the target or extend the horizon in What-If.",
        })

    if periods and all(p["closing_balance"] >= p["opening_balance"] for p in periods):
        risks.append({
            "id": "improving_liquidity",
            "severity": "healthy",
            "title": "Cash position trending up",
            "what": "Projected closing balances improve versus each period opening under current run-rates.",
            "when": f"M1–M{len(periods)}",
            "factors": ["Income", "Spending run-rates"],
            "impact": "Reserve headroom is expanding on the expected path.",
            "action": "Optionally accelerate debt or savings in the What-If Simulator.",
        })

    # Deduplicate by id while preserving order
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for risk in risks:
        if risk["id"] in seen:
            continue
        seen.add(risk["id"])
        unique.append(risk)
    return unique


def _build_forecast_insights(
    *,
    horizon: int,
    path: dict[str, Any],
    run_rate: dict[str, float],
    shortfall: dict[str, Any],
    risks: list[dict[str, Any]],
    minimum_reserve: float,
    income_volatility: float,
    savings_target: float,
    savings_target_feasible: bool,
) -> list[dict[str, Any]]:
    """Grounded, horizon-specific explanations — numbers only from engine outputs."""
    periods = path["periods"]
    min_period = min(periods, key=lambda p: p["closing_balance"]) if periods else None
    ending = path["ending_balance"]
    minimum_balance = path["minimum_balance"]
    prob = shortfall.get("shortfall_probability")
    prob_text = f"{prob * 100:.1f}%" if prob is not None else "unavailable"
    insights: list[dict[str, Any]] = []

    if horizon == 1:
        insights.append({
            "horizon_months": 1,
            "theme": "immediate_liquidity",
            "headline": "Immediate liquidity check",
            "body": (
                f"Over the next month, projected closing cash is ₹{ending:,.0f} "
                f"(band ₹{periods[0]['balance_low']:,.0f}–₹{periods[0]['balance_high']:,.0f}). "
                f"Essentials ₹{run_rate['essential']:,.0f} and EMI ₹{run_rate['emi']:,.0f} are treated as mandatory."
            ),
            "metrics_cited": ["ending_balance", "balance_low", "balance_high", "essential", "emi"],
        })
        if min_period and min_period["reserve_violated"]:
            insights.append({
                "horizon_months": 1,
                "theme": "reserve_pressure",
                "headline": "Reserve pressure this month",
                "body": (
                    f"Closing cash may fall to ₹{minimum_balance:,.0f}, below your reserve of "
                    f"₹{minimum_reserve:,.0f}. Review discretionary purchases (₹{run_rate['discretionary']:,.0f}/mo) "
                    "in the What-If Simulator."
                ),
                "metrics_cited": ["minimum_balance", "minimum_reserve", "discretionary"],
            })
        else:
            insights.append({
                "horizon_months": 1,
                "theme": "buffer_ok",
                "headline": "Mandatory obligations look coverable",
                "body": (
                    f"Expected minimum ₹{minimum_balance:,.0f} stays at or above the ₹{minimum_reserve:,.0f} reserve "
                    f"on the baseline path. Monte Carlo shortfall probability is {prob_text}."
                ),
                "metrics_cited": ["minimum_balance", "minimum_reserve", "shortfall_probability"],
            })
    elif horizon == 3:
        insights.append({
            "horizon_months": 3,
            "theme": "stability",
            "headline": "Short-term stability",
            "body": (
                f"Across three months, ending cash is projected at ₹{ending:,.0f} with a trough of "
                f"₹{minimum_balance:,.0f}. Income run-rate ₹{run_rate['income']:,.0f} versus "
                f"total monthly outflows "
                f"₹{(run_rate['essential'] + run_rate['discretionary'] + run_rate['emi'] + run_rate['savings']):,.0f}."
            ),
            "metrics_cited": ["ending_balance", "minimum_balance", "income", "outflows"],
        })
        if run_rate["discretionary"] > run_rate["savings"] * 2 and run_rate["savings"] >= 0:
            insights.append({
                "horizon_months": 3,
                "theme": "discretionary_pressure",
                "headline": "Discretionary spend limits savings room",
                "body": (
                    f"Discretionary run-rate ₹{run_rate['discretionary']:,.0f} is high relative to planned savings "
                    f"₹{run_rate['savings']:,.0f}. Cutting discretionary spend could lift the three-month cash path."
                ),
                "metrics_cited": ["discretionary", "savings"],
            })
    else:
        insights.append({
            "horizon_months": 6,
            "theme": "outlook",
            "headline": "Six-month cash outlook",
            "body": (
                f"Projected ending balance ₹{ending:,.0f}; minimum along the path ₹{minimum_balance:,.0f}. "
                f"Income volatility {income_volatility * 100:.1f}% widens later-period bands. "
                f"Monte Carlo shortfall probability {prob_text} "
                f"(method: {shortfall.get('method')})."
            ),
            "metrics_cited": ["ending_balance", "minimum_balance", "income_volatility", "shortfall_probability"],
        })
        insights.append({
            "horizon_months": 6,
            "theme": "goals",
            "headline": "Savings goal feasibility",
            "body": (
                f"Cumulative projected savings ₹{path['cumulative_savings']:,.0f} versus target "
                f"₹{savings_target:,.0f} — "
                f"{'appears achievable on the expected path' if savings_target_feasible else 'looks stretched under reserve constraints'}."
            ),
            "metrics_cited": ["cumulative_savings", "savings_target", "savings_target_feasible"],
        })

    critical = [r for r in risks if r["severity"] == "critical"]
    if critical:
        top = critical[0]
        insights.append({
            "horizon_months": horizon,
            "theme": "top_risk",
            "headline": top["title"],
            "body": f"{top['what']} {top['action']}",
            "metrics_cited": top.get("factors") or [],
        })

    return insights


def build_cash_flow_forecast(
    transactions: list[dict[str, Any]],
    *,
    horizon_months: int = 6,
    profile: dict[str, Any] | None = None,
    model_id: str | None = None,
    forecast_source: str | None = None,
) -> dict[str, Any]:
    """Authoritative current-trajectory monthly forecast for the Cash Flow Forecast page.

    Layer B (deterministic engine) owns balances and reserve logic. Uncertainty bands use
    profile income volatility; shortfall_probability uses seeded Monte Carlo income noise.
    Layer A (ML) may later replace run-rates via forecast_source/model_id without changing
    this response contract. Insights are generated only from computed metrics.
    """
    if horizon_months not in {1, 3, 6}:
        raise ValueError("horizon_months must be 1, 3, or 6")

    profile = profile or {}
    run_rate = _baseline_run_rate(transactions)
    minimum_reserve = float(profile.get("minimum_reserve") or max(10000.0, run_rate["income"] * 0.25))
    savings_target = float(profile.get("savings_target") or run_rate["savings"] * horizon_months)
    income_volatility = float(profile.get("income_volatility") or 0.05)
    opening = run_rate["opening"]
    emi = run_rate["emi"] if run_rate["emi"] > 0 else float(profile.get("monthly_emi") or 0.0)

    path = _project_plan_path(
        opening=opening,
        income=run_rate["income"],
        essential=run_rate["essential"],
        discretionary=run_rate["discretionary"],
        emi=emi,
        savings=run_rate["savings"],
        extra_debt=0.0,
        essential_shock=0.0,
        minimum_reserve=minimum_reserve,
        horizon=horizon_months,
        income_volatility=income_volatility,
    )

    shortfall = _estimate_shortfall_risk(
        opening=opening,
        income=run_rate["income"],
        essential=run_rate["essential"],
        discretionary=run_rate["discretionary"],
        emi=emi,
        savings=run_rate["savings"],
        minimum_reserve=minimum_reserve,
        horizon=horizon_months,
        income_volatility=income_volatility,
    )

    # Feasibility with discretionary cut to zero (same spirit as generator / what-if).
    tight = _project_plan_path(
        opening=opening,
        income=run_rate["income"],
        essential=run_rate["essential"],
        discretionary=0.0,
        emi=emi,
        savings=run_rate["savings"],
        extra_debt=0.0,
        essential_shock=0.0,
        minimum_reserve=minimum_reserve,
        horizon=horizon_months,
        income_volatility=income_volatility,
    )
    savings_target_feasible = tight["cumulative_savings"] + 1e-9 >= savings_target

    data_quality = {
        "transaction_count": len(transactions),
        "sufficient_history": len(transactions) >= 12,
        "opening_below_reserve": opening < minimum_reserve,
        "zero_income": run_rate["income"] <= 0,
        "missing_debt_terms": True,  # ledger has EMI amounts, not APR/tenure
    }

    history = build_cash_flow(transactions, months=min(6, max(1, horizon_months)))
    observed_months = [
        {
            "month": item["month"],
            "inflow": item["inflow"],
            "outflow": item["outflow"],
            "net": item["net"],
            "is_forecast": False,
        }
        for item in history.get("monthly_summary") or []
    ]

    risks = _build_forecast_risks(
        path=path,
        run_rate={**run_rate, "emi": emi},
        shortfall=shortfall,
        data_quality=data_quality,
        income_volatility=income_volatility,
        minimum_reserve=minimum_reserve,
        savings_target=savings_target,
        savings_target_feasible=savings_target_feasible,
    )
    insights = _build_forecast_insights(
        horizon=horizon_months,
        path=path,
        run_rate={**run_rate, "emi": emi},
        shortfall=shortfall,
        risks=risks,
        minimum_reserve=minimum_reserve,
        income_volatility=income_volatility,
        savings_target=savings_target,
        savings_target_feasible=savings_target_feasible,
    )

    total_expenses = _money(
        run_rate["essential"] + run_rate["discretionary"] + emi + run_rate["savings"]
    )
    income_after_mandatory = _money(run_rate["income"] - run_rate["essential"] - emi)

    source = forecast_source or "run_rate_projection"
    limitations = [
        "Period balances use deterministic run-rates from the synthetic historical ledger.",
        "balance_low/balance_high are income-volatility bands, not calibrated ML quantiles.",
        shortfall.get("note") or "Shortfall probability uses seeded Monte Carlo income noise.",
        "Mandatory debt uses observed EMI amounts; APR/tenure terms are not in the ledger.",
        "Future generator shock labels (IsFutureOutcome) are never used as features.",
    ]
    if source == "run_rate_projection":
        limitations.insert(
            0,
            "Active provider is run-rate (not ML). Set FORECAST_PROVIDER=ml when a model artefact is available.",
        )
    if not data_quality["sufficient_history"]:
        limitations.append("Fewer than 12 historical transactions — treat projections as low confidence.")
    if data_quality["zero_income"]:
        limitations.append("Observed income run-rate is zero — distinguish missing data from true zero income.")

    return {
        "forecast_updated_at": date.today().isoformat(),
        "horizon_months": horizon_months,
        "minimum_reserve": _money(minimum_reserve),
        "savings_target": _money(savings_target),
        "savings_target_feasible": savings_target_feasible,
        "income_volatility": income_volatility,
        "opening_balance": _money(opening),
        "ending_balance": path["ending_balance"],
        "minimum_balance": path["minimum_balance"],
        "projected_income": _money(run_rate["income"] * horizon_months),
        "projected_expenses": _money(total_expenses * horizon_months),
        "monthly_income": _money(run_rate["income"]),
        "monthly_essential": _money(run_rate["essential"]),
        "monthly_discretionary": _money(run_rate["discretionary"]),
        "monthly_debt": _money(emi),
        "monthly_savings": _money(run_rate["savings"]),
        "income_after_mandatory": income_after_mandatory,
        "baseline_run_rate": {**run_rate, "emi": _money(emi)},
        "periods": path["periods"],
        "observed_months": observed_months,
        "reserve_breach_rate": path["reserve_breach_rate"],
        "periods_below_reserve": path["periods_below_reserve"],
        "shortfall_probability": shortfall.get("shortfall_probability"),
        "expected_shortfall": shortfall.get("expected_shortfall"),
        "shortfall_method": shortfall.get("method"),
        "shortfall_note": shortfall.get("note"),
        "cumulative_savings": path["cumulative_savings"],
        "debt_remaining": path["debt_remaining"],
        "violations": path["violations"],
        "risks": risks,
        "insights": insights,
        "source": source,
        "model_id": model_id or "run_rate_v1",
        "is_projection": True,
        "limitations": limitations,
        "data_quality": data_quality,
    }
