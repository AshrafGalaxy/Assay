from fastapi import APIRouter
from app.schemas.financial_health import FinancialHealthOut, Signal
from app.services.financial_intelligence.demo_ledger import get_demo_transactions
from app.services.financial_intelligence.engine import (
    build_cash_flow,
    build_financial_health,
    detect_obligations,
)

router = APIRouter(tags=["financial-health"])


@router.get("/financial-health", response_model=FinancialHealthOut)
def get_financial_health():
    """Return an explainable, deterministic health snapshot."""
    return FinancialHealthOut(**build_financial_health(get_demo_transactions()))


@router.get("/analytics/cash-flow")
def get_cash_flow():
    """Return observed monthly history and a current-month burn projection."""
    return build_cash_flow(get_demo_transactions())


@router.get("/analytics/obligations")
def get_obligations():
    """Return recurring debit transactions detected in the active month."""
    return detect_obligations(get_demo_transactions())


@router.get("/analytics/spending")
def get_spending_breakdown():
    health_transactions = get_demo_transactions()
    latest_month = max(item["transaction_date"][:7] for item in health_transactions)
    debits = [item for item in health_transactions if item["transaction_date"].startswith(latest_month) and item["type"] == "debit"]
    total = sum(item["amount"] for item in debits)
    totals = {}
    for item in debits:
        totals[item["category"]] = totals.get(item["category"], 0) + item["amount"]
    return {"categories": [
        {"name": name, "amount": round(amount, 2), "percentage": round((amount / total) * 100, 1) if total else 0}
        for name, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True)
    ]}
