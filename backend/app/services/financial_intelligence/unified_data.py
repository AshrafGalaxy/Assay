"""Unified financial data access layer for ASSAY Financial Intelligence.

Single source of truth integrating:
1. Connected bank accounts from SQLite/PostgreSQL (Account model).
2. Manually entered & OCR transactions (Transaction model).
3. Ground-truth synthetic ledger transactions (deduplicated, without double-counting).
4. Internal transfers between linked accounts appropriately handled (not counted as external spend).
5. User-defined forecast settings and minimum reserve persistence.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
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
from app.services.financial_intelligence.ledger_metrics import (
    derive_closing_balance,
    derive_minimum_reserve,
)

DEFAULT_HORIZON_MONTHS = 6
DEMO_USER_ID = "usr_demo_01"
PRIMARY_BANK_KEY = "hdfc"


def _transaction_identity(tx: dict[str, Any]) -> tuple:
    """Same calendar day, merchant, amount, type, and category count as one payment."""
    return (
        str(tx.get("transaction_date", ""))[:10],
        (tx.get("merchant_name") or "").strip().lower(),
        round(float(tx.get("amount") or 0), 2),
        tx.get("type"),
        (tx.get("category") or "").strip().lower(),
    )


def derive_reserve_from_data(
    profile: dict[str, Any],
    transactions: list[dict[str, Any]] | None = None,
) -> float:
    """Minimum reserve: the user's declared reserve from the ledger profile when present,
    otherwise one month of non-negotiable outflows observed in the transactions."""
    declared = profile.get("minimum_reserve")
    if declared:
        return float(declared)
    if transactions:
        return derive_minimum_reserve(transactions)
    return 0.0


def get_user_forecast_settings(
    db: Session,
    user_id: str | None = None,
    transactions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Retrieve saved forecast settings for user, or defaults derived from the ledger."""
    query = db.query(ForecastSettings)
    if user_id:
        record = query.filter(ForecastSettings.user_id == user_id).first()
    else:
        record = query.first()

    profile = get_user_profile(user_id=user_id)
    if transactions is None:
        transactions = get_ledger_transactions(user_id=user_id, historical_only=True)
    derived_reserve = derive_reserve_from_data(profile, transactions)

    if record:
        return {
            "id": record.id,
            "user_id": record.user_id,
            "horizon_months": record.horizon_months or DEFAULT_HORIZON_MONTHS,
            "minimum_reserve": float(record.minimum_reserve if record.minimum_reserve is not None else derived_reserve),
            "include_income": bool(record.include_income if record.include_income is not None else True),
            "include_essential": bool(record.include_essential if record.include_essential is not None else True),
            "include_discretionary": bool(record.include_discretionary if record.include_discretionary is not None else True),
            "include_debt": bool(record.include_debt if record.include_debt is not None else True),
            "include_obligations": bool(record.include_obligations if record.include_obligations is not None else True),
            "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        }

    # No saved settings: defaults come from the ledger profile / transactions
    return {
        "id": "default",
        "user_id": user_id,
        "horizon_months": DEFAULT_HORIZON_MONTHS,
        "minimum_reserve": derived_reserve,
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


def get_merged_transactions(
    db: Session,
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    """This user's ledger plus their own saved rows, each payment kept once.

    Rows dated after today are omitted. Repeated saves of the same payment
    (same day, merchant, amount, type, and category) are kept once.
    """
    scope_user = user_id or DEMO_USER_ID
    db_transactions = (
        db.query(Transaction)
        .filter((Transaction.user_id == scope_user) | (Transaction.user_id.is_(None)))
        .all()
    )
    converted_db_txs: list[dict[str, Any]] = []
    for tx in db_transactions:
        cat = (tx.category or "").strip().lower()
        is_internal_transfer = cat in {"transfer", "self transfer", "internal transfer"}
        converted_db_txs.append({
            "id": tx.id,
            "user_id": tx.user_id,
            "account_id": tx.account_id,
            "amount": float(tx.amount),
            "type": tx.type,
            "category": tx.category,
            "merchant_name": tx.merchant_name,
            "description": tx.description or "",
            "transaction_date": tx.transaction_date,
            "payment_method": tx.payment_method or "UPI",
            "is_recurring": bool(tx.is_recurring),
            "is_fixed": bool(tx.is_fixed),
            "is_discretionary": bool(tx.is_discretionary),
            "source_type": tx.source_type or "manual",
            "is_internal_transfer": is_internal_transfer,
        })

    # Pass through the caller's id. None resolves to the ledger's own user;
    # a test user id that is not in the ledger yields no synthetic rows.
    ledger_txs = get_ledger_transactions(user_id=user_id, historical_only=True)

    seen = {_transaction_identity(tx) for tx in ledger_txs}
    unique_db: list[dict[str, Any]] = []
    for row in converted_db_txs:
        key = _transaction_identity(row)
        if key in seen:
            continue
        seen.add(key)
        unique_db.append(row)

    today_iso = date.today().isoformat()
    unique_db = [row for row in unique_db if str(row.get("transaction_date", ""))[:10] <= today_iso]
    ledger_txs = [tx for tx in ledger_txs if str(tx.get("transaction_date", ""))[:10] <= today_iso]

    existing_ids = {t["id"] for t in unique_db}
    merged_txs = list(unique_db)
    for ledger_tx in ledger_txs:
        if ledger_tx.get("id") not in existing_ids:
            merged_txs.append({
                **ledger_tx,
                "payment_method": ledger_tx.get("payment_method") or "UPI",
                "is_internal_transfer": bool(ledger_tx.get("is_internal_transfer")),
            })
    return merged_txs


def get_unified_financial_data(
    db: Session,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Compile canonical financial facts across connected accounts and transactions."""
    profile = get_user_profile(user_id=user_id)

    # The app calls these endpoints without a user id. Scope that case to the
    # signed-in demo user so other users' rows (including test fixtures) cannot
    # change the forecast. Receipts saved before a user id existed stay included.
    scope_user = user_id or DEMO_USER_ID

    # 1. Accounts
    acc_query = db.query(Account).filter(Account.status != "disconnected")
    acc_query = acc_query.filter(
        (Account.user_id == scope_user) | (Account.user_id.is_(None))
    )
    accounts = acc_query.all()

    last_synced_at = None
    if accounts:
        sync_candidates = [a.last_synced_at for a in accounts if a.last_synced_at]
        if sync_candidates:
            last_synced_at = max(sync_candidates)

    # 2. Ledger plus this user's saved rows, each payment once.
    merged_txs = get_merged_transactions(db, user_id=user_id)

    # Cash today is the ledger's cash-conservation result, including this user's
    # own transactions. A previously stored mock balance is not a source of cash.
    mock_only = (not accounts) or all((a.provider or "") == "mock_aa" for a in accounts)
    if mock_only:
        available_balance = derive_closing_balance(
            [t for t in merged_txs if not t.get("is_internal_transfer")],
            float(profile.get("starting_balance") or 0.0),
        )
        primary = next((a for a in accounts if (a.bank_key or "") == PRIMARY_BANK_KEY), None)
        if primary is not None and float(primary.balance or 0.0) != available_balance:
            primary.balance = available_balance
            for other in accounts:
                if other is not primary:
                    other.balance = 0.0
            db.commit()
    else:
        available_balance = sum(float(a.balance or 0.0) for a in accounts)

    # 4. Settings (reserve defaults derived from the same transactions)
    settings = get_user_forecast_settings(db, user_id=user_id, transactions=merged_txs)

    return {
        "available_balance": available_balance,
        "accounts_count": len(accounts),
        "last_synced_at": last_synced_at,
        "transactions": merged_txs,
        "profile": profile,
        "settings": settings,
        "is_live_account": len(accounts) > 0,
    }
