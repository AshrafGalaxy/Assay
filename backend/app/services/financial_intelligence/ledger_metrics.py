"""Metrics derived purely from ledger transactions.

Everything the planning / forecasting / AA layers previously hardcoded
(opening balances, reserve floors, baseline incomes, monthly histories,
EMI schedules) is computed here from engine-normalised transaction dicts
(see ``synthetic_adapter.transactions_frame_to_engine`` and
``unified_data.get_unified_financial_data``). No numeric constants that
represent money live in this module.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Iterable

from app.services.financial_intelligence.synthetic_finance_generator import (
    EMI_CATEGORY,
    SAVINGS_CATEGORY,
)
from app.services.forecasting.synthesizer import PeriodLedger

RENT_CATEGORY = "Housing & Rent"
GROCERIES_CATEGORY = "Groceries"
UTILITIES_CATEGORY = "Utilities"

Transaction = dict[str, Any]


def _month_key(tx: Transaction) -> str:
    return str(tx.get("transaction_date", ""))[:7]


def _amount(tx: Transaction) -> float:
    try:
        return abs(float(tx.get("amount", 0.0) or 0.0))
    except (TypeError, ValueError):
        return 0.0


def _is_credit(tx: Transaction) -> bool:
    return str(tx.get("type", "")).lower() == "credit"


def _category(tx: Transaction) -> str:
    return str(tx.get("category") or "")


def is_savings_transfer(tx: Transaction) -> bool:
    cat = _category(tx).lower()
    return cat == SAVINGS_CATEGORY.lower() or "savings" in cat or bool(tx.get("is_internal_transfer"))


def is_debt_payment(tx: Transaction) -> bool:
    cat = _category(tx).lower()
    return cat == EMI_CATEGORY.lower() or "emi" in cat or "debt" in cat or "loan" in cat


def classify_outflow(tx: Transaction) -> str:
    """Bucket a debit into 'savings' | 'debt' | 'discretionary' | 'essential'."""
    if is_savings_transfer(tx):
        return "savings"
    if is_debt_payment(tx):
        return "debt"
    if bool(tx.get("is_discretionary")):
        return "discretionary"
    return "essential"


@dataclass
class MonthAggregate:
    month: str
    income: float = 0.0
    essential: float = 0.0
    debt: float = 0.0
    savings: float = 0.0
    discretionary: float = 0.0
    rent: float = 0.0
    groceries: float = 0.0
    utilities: float = 0.0
    salary: float = 0.0
    transaction_count: int = 0
    last_day: int = 0
    categories: dict[str, float] = field(default_factory=dict)

    @property
    def total_outflow(self) -> float:
        return self.essential + self.debt + self.savings + self.discretionary

    @property
    def net(self) -> float:
        return self.income - self.total_outflow

    @property
    def non_negotiable(self) -> float:
        """Outflows that cannot be skipped in a month: essentials + debt service."""
        return self.essential + self.debt


def monthly_aggregates(transactions: Iterable[Transaction]) -> list[MonthAggregate]:
    """Group transactions into chronological monthly aggregates."""
    buckets: dict[str, MonthAggregate] = {}
    for tx in transactions:
        month = _month_key(tx)
        if len(month) != 7:
            continue
        agg = buckets.get(month)
        if agg is None:
            agg = MonthAggregate(month=month)
            buckets[month] = agg
        amt = _amount(tx)
        agg.transaction_count += 1
        try:
            agg.last_day = max(agg.last_day, int(str(tx.get("transaction_date", ""))[8:10] or 0))
        except ValueError:
            pass

        if _is_credit(tx):
            agg.income += amt
            if bool(tx.get("is_fixed")) or bool(tx.get("is_recurring")):
                agg.salary += amt
            continue

        bucket = classify_outflow(tx)
        if bucket == "savings":
            agg.savings += amt
        elif bucket == "debt":
            agg.debt += amt
        elif bucket == "discretionary":
            agg.discretionary += amt
        else:
            agg.essential += amt

        cat = _category(tx)
        agg.categories[cat] = agg.categories.get(cat, 0.0) + amt
        if cat == RENT_CATEGORY:
            agg.rent += amt
        elif cat == GROCERIES_CATEGORY:
            agg.groceries += amt
        elif cat == UTILITIES_CATEGORY:
            agg.utilities += amt

    return [buckets[m] for m in sorted(buckets)]


def derive_closing_balance(transactions: Iterable[Transaction], opening_balance: float) -> float:
    """Cash conservation: opening + all credits - all debits."""
    balance = float(opening_balance or 0.0)
    for tx in transactions:
        amt = _amount(tx)
        balance += amt if _is_credit(tx) else -amt
    return round(balance, 2)


def _trailing(aggs: list[MonthAggregate], months: int) -> list[MonthAggregate]:
    if months <= 0:
        return aggs
    return aggs[-months:]


def average_monthly_income(transactions: Iterable[Transaction], months: int = 6) -> float:
    aggs = _trailing(monthly_aggregates(transactions), months)
    return round(sum(a.income for a in aggs) / len(aggs), 2) if aggs else 0.0


def average_monthly_essential(transactions: Iterable[Transaction], months: int = 6) -> float:
    aggs = _trailing(monthly_aggregates(transactions), months)
    return round(sum(a.non_negotiable for a in aggs) / len(aggs), 2) if aggs else 0.0


def average_monthly_discretionary(transactions: Iterable[Transaction], months: int = 6) -> float:
    aggs = _trailing(monthly_aggregates(transactions), months)
    return round(sum(a.discretionary for a in aggs) / len(aggs), 2) if aggs else 0.0


def average_monthly_savings(transactions: Iterable[Transaction], months: int = 6) -> float:
    aggs = _trailing(monthly_aggregates(transactions), months)
    return round(sum(a.savings for a in aggs) / len(aggs), 2) if aggs else 0.0


def average_monthly_debt(transactions: Iterable[Transaction], months: int = 6) -> float:
    aggs = _trailing(monthly_aggregates(transactions), months)
    return round(sum(a.debt for a in aggs) / len(aggs), 2) if aggs else 0.0


def derive_minimum_reserve(transactions: Iterable[Transaction], months: int = 6) -> float:
    """Reserve floor = one month of non-negotiable outflows (essentials + debt service),
    averaged over the trailing window. Zero when there is no history."""
    return average_monthly_essential(transactions, months=months)


def build_period_ledgers(
    transactions: Iterable[Transaction],
    opening_balance: float,
) -> list[PeriodLedger]:
    """Convert transactions into the monthly ``PeriodLedger`` series consumed by the
    conformal forecasting / planning engines, preserving cash conservation."""
    running = float(opening_balance or 0.0)
    periods: list[PeriodLedger] = []
    for idx, agg in enumerate(monthly_aggregates(transactions), start=1):
        running = round(running + agg.net, 2)
        periods.append(
            PeriodLedger(
                period_id=idx,
                date_label=agg.month,
                salary=round(agg.salary, 2),
                variable_bonus=round(agg.income - agg.salary, 2),
                total_income=round(agg.income, 2),
                rent=round(agg.rent, 2),
                groceries=round(agg.groceries, 2),
                utilities=round(agg.utilities, 2),
                debt_emi=round(agg.debt, 2),
                total_essential=round(agg.non_negotiable, 2),
                discretionary=round(agg.discretionary, 2),
                net_cash_flow=round(agg.net, 2),
                closing_balance=running,
                is_shock=False,
                shock_amount=0.0,
                savings=round(agg.savings, 2),
            )
        )
    return periods


def split_chronological(
    periods: list[PeriodLedger],
    train_ratio: float = 0.6,
    val_ratio: float = 0.2,
) -> tuple[list[PeriodLedger], list[PeriodLedger], list[PeriodLedger]]:
    """Chronological train / calibration / test split that adapts to the history length."""
    n = len(periods)
    if n < 3:
        return periods, [], []
    n_train = max(1, int(n * train_ratio))
    n_val = max(1, int(n * val_ratio))
    if n_train + n_val >= n:
        n_val = max(1, n - n_train - 1)
    n_test = n - n_train - n_val
    if n_test < 1:
        n_train -= 1
        n_test = 1
    return periods[:n_train], periods[n_train:n_train + n_val], periods[n_train + n_val:]


def seasonal_projection(values: list[float], horizon: int) -> list[float]:
    """Project a monthly series forward by repeating the most recent seasonal pattern
    (last `horizon` observations); falls back to the trailing mean."""
    if not values:
        return [0.0] * horizon
    window = values[-horizon:] if len(values) >= horizon else values
    if len(window) < horizon:
        mean = sum(window) / len(window)
        return [round(mean, 2)] * horizon
    return [round(v, 2) for v in window]


def latest_month(transactions: Iterable[Transaction]) -> str | None:
    months = [m for m in (_month_key(tx) for tx in transactions) if len(m) == 7]
    return max(months) if months else None


def month_to_date_snapshot(transactions: list[Transaction], month: str | None = None) -> dict[str, Any]:
    """Month-to-date discretionary spend, fixed outflows already paid, and the last
    observed day for the given (default: latest) ledger month."""
    target = month or latest_month(transactions)
    if not target:
        return {"month": None, "day": 0, "discretionary_spent": 0.0, "fixed_paid": 0.0, "days_in_month": 30}
    aggs = {a.month: a for a in monthly_aggregates([t for t in transactions if _month_key(t) == target])}
    agg = aggs.get(target)
    year, mon = int(target[:4]), int(target[5:7])
    next_month = date(year + (mon // 12), (mon % 12) + 1, 1)
    days_in_month = (next_month - date(year, mon, 1)).days
    if agg is None:
        return {"month": target, "day": 0, "discretionary_spent": 0.0, "fixed_paid": 0.0, "days_in_month": days_in_month}
    return {
        "month": target,
        "day": agg.last_day or days_in_month,
        "days_in_month": days_in_month,
        "discretionary_spent": round(agg.discretionary, 2),
        "fixed_paid": round(agg.non_negotiable, 2),
    }


def recurring_debt_payments(transactions: Iterable[Transaction]) -> list[dict[str, Any]]:
    """Distinct recurring debt / EMI streams observed in the ledger, with their
    typical monthly amount and how many months they have been paid."""
    streams: dict[str, dict[str, Any]] = {}
    for tx in transactions:
        if _is_credit(tx) or not is_debt_payment(tx):
            continue
        label = str(tx.get("merchant_name") or tx.get("description") or _category(tx) or "Debt payment").strip()
        key = label.lower()
        entry = streams.setdefault(
            key,
            {"name": label, "amounts": [], "months": set(), "first": None, "last": None},
        )
        amt = _amount(tx)
        month = _month_key(tx)
        entry["amounts"].append(amt)
        entry["months"].add(month)
        tx_date = str(tx.get("transaction_date", ""))[:10]
        entry["first"] = tx_date if entry["first"] is None or tx_date < entry["first"] else entry["first"]
        entry["last"] = tx_date if entry["last"] is None or tx_date > entry["last"] else entry["last"]

    result: list[dict[str, Any]] = []
    for entry in streams.values():
        months_paid = len(entry["months"])
        monthly_amount = sum(entry["amounts"]) / months_paid if months_paid else 0.0
        result.append(
            {
                "name": entry["name"],
                "monthly_amount": round(monthly_amount, 2),
                "months_paid": months_paid,
                "total_paid": round(sum(entry["amounts"]), 2),
                "first_payment": entry["first"],
                "last_payment": entry["last"],
            }
        )
    result.sort(key=lambda r: r["monthly_amount"], reverse=True)
    return result


def category_totals(transactions: Iterable[Transaction], months: int | None = None) -> dict[str, float]:
    """Debit totals per category, optionally restricted to the trailing N months."""
    aggs = monthly_aggregates(transactions)
    if months:
        aggs = _trailing(aggs, months)
    totals: dict[str, float] = defaultdict(float)
    for agg in aggs:
        for cat, amt in agg.categories.items():
            totals[cat] += amt
    return {k: round(v, 2) for k, v in totals.items()}
