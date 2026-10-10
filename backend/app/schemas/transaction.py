from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class TransactionBase(BaseModel):
    user_id: Optional[str] = None
    account_id: Optional[str] = None
    amount: float
    type: str  # "debit" | "credit" | "expense" | "income"
    category: str
    merchant_name: str
    description: Optional[str] = None
    transaction_date: Optional[str] = None
    payment_method: Optional[str] = "UPI"
    is_recurring: bool = False
    is_fixed: bool = False
    is_discretionary: bool = True
    source_type: str = "manual"  # "aa" | "receipt_ocr" | "upi_ocr" | "manual"


class TransactionCreate(TransactionBase):
    pass


class TransactionOut(TransactionBase):
    id: str
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class TransactionListResponse(BaseModel):
    items: List[TransactionOut]
    total: int
    limit: int
    offset: int
