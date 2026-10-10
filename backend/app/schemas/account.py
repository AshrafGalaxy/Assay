from typing import Optional, List, Union
from datetime import datetime
from pydantic import BaseModel


class AccountBase(BaseModel):
    institution_name: str
    account_type: str = "savings"
    account_number_masked: Optional[str] = None
    balance: float = 0.0
    currency: str = "INR"
    bank_key: Optional[str] = None


class AccountCreate(AccountBase):
    id: Optional[str] = None
    provider: Optional[str] = "mock_aa"
    status: Optional[str] = "connected"


class AccountLinkRequest(BaseModel):
    bank_key: str
    institution_name: Optional[str] = None
    account_type: Optional[str] = "Savings Account"
    account_number_masked: Optional[str] = None
    consent_id: Optional[str] = None


class AccountOut(AccountBase):
    id: str
    provider: str
    status: str
    created_at: Optional[Union[datetime, str]] = None
    bank_key: Optional[str] = None
    last_synced_at: Optional[str] = None

    class Config:
        from_attributes = True


class AccountSyncResponse(BaseModel):
    status: str
    account_id: str
    institution_name: str
    balance: float
    synced_records: int
    last_synced: str


class AccountConsentResponse(BaseModel):
    account_id: str
    institution_name: str
    consent_id: str
    status: str
    purpose: str
    data_range: str
    fetch_frequency: str
    expiry_date: str


class DemoConnectResponse(BaseModel):
    account_id: str
    provider: str
    institution_name: str
    status: str
