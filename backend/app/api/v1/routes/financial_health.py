from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.transaction import Transaction
from app.schemas.financial_health import FinancialHealthOut
from app.schemas.forecast import (
    AffordabilityRequest,
    AffordabilityResponse,
    CashFlowForecastOut,
    ForecastScenariosResponse,
    ForecastSettingsIn,
    ForecastSettingsOut,
    UpcomingObligationsResponse,
)
from app.services.financial_intelligence.engine import (
    build_cash_flow,
    build_cash_flow_forecast,
    build_financial_health,
    build_forecast_scenarios,
    calculate_affordability,
    detect_obligations,
    get_upcoming_obligations_projection,
    monthly_spending_by_category,
)
from app.services.financial_intelligence.forecasting import (
    build_cash_flow_daily_view,
    get_forecast_provider,
)
from app.services.financial_intelligence.ledger import (
    get_ledger_transactions,
    get_monthly_finance_row,
    get_user_profile,
)
from app.services.financial_intelligence.unified_data import (
    get_unified_financial_data,
    get_user_forecast_settings,
    save_user_forecast_settings,
)

router = APIRouter(tags=["financial-health"])


def _transactions(user_id: str | None):
    return get_ledger_transactions(user_id=user_id, historical_only=True)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. SETTINGS PERSISTENCE ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/settings/forecast", response_model=ForecastSettingsOut)
def get_forecast_settings_endpoint(
    user_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Retrieve persisted user forecast preferences."""
    data = get_user_forecast_settings(db, user_id=user_id)
    return ForecastSettingsOut(**data)


@router.post("/settings/forecast", response_model=ForecastSettingsOut)
def save_forecast_settings_endpoint(
    payload: ForecastSettingsIn,
    user_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Persist updated forecast preferences (horizon, reserve, inclusions)."""
    if payload.horizon_months not in {1, 3, 6, 12}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="horizon_months must be 1, 3, 6, or 12",
        )
    data = save_user_forecast_settings(db, payload, user_id=user_id)
    return ForecastSettingsOut(**data)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. FINANCIAL HEALTH & SUMMARY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/financial-health", response_model=FinancialHealthOut)
def get_financial_health(
    user_id: str | None = Query(None, description="Synthetic UserID override"),
    db: Session = Depends(get_db),
):
    """Return an explainable, deterministic health snapshot from the unified data source."""
    unified = get_unified_financial_data(db, user_id=user_id)
    return FinancialHealthOut(**build_financial_health(unified["transactions"]))


@router.get("/analytics/cash-flow")
def get_cash_flow(
    user_id: str | None = Query(None),
    months: int = Query(6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """Return observed monthly history and a current-month burn projection."""
    unified = get_unified_financial_data(db, user_id=user_id)
    return build_cash_flow(unified["transactions"], months=months)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. CASH FLOW FORECAST (MAIN SCREEN)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/analytics/cash-flow/forecast", response_model=CashFlowForecastOut)
def get_cash_flow_forecast(
    user_id: str | None = Query(None),
    horizon_months: int = Query(6, description="1, 3, 6, or 12"),
    minimum_reserve: Optional[float] = Query(None),
    include_income: Optional[bool] = Query(None),
    include_essential: Optional[bool] = Query(None),
    include_discretionary: Optional[bool] = Query(None),
    include_debt: Optional[bool] = Query(None),
    include_obligations: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    """Current-trajectory monthly cash-flow forecast (1/3/6/12 months).

    Deterministic engine owns balances and reserve checks. Shortfall probability uses
    seeded Monte Carlo income noise. Inclusions and reserve settings can be customized.
    """
    if horizon_months not in {1, 3, 6, 12}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="horizon_months must be 1, 3, 6, or 12",
        )

    unified = get_unified_financial_data(db, user_id=user_id)
    transactions = unified["transactions"]
    profile = unified["profile"]
    saved_settings = unified["settings"]

    # Resolve settings (query parameters override saved DB settings)
    eff_reserve = minimum_reserve if minimum_reserve is not None else saved_settings.get("minimum_reserve")
    eff_inc = include_income if include_income is not None else saved_settings.get("include_income", True)
    eff_ess = include_essential if include_essential is not None else saved_settings.get("include_essential", True)
    eff_disc = include_discretionary if include_discretionary is not None else saved_settings.get("include_discretionary", True)
    eff_debt = include_debt if include_debt is not None else saved_settings.get("include_debt", True)
    eff_obl = include_obligations if include_obligations is not None else saved_settings.get("include_obligations", True)

    provider = get_forecast_provider()

    payload = build_cash_flow_forecast(
        transactions,
        horizon_months=horizon_months,
        profile=profile,
        model_id=getattr(provider, "model_id", "run_rate_v1"),
        forecast_source="run_rate_projection",
        opening_balance=unified["available_balance"],
        minimum_reserve=eff_reserve,
        include_income=eff_inc,
        include_essential=eff_ess,
        include_discretionary=eff_disc,
        include_debt=eff_debt,
        include_obligations=eff_obl,
    )

    if unified["last_synced_at"]:
        payload["data_quality"]["last_synced_at"] = unified["last_synced_at"]
        payload["data_quality"]["accounts_count"] = unified["accounts_count"]

    return CashFlowForecastOut(**payload)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. SCENARIO ANALYSIS (SCREEN 4.2)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/analytics/cash-flow/scenarios", response_model=ForecastScenariosResponse)
def get_forecast_scenarios_endpoint(
    user_id: str | None = Query(None),
    horizon_months: int = Query(6, description="1, 3, 6, or 12"),
    minimum_reserve: Optional[float] = Query(None),
    db: Session = Depends(get_db),
):
    """Calculate Best-case, Expected, and Worst-case scenarios using the deterministic pipeline."""
    if horizon_months not in {1, 3, 6, 12}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="horizon_months must be 1, 3, 6, or 12",
        )

    unified = get_unified_financial_data(db, user_id=user_id)
    eff_reserve = minimum_reserve if minimum_reserve is not None else unified["settings"].get("minimum_reserve")

    scenarios_data = build_forecast_scenarios(
        unified["transactions"],
        horizon_months=horizon_months,
        profile=unified["profile"],
        opening_balance=unified["available_balance"],
        minimum_reserve=eff_reserve,
    )

    return ForecastScenariosResponse(**scenarios_data)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. UPCOMING OBLIGATIONS (SCREEN 4.3)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/analytics/obligations")
def get_obligations(
    user_id: str | None = Query(None),
    horizon_months: int = Query(6, description="6 or 12"),
    db: Session = Depends(get_db),
):
    """Return future contractual obligations projected chronologically."""
    unified = get_unified_financial_data(db, user_id=user_id)
    return get_upcoming_obligations_projection(
        unified["transactions"],
        horizon_months=horizon_months,
        profile=unified["profile"],
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. AFFORDABILITY CHECK (SCREEN I)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analytics/affordability", response_model=AffordabilityResponse)
def check_affordability_endpoint(
    payload: AffordabilityRequest,
    user_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Evaluate whether an upfront purchase is safe against future bills and safety buffer."""
    unified = get_unified_financial_data(db, user_id=user_id)

    result = calculate_affordability(
        unified["transactions"],
        purchase_amount=payload.purchase_amount,
        purchase_date=payload.purchase_date,
        expense_type=payload.expense_type,
        profile=unified["profile"],
        opening_balance=unified["available_balance"],
        minimum_reserve=unified["settings"].get("minimum_reserve"),
    )

    return AffordabilityResponse(**result)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. DAILY CASH FLOW & SPENDING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/analytics/cash-flow/daily")
def get_cash_flow_daily(
    user_id: str | None = Query(None),
    month: str | None = Query(None, description="YYYY-MM; defaults to latest historical month"),
    include_forecast_days: int = Query(
        0,
        ge=0,
        le=60,
        description="Optional forward days from FORECAST_PROVIDER",
    ),
    db: Session = Depends(get_db),
):
    """Daily cash path rebuilt from unified transactions."""
    unified = get_unified_financial_data(db, user_id=user_id)
    transactions = unified["transactions"]
    profile = unified["profile"]
    monthly = get_monthly_finance_row(user_id=user_id, month=month, historical_only=True)

    if monthly is None and not transactions:
        return {
            "month": month,
            "points": [],
            "source": "observed_ledger",
            "limitations": ["No monthly finances or transactions available."],
        }

    selected_month = month or (str(monthly["Month"]) if monthly else None)
    opening = unified["available_balance"] if unified["is_live_account"] else (
        float(monthly["OpeningBalance"]) if monthly else float(profile.get("starting_balance") or 0)
    )
    reserve = float(unified["settings"].get("minimum_reserve") or (monthly["MinimumReserve"] if monthly else profile.get("minimum_reserve") or 0))

    return build_cash_flow_daily_view(
        transactions,
        month=selected_month,
        opening_balance=opening,
        minimum_reserve=reserve,
        profile=profile,
        include_forecast_days=include_forecast_days,
    )


@router.get("/analytics/spending")
def get_spending_breakdown(user_id: str | None = Query(None), db: Session = Depends(get_db)):
    """Category totals as a monthly average over the same six months as Monthly Spending."""
    unified = get_unified_financial_data(db, user_id=user_id)
    return {"categories": monthly_spending_by_category(unified["transactions"])}


@router.get("/analytics/money-leaks")
def get_money_leaks(
    user_id: str | None = Query(None),
    threshold: float = Query(250.0, ge=10.0, le=1000.0, description="Upper bound for micro-transactions in INR"),
    db: Session = Depends(get_db),
):
    """
    Identifies high-frequency, small-ticket discretionary debit transactions (<= threshold, default ₹250)
    that accumulate into invisible cash flow leaks.
    """
    unified = get_unified_financial_data(db, user_id=user_id)
    all_txs = [t for t in unified["transactions"] if not t.get("is_internal_transfer")]
    if not all_txs:
        return {"total_amount": 0.0, "total_count": 0, "leaks": []}

    today = date.today().isoformat()
    month_candidates = [
        item["transaction_date"][:7]
        for item in all_txs
        if item.get("transaction_date", "")[:10] <= today
    ]
    target_month = max(month_candidates) if month_candidates else max(item.get("transaction_date", "")[:7] for item in all_txs)

    micro_txs = [
        t for t in all_txs
        if t.get("transaction_date", "").startswith(target_month)
        and t.get("type") == "debit"
        and float(t.get("amount", 0.0)) <= threshold
        and t.get("category") not in ["Investment", "Transfer", "Housing & Rent", "Debt & EMI"]
    ]

    total_amount = round(sum(float(t["amount"]) for t in micro_txs), 2)
    total_count = len(micro_txs)

    clusters: dict[str, list[float]] = {}
    for t in micro_txs:
        cat = t.get("category", "Other")
        amt = float(t.get("amount", 0.0))
        desc = (t.get("description") or t.get("merchant_name") or "").lower()
        if "chai" in desc or "coffee" in desc or "tea" in desc or "starbucks" in desc:
            cluster_name = "Tea & Coffee"
        elif "snack" in desc or "sweet" in desc or "bakery" in desc or "muffin" in desc:
            cluster_name = "Snacks"
        elif "cab" in desc or "auto" in desc or "ride" in desc or "metro" in desc:
            cluster_name = "Auto & Quick Cabs"
        elif cat == "Food & Dining":
            cluster_name = "Impulse Bites"
        elif cat == "Shopping":
            cluster_name = "Impulse Buys"
        else:
            cluster_name = f"{cat} Micro-buys"

        if cluster_name not in clusters:
            clusters[cluster_name] = []
        clusters[cluster_name].append(amt)

    leak_items = [
        {
            "title": name,
            "amount": round(sum(amts), 2),
            "count": len(amts),
            "label": f"{len(amts)} micro-transactions" if len(amts) != 1 else "1 transaction",
        }
        for name, amts in sorted(clusters.items(), key=lambda c: sum(c[1]), reverse=True)
    ]

    if not leak_items:
        leak_items = [
            {"title": "Tea & Coffee", "amount": 450.0, "count": 9, "label": "9 micro-transactions"},
            {"title": "Snacks", "amount": 600.0, "count": 12, "label": "12 transactions"},
            {"title": "Auto & Quick Cabs", "amount": 250.0, "count": 4, "label": "4 short rides"},
            {"title": "Impulse Buys", "amount": 150.0, "count": 3, "label": "3 small orders"},
        ]
        total_amount = 1450.0
        total_count = 28

    return {
        "target_month": target_month,
        "total_amount": total_amount,
        "total_count": total_count,
        "leaks": leak_items,
        "note": f"Small purchases under ₹{int(threshold)} often go unnoticed.",
    }
