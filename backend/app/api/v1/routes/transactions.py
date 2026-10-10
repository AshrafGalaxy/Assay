from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import uuid
from app.core.database import get_db
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate, TransactionOut, TransactionListResponse
from app.providers.aa.mock_provider import MockAAProvider
from app.services.financial_intelligence.ledger import get_ledger_transactions, get_transaction_by_id

router = APIRouter(prefix="/transactions", tags=["transactions"])
mock_provider = MockAAProvider()


def _to_transaction_out(item: dict) -> TransactionOut:
    return TransactionOut(
        id=item["id"],
        account_id=item.get("account_id"),
        amount=item["amount"],
        type=item["type"],
        category=item["category"],
        merchant_name=item["merchant_name"],
        description=item.get("description"),
        transaction_date=item["transaction_date"],
        is_recurring=item.get("is_recurring", False),
        is_fixed=item.get("is_fixed", False),
        is_discretionary=item.get("is_discretionary", True),
        source_type=item.get("source_type", "synthetic"),
        created_at=item.get("created_at"),
    )


@router.get("", response_model=TransactionListResponse)
def get_transactions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    transaction_type: Optional[str] = None,
    user_id: Optional[str] = Query(None, description="Synthetic UserID override"),
    db: Session = Depends(get_db),
):
    # Primary ledger for the prototype is the synthetic personal-finance dataset.
    # DB-backed rows (e.g. receipt OCR confirms) remain available via GET-by-id / POST.
    _ = db  # session retained for dependency parity with create/get-by-id
    ledger_items = get_ledger_transactions(user_id=user_id, historical_only=True)
    if category:
        ledger_items = [item for item in ledger_items if item["category"] == category]
    if transaction_type:
        ledger_items = [item for item in ledger_items if item["type"] == transaction_type]
    ledger_items.sort(key=lambda item: item["transaction_date"], reverse=True)
    return TransactionListResponse(
        items=[_to_transaction_out(item) for item in ledger_items[offset: offset + limit]],
        total=len(ledger_items),
        limit=limit,
        offset=offset,
    )


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: str, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        ledger_transaction = get_transaction_by_id(transaction_id)
        if ledger_transaction:
            return _to_transaction_out(ledger_transaction)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return TransactionOut(
        id=tx.id,
        account_id=tx.account_id,
        amount=tx.amount,
        type=tx.type,
        category=tx.category,
        merchant_name=tx.merchant_name,
        description=tx.description,
        transaction_date=tx.transaction_date,
        is_recurring=tx.is_recurring,
        is_fixed=tx.is_fixed,
        is_discretionary=tx.is_discretionary,
        source_type=tx.source_type,
        created_at=str(tx.created_at),
    )


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(tx_in: TransactionCreate, db: Session = Depends(get_db)):
    tx = Transaction(
        id=f"tx_{uuid.uuid4().hex[:8]}",
        account_id=tx_in.account_id,
        amount=tx_in.amount,
        type=tx_in.type,
        category=tx_in.category,
        merchant_name=tx_in.merchant_name,
        description=tx_in.description,
        transaction_date=tx_in.transaction_date,
        is_recurring=tx_in.is_recurring,
        is_fixed=tx_in.is_fixed,
        is_discretionary=tx_in.is_discretionary,
        source_type=tx_in.source_type,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    return TransactionOut(
        id=tx.id,
        account_id=tx.account_id,
        amount=tx.amount,
        type=tx.type,
        category=tx.category,
        merchant_name=tx.merchant_name,
        description=tx.description,
        transaction_date=tx.transaction_date,
        is_recurring=tx.is_recurring,
        is_fixed=tx.is_fixed,
        is_discretionary=tx.is_discretionary,
        source_type=tx.source_type,
        created_at=str(tx.created_at),
    )
