from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.schemas.financial_health import FinancialHealthOut, Signal
from datetime import date
from app.services.financial_intelligence.engine import (
    build_cash_flow,
    build_financial_health,
    detect_obligations,
    _date,
    _month_key,
)
from app.api.v1.routes.transactions import get_all_unified_transactions

router = APIRouter(tags=["financial-health"])


@router.get("/financial-health", response_model=FinancialHealthOut)
def get_financial_health(db: Session = Depends(get_db)):
    """Return an explainable, deterministic health snapshot incorporating active transactions."""
    transactions = get_all_unified_transactions(db)
    return FinancialHealthOut(**build_financial_health(transactions))


@router.get("/analytics/cash-flow")
def get_cash_flow(db: Session = Depends(get_db)):
    """Return observed monthly history and a current-month burn projection."""
    transactions = get_all_unified_transactions(db)
    return build_cash_flow(transactions)


@router.get("/analytics/obligations")
def get_obligations(db: Session = Depends(get_db)):
    """Return recurring debit transactions detected in the active month."""
    transactions = get_all_unified_transactions(db)
    return detect_obligations(transactions)


@router.get("/analytics/spending")
def get_spending_breakdown(db: Session = Depends(get_db)):
    """Return categorized spending breakdown reflecting real-time user transactions."""
    transactions = get_all_unified_transactions(db)
    if not transactions:
        return {"categories": []}
    today = date.today()
    all_dates = [_date(item["transaction_date"]) for item in transactions]
    past_and_present = [d for d in all_dates if d <= today]
    target_date = max(past_and_present) if past_and_present else max(all_dates)
    target_month = _month_key(target_date)

    debits = [
        item for item in transactions
        if _month_key(_date(item["transaction_date"])) == target_month and item["type"] == "debit"
    ]
    total = sum(item["amount"] for item in debits)
    totals = {}
    for item in debits:
        cat = item["category"]
        totals[cat] = totals.get(cat, 0) + item["amount"]
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
