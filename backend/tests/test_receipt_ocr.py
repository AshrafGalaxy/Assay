import io
import pytest
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from fastapi.testclient import TestClient

from app.main import app
from app.utils.image_validation import is_magic_match, validate_image_upload
from app.services.ocr.preprocessing import preprocess_receipt_image, resize_image_for_ocr
from app.services.ocr.receipt_parser import ReceiptParser, clean_amount_string, parse_date_string, parse_time_string
from app.services.ocr.ocr_pipeline import ocr_pipeline, ReceiptOCRPipeline
from app.services.categorization.categorizer import categorizer

client = TestClient(app)


def create_receipt_image(lines: list[str], width: int = 500, height: int = 700, blur: bool = False) -> bytes:
    """Helper to generate a clean synthetic receipt image in JPEG format."""
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    y = 30
    for line in lines:
        draw.text((30, y), line, fill=(0, 0, 0))
        y += 35

    if blur:
        img = img.filter(ImageFilter.GaussianBlur(radius=3))

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. Clean Amount, Date, Time & Parser Unit Tests
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def test_clean_amount_string():
    assert clean_amount_string("₹340.00") == 340.0
    assert clean_amount_string("Rs. 1,250.50") == 1250.50
    assert clean_amount_string("TOTAL: 499") == 499.0
    assert clean_amount_string("INR 85.25") == 85.25
    assert clean_amount_string("Invalid text") is None


def test_parse_date_string():
    date_str, conf = parse_date_string("Date: 26/09/2026")
    assert date_str == "2026-09-26"
    assert conf > 0.8

    date_str2, conf2 = parse_date_string("26 Sep 2026")
    assert date_str2 == "2026-09-26"
    assert conf2 > 0.8

    date_str3, _ = parse_date_string("2026-09-26")
    assert date_str3 == "2026-09-26"

    date_str4, _ = parse_date_string("No date here")
    assert date_str4 is None


def test_parse_time_string():
    assert parse_time_string("Time: 10:42 AM") == "10:42"
    assert parse_time_string("14:30:00") == "14:30"
    assert parse_time_string("08:15 PM") == "20:15"
    assert parse_time_string("invalid") is None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. ReceiptParser Scenario Tests
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def test_parser_clear_restaurant_receipt():
    parser = ReceiptParser()
    elements = [
        {"text": "Starbucks Coffee", "confidence": 0.98},
        {"text": "Cappuccino 1 220.00", "confidence": 0.95},
        {"text": "Croissant 1 120.00", "confidence": 0.95},
        {"text": "Subtotal: 340.00", "confidence": 0.96},
        {"text": "CGST 2.5%: 8.50", "confidence": 0.92},
        {"text": "SGST 2.5%: 8.50", "confidence": 0.92},
        {"text": "TOTAL: ₹357.00", "confidence": 0.99},
        {"text": "Date: 26/09/2026", "confidence": 0.95},
        {"text": "Time: 10:42 AM", "confidence": 0.90},
        {"text": "Payment: UPI", "confidence": 0.95},
    ]
    result = parser.parse(elements)
    receipt = result["receipt"]
    
    assert receipt["merchant"] == "Starbucks Coffee"
    assert receipt["total_amount"] == 357.0
    assert receipt["subtotal"] == 340.0
    assert receipt["tax"] == 17.0
    assert receipt["date"] == "2026-09-26"
    assert receipt["time"] == "10:42"
    assert receipt["payment_method"] == "UPI"
    assert result["overall_confidence"] > 0.85
    assert len(result["line_items"]) >= 2


def test_parser_subtotal_plus_tax_consistency():
    parser = ReceiptParser()
    elements = [
        {"text": "Blue Tokai Coffee", "confidence": 0.95},
        {"text": "Subtotal: 300.00", "confidence": 0.90},
        {"text": "CGST: 18.00", "confidence": 0.90},
        {"text": "SGST: 18.00", "confidence": 0.90},
        {"text": "Grand Total: ₹336.00", "confidence": 0.95},
    ]
    result = parser.parse(elements)
    receipt = result["receipt"]
    
    assert receipt["total_amount"] == 336.0
    assert receipt["subtotal"] == 300.0
    assert receipt["tax"] == 36.0
    assert result["field_confidences"]["total_amount"]["confidence"] >= 0.96


def test_parser_receipt_without_tax():
    parser = ReceiptParser()
    elements = [
        {"text": "Sharma Kirana Store", "confidence": 0.92},
        {"text": "Rice 5kg 350.00", "confidence": 0.90},
        {"text": "Sugar 1kg 50.00", "confidence": 0.90},
        {"text": "Total Amount: 400.00", "confidence": 0.95},
        {"text": "Paid via Cash", "confidence": 0.90},
    ]
    result = parser.parse(elements)
    receipt = result["receipt"]

    assert receipt["merchant"] == "Sharma Kirana Store"
    assert receipt["total_amount"] == 400.0
    assert receipt["tax"] is None
    assert receipt["payment_method"] == "Cash"


def test_parser_receipt_with_card():
    parser = ReceiptParser()
    elements = [
        {"text": "Zara Retail India", "confidence": 0.95},
        {"text": "Amount: 2490.00", "confidence": 0.95},
        {"text": "Date: 15-Aug-2026", "confidence": 0.90},
        {"text": "Paid by Visa Credit Card", "confidence": 0.95},
        {"text": "Auth Code: 839201", "confidence": 0.90},
    ]
    result = parser.parse(elements)
    receipt = result["receipt"]

    assert receipt["merchant"] == "Zara Retail India"
    assert receipt["total_amount"] == 2490.0
    assert receipt["date"] == "2026-08-15"
    assert receipt["payment_method"] == "Credit Card"
    assert receipt["transaction_reference"] == "839201"


def test_parser_missing_date_and_payment():
    parser = ReceiptParser()
    elements = [
        {"text": "Local Street Bakery", "confidence": 0.90},
        {"text": "Bread 45.00", "confidence": 0.85},
        {"text": "Total: 45.00", "confidence": 0.95},
    ]
    result = parser.parse(elements)
    receipt = result["receipt"]

    assert receipt["merchant"] == "Local Street Bakery"
    assert receipt["total_amount"] == 45.0
    assert receipt["date"] is None
    assert receipt["payment_method"] == "UNKNOWN"


def test_parser_receipt_with_upi():
    parser = ReceiptParser()
    elements = [
        {"text": "Subway Sandwiches", "confidence": 0.96},
        {"text": "Veggie Delight 1 240.00", "confidence": 0.94},
        {"text": "Total Amount: ₹240.00", "confidence": 0.98},
        {"text": "Paid via Google Pay UPI", "confidence": 0.95},
        {"text": "UPI Ref No: 938271048291", "confidence": 0.97},
        {"text": "Date: 27/09/2026", "confidence": 0.95},
    ]
    result = parser.parse(elements)
    receipt = result["receipt"]

    assert receipt["merchant"] == "Subway Sandwiches"
    assert receipt["total_amount"] == 240.0
    assert receipt["payment_method"] == "UPI"
    assert receipt["transaction_reference"] == "938271048291"
    assert receipt["date"] == "2026-09-27"


def test_parser_receipt_with_multiple_line_items():
    parser = ReceiptParser()
    elements = [
        {"text": "Haldiram Sweets & Restaurant", "confidence": 0.95},
        {"text": "Raj Kachori 2 120 240.00", "confidence": 0.92},
        {"text": "Chole Bhature 1 180 180.00", "confidence": 0.92},
        {"text": "Gulab Jamun 2 40 80.00", "confidence": 0.92},
        {"text": "Subtotal: 500.00", "confidence": 0.95},
        {"text": "GST 5%: 25.00", "confidence": 0.90},
        {"text": "Net Payable: ₹525.00", "confidence": 0.99},
    ]
    result = parser.parse(elements)
    receipt = result["receipt"]
    line_items = result["line_items"]

    assert receipt["merchant"] == "Haldiram Sweets & Restaurant"
    assert receipt["total_amount"] == 525.0
    assert len(line_items) == 3
    assert line_items[0]["name"] == "Raj Kachori"
    assert line_items[0]["quantity"] == 2.0
    assert line_items[0]["total_price"] == 240.0


def test_pipeline_blurry_receipt_handling():
    blurry_bytes = create_receipt_image(["Unclear Merchant", "Total: 100.00"], blur=True)
    orig, preprocessed = preprocess_receipt_image(blurry_bytes)
    assert orig is not None
    assert preprocessed is not None


def test_pipeline_unreadable_image_handling():
    pipeline = ReceiptOCRPipeline()
    # Pass 1x1 empty pixel or corrupted bytes
    result = pipeline.process_receipt_image(b"not an image bytes")
    assert result.status == "UNREADABLE"
    assert result.requires_review is True
    assert result.receipt.total_amount is None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. Categorization Layer Tests (Decoupled from OCR)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def test_categorization_independent_layer():
    assert categorizer.categorize(merchant_name="Starbucks") == "Food & Dining"
    assert categorizer.categorize(merchant_name="Blue Tokai Coffee Roasters") == "Food & Dining"
    assert categorizer.categorize(merchant_name="Blinkit Quick Delivery") == "Groceries"
    assert categorizer.categorize(merchant_name="Apollo Pharmacy") == "Healthcare"
    assert categorizer.categorize(merchant_name="Uber India") == "Transportation"
    assert categorizer.categorize(merchant_name="Netflix Entertainment") == "Entertainment"
    assert categorizer.categorize(merchant_name="Unknown Vendor") == "Other"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. Image Preprocessing Tests
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def test_image_preprocessing_non_destructive():
    raw_bytes = create_receipt_image(["Test Coffee Shop", "Total: 150.00"])
    orig, preprocessed = preprocess_receipt_image(raw_bytes)
    
    assert orig is not None
    assert preprocessed is not None
    assert orig.shape[2] == 3
    assert preprocessed.shape[2] == 3
    assert isinstance(preprocessed, np.ndarray)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. Image Validation & Security Tests
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def test_magic_bytes_detection():
    jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 20
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    webp_bytes = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 20
    fake_exe = b"MZ\x90\x00" + b"\x00" * 20

    assert is_magic_match(jpeg_bytes) is True
    assert is_magic_match(png_bytes) is True
    assert is_magic_match(webp_bytes) is True
    assert is_magic_match(fake_exe) is False


def test_api_upload_invalid_file_type():
    fake_file = io.BytesIO(b"Not an image text data content")
    response = client.post(
        "/api/v1/uploads/receipt",
        files={"file": ("malicious.exe", fake_file, "application/octet-stream")},
    )
    assert response.status_code in [400, 415]


def test_api_upload_corrupted_image():
    corrupted_data = b"\xff\xd8\xff" + b"\x00" * 50  # Bad truncated header
    response = client.post(
        "/api/v1/uploads/receipt",
        files={"file": ("corrupt.jpg", io.BytesIO(corrupted_data), "image/jpeg")},
    )
    assert response.status_code in [400, 415, 422]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. End-to-End API Upload and Confirmation Tests
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def test_api_upload_receipt_and_confirm_flow(monkeypatch):
    receipt_bytes = create_receipt_image([
        "Starbucks Coffee",
        "Cappuccino 1 220.00",
        "Croissant 1 120.00",
        "Total: 340.00",
        "Date: 26/09/2026",
        "UPI Ref: UPI/8372619472/PAY",
    ])

    mock_ocr_elements = [
        {"text": "Starbucks Coffee", "confidence": 0.98, "bounding_box": [[10, 10], [200, 10], [200, 30], [10, 30]]},
        {"text": "Cappuccino 1 220.00", "confidence": 0.95, "bounding_box": [[10, 40], [200, 40], [200, 60], [10, 60]]},
        {"text": "Croissant 1 120.00", "confidence": 0.95, "bounding_box": [[10, 70], [200, 70], [200, 90], [10, 90]]},
        {"text": "Total: 340.00", "confidence": 0.99, "bounding_box": [[10, 100], [200, 100], [200, 120], [10, 120]]},
        {"text": "Date: 26/09/2026", "confidence": 0.95, "bounding_box": [[10, 130], [200, 130], [200, 150], [10, 150]]},
        {"text": "UPI Ref: UPI/8372619472/PAY", "confidence": 0.96, "bounding_box": [[10, 160], [200, 160], [200, 180], [10, 180]]},
    ]

    monkeypatch.setattr(
        ocr_pipeline.easyocr_service,
        "extract_text_and_boxes",
        lambda img: mock_ocr_elements,
    )

    # 1. Upload receipt to OCR endpoint
    upload_res = client.post(
        "/api/v1/uploads/receipt",
        files={"file": ("receipt.jpg", io.BytesIO(receipt_bytes), "image/jpeg")},
    )
    assert upload_res.status_code == 200
    data = upload_res.json()

    assert "upload_id" in data
    assert data["requires_review"] is True
    assert "ocr" in data
    assert "receipt" in data
    assert data["ocr"]["engine"] == "easyocr"
    assert data["receipt"]["merchant"] == "Starbucks Coffee"
    assert data["receipt"]["total_amount"] == 340.0
    assert data["receipt"]["date"] == "2026-09-26"
    assert data["suggested_category"] == "Food & Dining"

    upload_id = data["upload_id"]

    # 2. Confirm transaction with user review / edits
    confirm_res = client.post(
        f"/api/v1/uploads/{upload_id}/confirm",
        json={
            "merchant": data["receipt"]["merchant"],
            "total_amount": data["receipt"]["total_amount"],
            "category": "Food & Dining",
            "date": "2026-09-26",
            "payment_method": "UPI",
            "line_items": [
                {"name": "Cappuccino", "quantity": 1, "unit_price": 220.0, "total_price": 220.0}
            ],
        },
    )
    assert confirm_res.status_code == 201
    confirm_data = confirm_res.json()
    assert confirm_data["status"] == "confirmed"
    assert confirm_data["transaction_id"].startswith("tx_")
    assert confirm_data["category"] == "Food & Dining"
