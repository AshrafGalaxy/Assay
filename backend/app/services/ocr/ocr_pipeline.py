import time
import uuid
import logging
from typing import Dict, Any, Optional

from app.services.ocr.preprocessing import preprocess_receipt_image
from app.services.ocr.tesseract_service import TesseractService
from app.services.ocr.receipt_parser import ReceiptParser
from app.services.categorization.categorizer import categorizer
from app.schemas.receipt import (
    ReceiptOCRResponse,
    ReceiptOCRInfo,
    ParsedReceipt,
    ReceiptFieldConfidences,
    FieldConfidence,
    LineItem,
)

logger = logging.getLogger(__name__)


class ReceiptOCRPipeline:
    """Local receipt OCR pipeline using OpenCV preprocessing and Tesseract only."""

    def __init__(self):
        self.tesseract_service = TesseractService()
        self.parser = ReceiptParser()

    def process_receipt_image(
        self,
        image_bytes: bytes,
        upload_id: Optional[str] = None,
    ) -> ReceiptOCRResponse:
        """
        Executes the end-to-end receipt OCR pipeline:
        1. Non-destructive OpenCV preprocessing
        2. OCR extraction via local Tesseract
        3. Deterministic receipt parsing and field confidence calculation
        4. Suggests financial category via separate categorizer
        5. Emits structured privacy-safe logs
        """
        start_time = time.time()
        upload_id = upload_id or f"upl_{uuid.uuid4().hex[:8]}"
        engine_used = "tesseract"
        ocr_elements = []
        status = "PROCESSED"
        message = None

        # Step 1: Preprocess image with OpenCV
        try:
            _, preprocessed_img = preprocess_receipt_image(image_bytes)
        except Exception as e:
            duration_ms = round((time.time() - start_time) * 1000, 2)
            logger.error(
                f"[ReceiptOCR] upload_id={upload_id} stage=preprocessing status=failed error={str(e)} duration_ms={duration_ms}"
            )
            return ReceiptOCRResponse(
                upload_id=upload_id,
                status="UNREADABLE",
                ocr=ReceiptOCRInfo(engine="none", overall_confidence=0.0),
                receipt=ParsedReceipt(),
                line_items=[],
                raw_text="",
                requires_review=True,
                message="Image preprocessing failed. Please upload a clear photo.",
            )

        # Step 2: Extract text using local Tesseract or EasyOCR fallback
        if self.tesseract_service.is_available:
            engine_used = "tesseract"
            try:
                ocr_elements = self.tesseract_service.extract_text_and_boxes(preprocessed_img)
            except Exception as error:
                logger.warning(
                    f"[ReceiptOCR] upload_id={upload_id} stage=tesseract status=failed error={str(error)}"
                )
                ocr_elements = []
        else:
            engine_used = "easyocr"
            try:
                from app.services.ocr.easyocr_service import EasyOCRService
                easyocr_service = EasyOCRService()
                ocr_elements = easyocr_service.extract_text_and_boxes(preprocessed_img)
            except Exception as error:
                logger.warning(
                    f"[ReceiptOCR] upload_id={upload_id} stage=easyocr status=failed error={str(error)}"
                )
                ocr_elements = []

        # Step 3: Parse OCR elements into structured receipt data
        parsed = self.parser.parse(ocr_elements)
        duration_ms = round((time.time() - start_time) * 1000, 2)

        receipt_data = parsed["receipt"]
        field_confs = parsed["field_confidences"]
        overall_conf = parsed["overall_confidence"]
        raw_text = parsed["raw_text"]
        line_items_data = parsed["line_items"]

        # If total amount was not detected, guide user to manual entry
        if receipt_data["total_amount"] is None and overall_conf < 0.3:
            status = "MANUAL_ENTRY_REQUIRED"
            message = "Couldn't confidently read total from this receipt. Please review and enter values."
        elif overall_conf < 0.75:
            message = f"Quarantine Quality Gate: OCR confidence is {round(overall_conf * 100)}% (<75%). Please review and verify merchant, date, and amount before confirming."

        # Step 4: Suggested category (Categorization is cleanly decoupled from OCR)
        suggested_category = categorizer.categorize(
            merchant_name=receipt_data["merchant"],
            line_items=line_items_data,
            raw_text=raw_text,
        )

        # Step 5: Log privacy-safe metrics (No raw image or sensitive card PII logged)
        logger.info(
            f"[ReceiptOCR] upload_id={upload_id} engine={engine_used} status={status} "
            f"overall_confidence={overall_conf} duration_ms={duration_ms} "
            f"total_detected={receipt_data['total_amount'] is not None} merchant_detected={receipt_data['merchant'] is not None}"
        )

        # Construct structured response
        return ReceiptOCRResponse(
            upload_id=upload_id,
            status=status,
            ocr=ReceiptOCRInfo(
                engine=engine_used,
                overall_confidence=overall_conf,
                field_confidences=ReceiptFieldConfidences(
                    merchant=FieldConfidence(**field_confs["merchant"]) if field_confs.get("merchant") else None,
                    total_amount=FieldConfidence(**field_confs["total_amount"]) if field_confs.get("total_amount") else None,
                    subtotal=FieldConfidence(**field_confs["subtotal"]) if field_confs.get("subtotal") else None,
                    tax=FieldConfidence(**field_confs["tax"]) if field_confs.get("tax") else None,
                    date=FieldConfidence(**field_confs["date"]) if field_confs.get("date") else None,
                    payment_method=FieldConfidence(**field_confs["payment_method"]) if field_confs.get("payment_method") else None,
                ),
            ),
            receipt=ParsedReceipt(**receipt_data),
            line_items=[LineItem(**item) for item in line_items_data],
            raw_text=raw_text,
            requires_review=True,
            suggested_category=suggested_category,
            message=message,
        )


ocr_pipeline = ReceiptOCRPipeline()
