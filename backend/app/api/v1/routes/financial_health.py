from fastapi import APIRouter, Query
from app.schemas.financial_health import FinancialHealthOut
from app.services.financial_intelligence.engine import (
    build_cash_flow,
    build_financial_health,
    detect_obligations,
)
from app.services.financial_intelligence.forecasting import build_cash_flow_daily_view
from app.services.financial_intelligence.ledger import (
    get_ledger_transactions,
    get_monthly_finance_row,
    get_user_profile,
)

router = APIRouter(tags=["financial-health"])


def _transactions(user_id: str | None):
    return get_ledger_transactions(user_id=user_id, historical_only=True)


@router.get("/financial-health", response_model=FinancialHealthOut)
def get_financial_health(user_id: str | None = Query(None, description="Synthetic UserID override")):
    """Return an explainable, deterministic health snapshot from the synthetic ledger."""
    return FinancialHealthOut(**build_financial_health(_transactions(user_id)))


@router.get("/analytics/cash-flow")
def get_cash_flow(
    user_id: str | None = Query(None),
    months: int = Query(6, ge=1, le=24),
):
    """Return observed monthly history and a current-month burn projection."""
    return build_cash_flow(_transactions(user_id), months=months)


@router.get("/analytics/cash-flow/daily")
def get_cash_flow_daily(
    user_id: str | None = Query(None),
    month: str | None = Query(None, description="YYYY-MM; defaults to latest historical month"),
    include_forecast_days: int = Query(
        0,
        ge=0,
        le=60,
        description="Optional forward days from FORECAST_PROVIDER (run_rate or ml)",
    ),
):
    """Daily cash path rebuilt from synthetic generator transactions for one month.

    Observed points use ledger truth. Optional forecast days come from the configured
    forecast provider (run-rate now; ML when FORECAST_PROVIDER=ml and a model is loaded).
    """
    transactions = _transactions(user_id)
    profile = get_user_profile(user_id=user_id)
    monthly = get_monthly_finance_row(user_id=user_id, month=month, historical_only=True)
    if monthly is None and not transactions:
        return {
            "month": month,
            "points": [],
            "source": "observed_ledger",
            "limitations": ["No monthly finances or transactions available."],
        }

    selected_month = month or (str(monthly["Month"]) if monthly else None)
    opening = float(monthly["OpeningBalance"]) if monthly else float(profile.get("starting_balance") or 0)
    reserve = float(monthly["MinimumReserve"]) if monthly else float(profile.get("minimum_reserve") or 0)

    return build_cash_flow_daily_view(
        transactions,
        month=selected_month,
        opening_balance=opening,
        minimum_reserve=reserve,
        profile=profile,
        include_forecast_days=include_forecast_days,
    )


@router.get("/analytics/obligations")
def get_obligations(user_id: str | None = Query(None)):
    """Return recurring debit transactions detected in the active month."""
    return detect_obligations(_transactions(user_id))


@router.get("/analytics/spending")
def get_spending_breakdown(user_id: str | None = Query(None)):
    health_transactions = _transactions(user_id)
    if not health_transactions:
        return {"categories": []}
    latest_month = max(item["transaction_date"][:7] for item in health_transactions)
    debits = [
        item
        for item in health_transactions
        if item["transaction_date"].startswith(latest_month) and item["type"] == "debit"
    ]
    total = sum(item["amount"] for item in debits)
    totals: dict[str, float] = {}
    for item in debits:
        totals[item["category"]] = totals.get(item["category"], 0) + item["amount"]
    return {
        "categories": [
            {
                "name": name,
                "amount": round(amount, 2),
                "percentage": round((amount / total) * 100, 1) if total else 0,
            }
            for name, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True)
        ]
    }
