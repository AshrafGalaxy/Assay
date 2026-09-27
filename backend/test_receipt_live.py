"""
Live CLI receipt OCR tester for ASSAY Backend.
Usage:
    python test_receipt_live.py [path/to/receipt.jpg]
If no path is provided, it generates a realistic sample Starbucks receipt image and runs OCR on it.
"""

import sys
import os
import json
import io
from PIL import Image, ImageDraw, ImageFont

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.ocr.ocr_pipeline import ocr_pipeline


def generate_sample_receipt() -> bytes:
    """Generates a realistic test receipt image."""
    img = Image.new("RGB", (600, 750), color=(250, 250, 250))
    draw = ImageDraw.Draw(img)

    lines = [
        "STARBUCKS COFFEE INDIA",
        "Connaught Place, New Delhi",
        "GSTIN: 07AAACS1234F1Z5",
        "------------------------------------",
        "Date: 26/09/2026    Time: 10:42 AM",
        "Bill No: STB-829104",
        "------------------------------------",
        "Cappuccino Grande     1    240.00",
        "Blueberry Muffin      1    160.00",
        "------------------------------------",
        "Subtotal:                 ₹400.00",
        "CGST 2.5%:                 ₹10.00",
        "SGST 2.5%:                 ₹10.00",
        "TOTAL AMOUNT:             ₹420.00",
        "------------------------------------",
        "Paid via: Google Pay UPI",
        "UPI Ref No: 938201948201",
        "------------------------------------",
        "Thank you for visiting Starbucks!",
    ]

    y = 35
    for line in lines:
        draw.text((40, y), line, fill=(20, 20, 20))
        y += 35

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    sample_path = os.path.join(os.path.dirname(__file__), "sample_receipt.jpg")
    img.save(sample_path)
    print(f" Saved sample test receipt to: {sample_path}")
    return buf.getvalue()


def run_live_ocr(image_path: str = None):
    print("=" * 60)
    print("       ASSAY LOCAL RECEIPT OCR - LIVE TEST")
    print("=" * 60)

    if image_path and os.path.exists(image_path):
        print(f" Loading image from: {image_path}")
        with open(image_path, "rb") as f:
            image_bytes = f.read()
    else:
        print(" Generating realistic sample receipt image...")
        image_bytes = generate_sample_receipt()

    print("\n Running local OCR pipeline (EasyOCR + Preprocessing + Parser)...")
    result = ocr_pipeline.process_receipt_image(image_bytes)

    print("\n" + "=" * 60)
    print("                  OCR RESULT")
    print("=" * 60)
    print(json.dumps(result.model_dump(), indent=2, default=str))

    print("\n" + "=" * 60)
    print("               EXTRACTION SUMMARY")
    print("=" * 60)
    print(f" Merchant:           {result.receipt.merchant}")
    print(f" Total Amount:       ₹{result.receipt.total_amount}")
    print(f" Subtotal:           ₹{result.receipt.subtotal}")
    print(f" Tax:                ₹{result.receipt.tax}")
    print(f" Date:               {result.receipt.date}")
    print(f" Time:               {result.receipt.time}")
    print(f" Payment Method:     {result.receipt.payment_method}")
    print(f" Transaction Ref:    {result.receipt.transaction_reference}")
    print(f" Suggested Category: {result.suggested_category}")
    print(f" Overall Confidence: {result.ocr.overall_confidence * 100:.1f}%")
    print(f" OCR Engine:         {result.ocr.engine}")
    print("=" * 60)


if __name__ == "__main__":
    path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    run_live_ocr(path_arg)
