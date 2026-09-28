from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class LineItem(BaseModel):
    name: str
    quantity: Optional[float] = 1.0
    unit_price: Optional[float] = None
    total_price: Optional[float] = None


class FieldConfidence(BaseModel):
    value: Any = None
    confidence: float = 0.0


class ReceiptFieldConfidences(BaseModel):
    merchant: Optional[FieldConfidence] = None
    total_amount: Optional[FieldConfidence] = None
    subtotal: Optional[FieldConfidence] = None
    tax: Optional[FieldConfidence] = None
    date: Optional[FieldConfidence] = None
    payment_method: Optional[FieldConfidence] = None


class ParsedReceipt(BaseModel):
    merchant: Optional[str] = None
    total_amount: Optional[float] = None
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    currency: str = "INR"
    date: Optional[str] = None  # Normalized to YYYY-MM-DD
    time: Optional[str] = None  # Normalized to HH:MM
    payment_method: Optional[str] = None  # "UPI" | "Credit Card" | "Debit Card" | "Cash" | "Bank Transfer" | "UNKNOWN"
    transaction_reference: Optional[str] = None


class ReceiptOCRInfo(BaseModel):
    engine: str = "easyocr"  # "easyocr" | "tesseract"
    overall_confidence: float = 0.0
    field_confidences: Optional[ReceiptFieldConfidences] = None


class ReceiptOCRResponse(BaseModel):
    upload_id: str
    status: str = "PROCESSED"  # "PROCESSED" | "UNREADABLE" | "MANUAL_ENTRY_REQUIRED"
    ocr: ReceiptOCRInfo
    receipt: ParsedReceipt
    line_items: List[LineItem] = Field(default_factory=list)
    raw_text: str = ""
    requires_review: bool = True
    suggested_category: Optional[str] = None
    message: Optional[str] = None


class ReceiptConfirmRequest(BaseModel):
    merchant: str
    total_amount: float
    category: Optional[str] = "Food & Dining"
    date: Optional[str] = None
    time: Optional[str] = None
    payment_method: Optional[str] = None
    transaction_reference: Optional[str] = None
    account_id: Optional[str] = None
    description: Optional[str] = None
    line_items: Optional[List[LineItem]] = None


class ReceiptConfirmResponse(BaseModel):
    status: str = "confirmed"
    transaction_id: str
    confirmed_data: Dict[str, Any]
    category: Optional[str] = None
