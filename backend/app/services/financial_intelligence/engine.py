"""Pure, explainable personal-finance calculations.

This module intentionally does not know about FastAPI, SQLAlchemy, or an LLM.
It accepts normalised transaction dictionaries, which makes it usable with the
synthetic ledger now and Supabase repositories later.
"""

from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime
from typing import Any, Iterable


def _money(value: float) -> float:
    return round(float(value), 2)


def _date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()


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
            totals[transaction["category"]] += float(transaction["amount"])
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

    latest_date = max(_date(transaction["transaction_date"]) for transaction in transactions)
    effective_date = as_of or latest_date
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
