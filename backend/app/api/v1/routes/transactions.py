from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
import uuid
from jose import jwt, JWTError

from app.core.config import settings
from app.core.database import get_db
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate, TransactionOut, TransactionListResponse
from app.providers.aa.mock_provider import MockAAProvider
from app.services.financial_intelligence.ledger import (
    get_ledger_transactions,
    get_transaction_by_id,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])
mock_provider = MockAAProvider()

VALID_CATEGORIES = {
    # Expenses
    "Food & Dining",
    "Shopping",
    "Transport",
    "Transportation",
    "Subscriptions",
    "Bills & Utilities",
    "Utilities",
    "Groceries",
    "Entertainment",
    "Healthcare",
    "Housing & Rent",
    "Travel",
    "Education",
    "Other",
    "Others",
    # Income
    "Salary",
    "Freelance",
    "Investment",
    "Business",
    "Rental",
    "Other Income",
}

VALID_PAYMENT_METHODS = {"UPI", "Card", "Cash", "Bank", "Wallet"}


def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """Extract authenticated user id from Bearer JWT token, or default to active session user if unauthenticated."""
    if authorization:
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header format. Expected 'Bearer <token>'.",
            )
        token = authorization.split(" ")[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = payload.get("sub")
            if user_id:
                return str(user_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload.",
            )
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication credentials.",
            )
    return "usr_demo_01"


def _to_transaction_out(item: dict) -> TransactionOut:
    return TransactionOut(
        id=item["id"],
        user_id=item.get("user_id"),
        account_id=item.get("account_id"),
        amount=item["amount"],
        type=item["type"],
        category=item["category"],
        merchant_name=item["merchant_name"],
        description=item.get("description"),
        transaction_date=item["transaction_date"],
        payment_method=item.get("payment_method", "UPI"),
        is_recurring=item.get("is_recurring", False),
        is_fixed=item.get("is_fixed", False),
        is_discretionary=item.get("is_discretionary", True),
        source_type=item.get("source_type", "synthetic"),
        created_at=item.get("created_at"),
    )


def get_all_unified_transactions(
    db: Session,
    category: Optional[str] = None,
    transaction_type: Optional[str] = None,
    user_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Return unified transactions combining DB records with synthetic ledger data."""
    query = db.query(Transaction)
    if user_id and user_id != "usr_demo_01":
        query = query.filter((Transaction.user_id == user_id) | (Transaction.user_id.is_(None)))
    if category:
        query = query.filter(Transaction.category == category)
    if transaction_type:
        norm_type = "credit" if transaction_type in ["credit", "income"] else "debit"
        query = query.filter(Transaction.type == norm_type)

    db_records = query.order_by(Transaction.created_at.desc(), Transaction.transaction_date.desc()).all()

    db_items: list[dict[str, Any]] = [
        {
            "id": tx.id,
            "user_id": tx.user_id or "usr_demo_01",
            "account_id": tx.account_id or "primary_account",
            "amount": float(tx.amount),
            "type": tx.type,
            "category": tx.category,
            "merchant_name": tx.merchant_name,
            "description": tx.description or tx.merchant_name,
            "transaction_date": tx.transaction_date,
            "payment_method": tx.payment_method or "UPI",
            "is_recurring": bool(tx.is_recurring),
            "is_fixed": bool(tx.is_fixed),
            "is_discretionary": bool(tx.is_discretionary),
            "source_type": tx.source_type or "manual",
            "created_at": str(tx.created_at) if tx.created_at else None,
        }
        for tx in db_records
    ]

    ledger_items = get_ledger_transactions(user_id=user_id, historical_only=True)
    if category:
        ledger_items = [d for d in ledger_items if d.get("category") == category]
    if transaction_type:
        norm_type = "credit" if transaction_type in ["credit", "income"] else "debit"
        ledger_items = [d for d in ledger_items if d.get("type") == norm_type]

    existing_ids = {item["id"] for item in db_items}
    merged = db_items + [
        {
            **d,
            "user_id": "usr_demo_01",
            "payment_method": d.get("payment_method", "UPI"),
            "created_at": None,
        }
        for d in ledger_items
        if d["id"] not in existing_ids
    ]
    merged.sort(key=lambda item: str(item.get("transaction_date", "")), reverse=True)
    return merged


@router.get("", response_model=TransactionListResponse)
def get_transactions(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    transaction_type: Optional[str] = None,
    user_id: Optional[str] = Query(None, description="Synthetic UserID override"),
    source_type: Optional[str] = Query(None, description="'synthetic' or 'manual'"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user_id = user_id or (get_current_user_id(authorization) if authorization else None)
    if source_type == "manual":
        query = db.query(Transaction)
        if current_user_id and current_user_id != "usr_demo_01":
            query = query.filter((Transaction.user_id == current_user_id) | (Transaction.user_id.is_(None)))
        if category:
            query = query.filter(Transaction.category == category)
        if transaction_type:
            norm_type = "credit" if transaction_type in ["credit", "income"] else "debit"
            query = query.filter(Transaction.type == norm_type)
        db_records = query.order_by(Transaction.created_at.desc(), Transaction.transaction_date.desc()).all()
        items = [
            _to_transaction_out({
                "id": tx.id,
                "user_id": tx.user_id,
                "account_id": tx.account_id,
                "amount": float(tx.amount),
                "type": tx.type,
                "category": tx.category,
                "merchant_name": tx.merchant_name,
                "description": tx.description,
                "transaction_date": tx.transaction_date,
                "payment_method": tx.payment_method or "UPI",
                "is_recurring": bool(tx.is_recurring),
                "is_fixed": bool(tx.is_fixed),
                "is_discretionary": bool(tx.is_discretionary),
                "source_type": tx.source_type or "manual",
                "created_at": str(tx.created_at) if tx.created_at else None,
            })
            for tx in db_records
        ]
        return TransactionListResponse(
            items=items[offset : offset + limit],
            total=len(items),
            limit=limit,
            offset=offset,
        )

    ledger_items = get_ledger_transactions(user_id=current_user_id, historical_only=True)
    if category:
        ledger_items = [d for d in ledger_items if d.get("category") == category]
    if transaction_type:
        norm_type = "credit" if transaction_type in ["credit", "income"] else "debit"
        ledger_items = [d for d in ledger_items if d.get("type") == norm_type]

    if source_type == "synthetic":
        unified = ledger_items
    else:
        db_records = db.query(Transaction).all()
        db_items = [
            {
                "id": tx.id,
                "user_id": tx.user_id,
                "account_id": tx.account_id,
                "amount": float(tx.amount),
                "type": tx.type,
                "category": tx.category,
                "merchant_name": tx.merchant_name,
                "description": tx.description,
                "transaction_date": tx.transaction_date,
                "payment_method": tx.payment_method or "UPI",
                "is_recurring": bool(tx.is_recurring),
                "is_fixed": bool(tx.is_fixed),
                "is_discretionary": bool(tx.is_discretionary),
                "source_type": tx.source_type or "manual",
                "created_at": str(tx.created_at) if tx.created_at else None,
            }
            for tx in db_records
        ]
        if category:
            db_items = [d for d in db_items if d.get("category") == category]
        if transaction_type:
            norm_type = "credit" if transaction_type in ["credit", "income"] else "debit"
            db_items = [d for d in db_items if d.get("type") == norm_type]

        existing_ids = {item["id"] for item in ledger_items}
        unified = ledger_items + [d for d in db_items if d["id"] not in existing_ids]

    total = len(unified)
    page_items = unified[offset : offset + limit]

    return TransactionListResponse(
        items=[_to_transaction_out(item) for item in page_items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(
    transaction_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if tx:
        return TransactionOut(
            id=tx.id,
            user_id=tx.user_id,
            account_id=tx.account_id,
            amount=tx.amount,
            type=tx.type,
            category=tx.category,
            merchant_name=tx.merchant_name,
            description=tx.description,
            transaction_date=tx.transaction_date,
            payment_method=tx.payment_method or "UPI",
            is_recurring=tx.is_recurring,
            is_fixed=tx.is_fixed,
            is_discretionary=tx.is_discretionary,
            source_type=tx.source_type,
            created_at=str(tx.created_at) if tx.created_at else None,
        )

    ledger_transaction = get_transaction_by_id(transaction_id)
    if ledger_transaction:
        return _to_transaction_out(ledger_transaction)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    tx_in: TransactionCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    # ── 1. Authenticate & associate user ──
    auth_user_id = get_current_user_id(authorization)
    target_user_id = auth_user_id

    # ── 2. Server-side validation ──
    try:
        amount_val = float(tx_in.amount)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Amount must be a valid numeric value.",
        )

    if amount_val <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Transaction amount must be greater than zero.",
        )

    if amount_val > 100_000_000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Amount exceeds the maximum permissible limit of ₹10,00,00,000.",
        )

    merchant = (tx_in.merchant_name or "").strip()
    if not merchant:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Merchant or transaction title is required.",
        )

    category = (tx_in.category or "").strip()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category is required.",
        )
    if category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category: '{category}'.",
        )

    # Payment method validation
    payment_method_raw = (tx_in.payment_method or "UPI").strip()
    matched_method = next((m for m in VALID_PAYMENT_METHODS if m.lower() == payment_method_raw.lower()), None)
    if not matched_method:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid payment method: '{payment_method_raw}'. Must be one of: UPI, Card, Cash, Bank, Wallet.",
        )
    payment_method = matched_method

    # Normalize type: 'credit' / 'income' -> 'credit', 'debit' / 'expense' -> 'debit'
    tx_type_raw = (tx_in.type or "").lower().strip()
    if tx_type_raw in ["credit", "income"]:
        normalized_type = "credit"
    elif tx_type_raw in ["debit", "expense"]:
        normalized_type = "debit"
    else:
        normalized_type = "debit"

    # Normalize date
    tx_date = (tx_in.transaction_date or "").strip()
    if not tx_date or tx_date.lower().startswith("today"):
        tx_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    elif tx_date.lower().startswith("yesterday"):
        tx_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")

    # ── 3. Prevent Duplicate Submissions (idempotency guard) ──
    recent_cutoff = datetime.now(timezone.utc) - timedelta(seconds=20)
    existing_duplicate = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == target_user_id,
            Transaction.merchant_name == merchant,
            Transaction.amount == amount_val,
            Transaction.category == category,
            Transaction.type == normalized_type,
            Transaction.created_at >= recent_cutoff,
        )
        .first()
    )
    if existing_duplicate:
        return TransactionOut(
            id=existing_duplicate.id,
            user_id=existing_duplicate.user_id,
            account_id=existing_duplicate.account_id,
            amount=existing_duplicate.amount,
            type=existing_duplicate.type,
            category=existing_duplicate.category,
            merchant_name=existing_duplicate.merchant_name,
            description=existing_duplicate.description,
            transaction_date=existing_duplicate.transaction_date,
            payment_method=existing_duplicate.payment_method or "UPI",
            is_recurring=existing_duplicate.is_recurring,
            is_fixed=existing_duplicate.is_fixed,
            is_discretionary=existing_duplicate.is_discretionary,
            source_type=existing_duplicate.source_type,
            created_at=str(existing_duplicate.created_at) if existing_duplicate.created_at else None,
        )

    # ── 4. Persist to database ──
    new_id = f"tx_{uuid.uuid4().hex[:8]}"
    tx = Transaction(
        id=new_id,
        user_id=target_user_id,
        account_id=tx_in.account_id or "primary_account",
        amount=amount_val,
        type=normalized_type,
        category=category,
        merchant_name=merchant,
        description=tx_in.description.strip() if tx_in.description else None,
        transaction_date=tx_date,
        payment_method=payment_method,
        is_recurring=bool(tx_in.is_recurring),
        is_fixed=bool(tx_in.is_fixed),
        is_discretionary=bool(tx_in.is_discretionary),
        source_type=tx_in.source_type or "manual",
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    return TransactionOut(
        id=tx.id,
        user_id=tx.user_id,
        account_id=tx.account_id,
        amount=tx.amount,
        type=tx.type,
        category=tx.category,
        merchant_name=tx.merchant_name,
        description=tx.description,
        transaction_date=tx.transaction_date,
        payment_method=tx.payment_method or "UPI",
        is_recurring=tx.is_recurring,
        is_fixed=tx.is_fixed,
        is_discretionary=tx.is_discretionary,
        source_type=tx.source_type,
        created_at=str(tx.created_at) if tx.created_at else None,
    )
