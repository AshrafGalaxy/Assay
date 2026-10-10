"""Unified financial data access layer for ASSAY Financial Intelligence.

Single source of truth integrating:
1. Connected bank accounts from SQLite/PostgreSQL (Account model).
2. Manually entered & OCR transactions (Transaction model).
3. Ground-truth synthetic ledger transactions (deduplicated, without double-counting).
4. Internal transfers between linked accounts appropriately handled (not counted as external spend).
5. User-defined forecast settings and minimum reserve persistence.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.forecast_settings import ForecastSettings
from app.schemas.forecast import ForecastSettingsIn
from app.services.financial_intelligence.ledger import (
    get_ledger_transactions,
    get_user_profile,
)


def get_user_forecast_settings(db: Session, user_id: str | None = None) -> dict[str, Any]:
    """Retrieve saved forecast settings for user, or return system defaults."""
    query = db.query(ForecastSettings)
    if user_id:
        record = query.filter(ForecastSettings.user_id == user_id).first()
    else:
        record = query.first()

    if record:
        return {
            "id": record.id,
            "user_id": record.user_id,
            "horizon_months": record.horizon_months or 6,
            "minimum_reserve": float(record.minimum_reserve if record.minimum_reserve is not None else 15000.0),
            "include_income": bool(record.include_income if record.include_income is not None else True),
            "include_essential": bool(record.include_essential if record.include_essential is not None else True),
            "include_discretionary": bool(record.include_discretionary if record.include_discretionary is not None else True),
            "include_debt": bool(record.include_debt if record.include_debt is not None else True),
            "include_obligations": bool(record.include_obligations if record.include_obligations is not None else True),
            "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        }

    # Default profile fallback
    profile = get_user_profile(user_id=user_id)
    return {
        "id": "default",
        "user_id": user_id,
        "horizon_months": 6,
        "minimum_reserve": float(profile.get("minimum_reserve") or 15000.0),
        "include_income": True,
        "include_essential": True,
        "include_discretionary": True,
        "include_debt": True,
        "include_obligations": True,
        "updated_at": None,
    }


def save_user_forecast_settings(
    db: Session,
    payload: ForecastSettingsIn,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Persist or update forecast preferences for user."""
    query = db.query(ForecastSettings)
    if user_id:
        record = query.filter(ForecastSettings.user_id == user_id).first()
    else:
        record = query.first()

    if not record:
        record = ForecastSettings(
            user_id=user_id,
            horizon_months=payload.horizon_months,
            minimum_reserve=payload.minimum_reserve,
            include_income=payload.include_income,
            include_essential=payload.include_essential,
            include_discretionary=payload.include_discretionary,
            include_debt=payload.include_debt,
            include_obligations=payload.include_obligations,
        )
        db.add(record)
    else:
        record.horizon_months = payload.horizon_months
        record.minimum_reserve = payload.minimum_reserve
        record.include_income = payload.include_income
        record.include_essential = payload.include_essential
        record.include_discretionary = payload.include_discretionary
        record.include_debt = payload.include_debt
        record.include_obligations = payload.include_obligations
        record.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "user_id": record.user_id,
        "horizon_months": record.horizon_months,
        "minimum_reserve": float(record.minimum_reserve),
        "include_income": record.include_income,
        "include_essential": record.include_essential,
        "include_discretionary": record.include_discretionary,
        "include_debt": record.include_debt,
        "include_obligations": record.include_obligations,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


def get_unified_financial_data(
    db: Session,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Compile canonical financial facts across connected accounts and transactions."""
    profile = get_user_profile(user_id=user_id)

    # 1. Accounts & Available Liquid Cash
    acc_query = db.query(Account).filter(Account.status != "disconnected")
    if user_id:
        acc_query = acc_query.filter(Account.user_id == user_id)
    accounts = acc_query.all()

    last_synced_at = None
    if accounts:
        available_balance = sum(float(a.balance or 0.0) for a in accounts)
        sync_candidates = [a.last_synced_at for a in accounts if a.last_synced_at]
        if sync_candidates:
            last_synced_at = max(sync_candidates)
    else:
        available_balance = float(profile.get("starting_balance") or 50000.0)

    # 2. Database transactions
    tx_query = db.query(Transaction)
    if user_id:
        tx_query = tx_query.filter(Transaction.user_id == user_id)
    db_transactions = tx_query.all()

    # Known account IDs for transfer detection
    user_account_ids = {a.id for a in accounts if a.id}

    converted_db_txs: list[dict[str, Any]] = []
    for tx in db_transactions:
        cat = (tx.category or "").strip().lower()
        # Internal transfer check: category is Transfer or payment between user's own accounts
        is_internal_transfer = cat in {"transfer", "self transfer", "internal transfer"}

        converted_db_txs.append({
            "id": tx.id,
            "amount": float(tx.amount),
            "type": tx.type,  # debit or credit
            "category": tx.category,
            "merchant_name": tx.merchant_name,
            "description": tx.description or "",
            "transaction_date": tx.transaction_date,
            "is_recurring": bool(tx.is_recurring),
            "is_fixed": bool(tx.is_fixed),
            "is_discretionary": bool(tx.is_discretionary),
            "source_type": tx.source_type or "manual",
            "is_internal_transfer": is_internal_transfer,
        })

    # 3. Base historical ledger from synthetic engine
    ledger_txs = get_ledger_transactions(user_id=user_id, historical_only=True)

    # Merge: DB transactions take precedence; avoid double-counting by ID
    existing_ids = {t["id"] for t in converted_db_txs}
    merged_txs = list(converted_db_txs)
    for l_tx in ledger_txs:
        if l_tx.get("id") not in existing_ids:
            merged_txs.append({
                **l_tx,
                "is_internal_transfer": False,
            })

    # 4. Settings
    settings = get_user_forecast_settings(db, user_id=user_id)

    return {
        "available_balance": available_balance,
        "accounts_count": len(accounts),
        "last_synced_at": last_synced_at,
        "transactions": merged_txs,
        "profile": profile,
        "settings": settings,
        "is_live_account": len(accounts) > 0,
    }
