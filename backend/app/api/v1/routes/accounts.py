from typing import List, Optional
from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.schemas.account import (
    AccountOut,
    AccountLinkRequest,
    AccountSyncResponse,
    AccountConsentResponse,
    DemoConnectResponse,
)
from app.providers.aa.mock_provider import MockAAProvider, ledger_derived_balance
from app.api.v1.routes.transactions import get_current_user_id

router = APIRouter(prefix="/accounts", tags=["accounts"])
mock_provider = MockAAProvider()


def _format_time_now() -> str:
    now = datetime.now()
    return f"Today, {now.strftime('%I:%M %p').lstrip('0')}"


@router.post("/demo-connect", response_model=DemoConnectResponse)
async def demo_connect(db: Session = Depends(get_db)):
    """Creates/connects demo bank accounts via the mock AA provider."""
    mock_accounts = await mock_provider.fetch_accounts("consent_demo_123")
    
    for acc in mock_accounts:
        existing = db.query(Account).filter(Account.id == acc["id"]).first()
        if not existing:
            db_acc = Account(
                id=acc["id"],
                user_id="usr_demo_01",
                institution_name=acc["institution_name"],
                bank_key=acc.get("bank_key", "hdfc"),
                account_type=acc["account_type"],
                account_number_masked=acc["account_number_masked"],
                balance=acc["balance"],
                currency=acc["currency"],
                provider=acc["provider"],
                status=acc["status"],
                last_synced_at=_format_time_now(),
            )
            db.add(db_acc)
        else:
            existing.status = "connected"
            existing.last_synced_at = _format_time_now()
    db.commit()

    return DemoConnectResponse(
        account_id="acc_hdfc_01",
        provider="mock_aa",
        institution_name="HDFC Bank",
        status="connected",
    )


@router.get("", response_model=List[AccountOut])
def list_accounts(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Returns list of all accounts for the authenticated user."""
    user_id = get_current_user_id(authorization) if authorization else "usr_demo_01"
    # Rewrite the primary mock balance from the transaction history before responding,
    # so a previously stored seed cannot be shown as cash.
    from app.services.financial_intelligence.unified_data import get_unified_financial_data
    get_unified_financial_data(db, user_id=None if user_id == "usr_demo_01" else user_id)
    accounts = (
        db.query(Account)
        .filter((Account.user_id == user_id) | (Account.user_id.is_(None)))
        .all()
    )

    if not accounts:
        # Seed initial primary HDFC account if empty
        primary = Account(
            id="acc_hdfc_01",
            user_id=user_id,
            institution_name="HDFC Bank",
            bank_key="hdfc",
            account_type="Savings Account",
            account_number_masked="•••• 4821",
            balance=ledger_derived_balance(),
            currency="INR",
            provider="mock_aa",
            status="connected",
            last_synced_at=_format_time_now(),
        )
        db.add(primary)
        db.commit()
        db.refresh(primary)
        accounts = [primary]

    return accounts


@router.post("/connect", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
@router.post("/link", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def link_account(
    req: AccountLinkRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Securely link an additional bank account using the Account Aggregator flow."""
    user_id = get_current_user_id(authorization) if authorization else "usr_demo_01"
    bank_info = mock_provider.get_bank_details(req.bank_key)

    # Check for existing account by bank_key or institution_name
    existing = (
        db.query(Account)
        .filter(
            (Account.user_id == user_id) | (Account.user_id.is_(None)),
            (Account.bank_key == bank_info["bank_key"]) | (Account.id == bank_info["id"]),
        )
        .first()
    )

    if existing:
        existing.status = "connected"
        existing.last_synced_at = _format_time_now()
        existing.balance = bank_info.get("balance", existing.balance)
        db.commit()
        db.refresh(existing)
        target_account = existing
    else:
        new_id = bank_info["id"]
        # Ensure unique ID
        if db.query(Account).filter(Account.id == new_id).first():
            new_id = f"{new_id}_{str(uuid.uuid4())[:6]}"

        target_account = Account(
            id=new_id,
            user_id=user_id,
            institution_name=req.institution_name or bank_info["institution_name"],
            bank_key=bank_info["bank_key"],
            account_type=req.account_type or bank_info.get("account_type", "Savings Account"),
            account_number_masked=req.account_number_masked or bank_info.get("account_number_masked", "•••• 7712"),
            balance=bank_info.get("balance", 0.0),
            currency="INR",
            provider="mock_aa",
            status="connected",
            last_synced_at=_format_time_now(),
        )
        db.add(target_account)
        db.commit()
        db.refresh(target_account)

    # Import initial transactions for this account with deduplication
    raw_txs = await mock_provider.fetch_transactions(target_account.id)
    for raw in raw_txs:
        tx_id = raw["id"]
        if not db.query(Transaction).filter(Transaction.id == tx_id).first():
            db_tx = Transaction(
                id=tx_id,
                user_id=user_id,
                account_id=target_account.id,
                amount=raw["amount"],
                type=raw["type"],
                category=raw["category"],
                merchant_name=raw["merchant_name"],
                description=raw.get("description", raw["merchant_name"]),
                transaction_date=raw["transaction_date"],
                payment_method=raw.get("payment_method", "UPI"),
                is_recurring=raw.get("is_recurring", False),
                is_fixed=raw.get("is_fixed", False),
                is_discretionary=raw.get("is_discretionary", True),
                source_type="aa",
            )
            db.add(db_tx)
    db.commit()

    return target_account


@router.post("/{account_id}/sync", response_model=AccountSyncResponse)
async def sync_account(
    account_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Synchronize a specific bank account and import new statement records."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )

    # Update account sync state
    sync_time = _format_time_now()
    account.last_synced_at = sync_time
    account.status = "connected"

    # Fetch provider transactions and deduplicate
    imported_count = 0
    raw_txs = await mock_provider.fetch_transactions(account.id)
    user_id = account.user_id or "usr_demo_01"

    for raw in raw_txs:
        tx_id = raw["id"]
        if not db.query(Transaction).filter(Transaction.id == tx_id).first():
            db_tx = Transaction(
                id=tx_id,
                user_id=user_id,
                account_id=account.id,
                amount=raw["amount"],
                type=raw["type"],
                category=raw["category"],
                merchant_name=raw["merchant_name"],
                description=raw.get("description", raw["merchant_name"]),
                transaction_date=raw["transaction_date"],
                payment_method=raw.get("payment_method", "UPI"),
                is_recurring=raw.get("is_recurring", False),
                is_fixed=raw.get("is_fixed", False),
                is_discretionary=raw.get("is_discretionary", True),
                source_type="aa",
            )
            db.add(db_tx)
            imported_count += 1

    db.commit()
    db.refresh(account)

    return AccountSyncResponse(
        status="synchronized",
        account_id=account.id,
        institution_name=account.institution_name,
        balance=account.balance,
        synced_records=imported_count or len(raw_txs),
        last_synced=sync_time,
    )


@router.post("/{account_id}/disconnect")
@router.delete("/{account_id}")
def disconnect_account(
    account_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Revoke consent and disconnect ONLY the specified bank account."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )

    account.status = "disconnected"
    db.commit()

    return {
        "status": "disconnected",
        "account_id": account_id,
        "message": f"{account.institution_name} has been disconnected. Historical records preserved.",
    }


@router.get("/{account_id}/consent", response_model=AccountConsentResponse)
def get_account_consent(
    account_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve active consent parameters for a specific linked bank account."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )

    return AccountConsentResponse(
        account_id=account.id,
        institution_name=account.institution_name,
        consent_id=f"AA-CONSENT-{account.bank_key or 'BANK'}-2026-9812",
        status=account.status.upper(),
        purpose="Personal Financial Management & Health Tracking",
        data_range="Last 12 months & ongoing",
        fetch_frequency="Daily / On-demand",
        expiry_date="20 Sep 2027",
    )

