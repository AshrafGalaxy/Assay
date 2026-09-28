import re
import datetime
from typing import List, Dict, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# Month name lookup
MONTHS_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9, "sept": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

# Non-merchant header keywords to filter out from merchant detection
HEADER_IGNORE_PATTERNS = [
    r"tax\s*invoice",
    r"retail\s*invoice",
    r"original\s*for\s*recipient",
    r"duplicate\s*for\s*transporter",
    r"cash\s*memo",
    r"cash\s*receipt",
    r"bill\s*of\s*supply",
    r"payment\s*receipt",
    r"welcome\s*to",
    r"order\s*#",
    r"table\s*#",
    r"gstin",
    r"gst\s*no",
    r"fssai",
    r"cin\s*no",
    r"pan\s*no",
    r"tel[:\s]",
    r"phone[:\s]",
    r"ph[:\s]",
    r"mobile[:\s]",
    r"address[:\s]",
    r"date[:\s]",
    r"time[:\s]",
    r"pos\s*receipt",
    r"e-receipt",
    r"thank\s*you",
    r"customer\s*copy",
    r"merchant\s*copy",
    r"counter\s*#",
]


def clean_amount_string(amount_str: str) -> Optional[float]:
    """
    Extracts and parses float monetary amount from dirty OCR string.
    Handles currency prefixes (₹, Rs, Rs., INR), percentage stripping, thousand separators, and OCR typos.
    """
    if not amount_str:
        return None

    s = amount_str.strip()
    # Strip percentages like "2.5%" or "18%" so they don't get captured as monetary amount
    s = re.sub(r"\b\d+(?:\.\d+)?\s*%", "", s)
    # Remove currency symbols
    s = re.sub(r"[₹$€£]", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\b(rs\.?|inr|rp)\b", "", s, flags=re.IGNORECASE).strip()

    # Find candidate number strings: comma formatted e.g. 1,234.56, decimals e.g. 2490.00, or integers e.g. 400
    candidates = re.findall(r"(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)", s)
    if not candidates:
        # Try trailing amount without dot (e.g. 120 00)
        match = re.search(r"(\d+)[,\s](\d{2})\b", s)
        if match:
            val_str = f"{match.group(1)}.{match.group(2)}"
            try:
                return round(float(val_str), 2)
            except ValueError:
                return None
        return None

    # Pick the last candidate (amounts usually appear at the end of a line)
    for cand in reversed(candidates):
        cleaned_cand = cand.replace(",", "")
        try:
            val = float(cleaned_cand)
            return round(val, 2)
        except ValueError:
            continue

    return None


def parse_date_string(text: str) -> Tuple[Optional[str], float]:
    """
    Extracts dates in various international and Indian formats.
    Handles delimiters: /, -, ., ,, space
    Returns: (normalized_date_str 'YYYY-MM-DD', confidence)
    """
    # 1. Matches: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD,MM/YYYY
    dmy_match = re.search(r"\b([0-3]?[0-9])[\/\-\.\,]([0-1]?[0-9])[\/\-\.\,](20\d\d|19\d\d|\d{2})\b", text)
    if dmy_match:
        d_str, m_str, y_str = dmy_match.groups()
        day = int(d_str)
        month = int(m_str)
        year = int(y_str) if len(y_str) == 4 else (2000 + int(y_str))

        # Disambiguate if month > 12 and day <= 12 (MM/DD/YYYY)
        if month > 12 and day <= 12:
            day, month = month, day
            conf = 0.85
        elif 1 <= day <= 31 and 1 <= month <= 12:
            conf = 0.95
        else:
            return None, 0.0

        try:
            parsed = datetime.date(year, month, day)
            return parsed.isoformat(), conf
        except ValueError:
            pass

    # 2. Matches: 26 Sep 2026, 26-Sep-2026, 26 September 2026, Sep 26 2026
    month_names_regex = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    
    # Pattern A: 26 Sep 2026 or 26-Sep-2026
    named_match_1 = re.search(
        rf"\b([0-3]?[0-9])[\s\-\/\.\,]*({month_names_regex})[\s\-\/\.\,]*(20\d\d|19\d\d|\d{2})\b",
        text,
        re.IGNORECASE,
    )
    if named_match_1:
        d_str, m_name, y_str = named_match_1.groups()
        day = int(d_str)
        month = MONTHS_MAP.get(m_name.lower()[:3], 1)
        year = int(y_str) if len(y_str) == 4 else (2000 + int(y_str))
        try:
            parsed = datetime.date(year, month, day)
            return parsed.isoformat(), 0.96
        except ValueError:
            pass

    # Pattern B: Sep 26, 2026
    named_match_2 = re.search(
        rf"\b({month_names_regex})[\s\-\/\.\,]+([0-3]?[0-9])(?:st|nd|rd|th)?[\s\-\/\.,]*(20\d\d|19\d\d|\d{2})\b",
        text,
        re.IGNORECASE,
    )
    if named_match_2:
        m_name, d_str, y_str = named_match_2.groups()
        day = int(d_str)
        month = MONTHS_MAP.get(m_name.lower()[:3], 1)
        year = int(y_str) if len(y_str) == 4 else (2000 + int(y_str))
        try:
            parsed = datetime.date(year, month, day)
            return parsed.isoformat(), 0.94
        except ValueError:
            pass

    # 3. Matches: YYYY-MM-DD or YYYY/MM/DD
    ymd_match = re.search(r"\b(20\d\d)[\/\-\.\,]([0-1]?[0-9])[\/\-\.\,]([0-3]?[0-9])\b", text)
    if ymd_match:
        y_str, m_str, d_str = ymd_match.groups()
        year = int(y_str)
        month = int(m_str)
        day = int(d_str)
        try:
            parsed = datetime.date(year, month, day)
            return parsed.isoformat(), 0.95
        except ValueError:
            pass

    return None, 0.0


def parse_time_string(text: str) -> Optional[str]:
    """
    Extracts time string in HH:MM format (24h normalized).
    Supports:
    1. Colon format: e.g. 10:42 AM, 14:30:00, 08:15 PM
    2. Dot format with AM/PM or explicit time label: e.g. 10.42 AM, Time: 10.42
    """
    # 1. Colon format: 10:42:00 AM or 10:42 AM or 14:30
    colon_match = re.search(r"\b([0-2]?[0-9]):([0-5][0-9])(?::([0-5][0-9]))?\s*(am|pm)?\b", text, re.IGNORECASE)
    if colon_match:
        h_str, m_str, _, ampm = colon_match.groups()
        hours = int(h_str)
        minutes = int(m_str)
        if ampm:
            ampm_lower = ampm.lower()
            if ampm_lower == "pm" and hours < 12:
                hours += 12
            elif ampm_lower == "am" and hours == 12:
                hours = 0
        if 0 <= hours <= 23 and 0 <= minutes <= 59:
            return f"{hours:02d}:{minutes:02d}"

    # 2. Dot format: only when accompanied by AM/PM or 'time' label (prevents prices like 8.50 from matching)
    dot_match = re.search(r"\b([0-2]?[0-9])\.([0-5][0-9])\s*(am|pm)\b", text, re.IGNORECASE)
    if not dot_match and re.search(r"\btime[:\s]", text, re.IGNORECASE):
        dot_match = re.search(r"\btime[:\s]*([0-2]?[0-9])\.([0-5][0-9])\b", text, re.IGNORECASE)

    if dot_match:
        groups = dot_match.groups()
        h_str, m_str = groups[0], groups[1]
        ampm = groups[2] if len(groups) > 2 else None
        hours = int(h_str)
        minutes = int(m_str)
        if ampm:
            ampm_lower = ampm.lower()
            if ampm_lower == "pm" and hours < 12:
                hours += 12
            elif ampm_lower == "am" and hours == 12:
                hours = 0
        if 0 <= hours <= 23 and 0 <= minutes <= 59:
            return f"{hours:02d}:{minutes:02d}"

    return None


class ReceiptParser:
    """Production receipt parser extracting deterministic transaction values."""

    def __init__(self):
        pass

    def parse(self, ocr_elements: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Parses OCR elements into a structured receipt dictionary with field confidences.
        """
        if not ocr_elements:
            return {
                "receipt": {
                    "merchant": None,
                    "total_amount": None,
                    "subtotal": None,
                    "tax": None,
                    "currency": "INR",
                    "date": None,
                    "time": None,
                    "payment_method": "UNKNOWN",
                    "transaction_reference": None,
                },
                "line_items": [],
                "raw_text": "",
                "field_confidences": {
                    "merchant": {"value": None, "confidence": 0.0},
                    "total_amount": {"value": None, "confidence": 0.0},
                    "subtotal": {"value": None, "confidence": 0.0},
                    "tax": {"value": None, "confidence": 0.0},
                    "date": {"value": None, "confidence": 0.0},
                    "payment_method": {"value": "UNKNOWN", "confidence": 0.0},
                },
                "overall_confidence": 0.0,
            }

        raw_lines = [el["text"] for el in ocr_elements if el.get("text")]
        raw_text = "\n".join(raw_lines)

        # 1. Extract Merchant
        merchant, merchant_conf = self._extract_merchant(ocr_elements)

        # 2. Extract Total, Subtotal, and Tax
        totals_result = self._extract_totals_and_taxes(ocr_elements)

        # 3. Extract Date and Time
        date_val, date_conf = self._extract_date(ocr_elements)
        time_val = self._extract_time(ocr_elements)

        # 4. Extract Payment Method and Reference
        payment_method, payment_conf, ref_number = self._extract_payment_info(ocr_elements)

        # 5. Extract Line Items
        line_items = self._extract_line_items(ocr_elements)

        # 6. Verify Subtotal + Tax vs Total
        total_val = totals_result["total"]
        total_conf = totals_result["total_conf"]
        subtotal_val = totals_result["subtotal"]
        subtotal_conf = totals_result["subtotal_conf"]
        tax_val = totals_result["tax"]
        tax_conf = totals_result["tax_conf"]

        if subtotal_val is not None and tax_val is not None and total_val is not None:
            calc_sum = round(subtotal_val + tax_val, 2)
            if abs(calc_sum - total_val) <= 1.0:
                # Strong consistency bonus
                total_conf = min(0.99, max(total_conf, 0.96))
                subtotal_conf = min(0.99, max(subtotal_conf, 0.95))
                tax_conf = min(0.99, max(tax_conf, 0.95))

        # Calculate composite overall confidence
        weights = [
            (total_conf if total_val is not None else 0.0, 0.40),
            (merchant_conf if merchant is not None else 0.0, 0.25),
            (date_conf if date_val is not None else 0.0, 0.20),
            (payment_conf if payment_method not in ("UNKNOWN", None) else 0.0, 0.15),
        ]
        overall_conf = sum(conf * weight for conf, weight in weights)

        # Scale with OCR elements baseline word confidence
        avg_ocr_conf = (
            sum(el.get("confidence", 0.0) for el in ocr_elements) / len(ocr_elements)
            if ocr_elements else 0.0
        )
        final_overall_conf = round(0.7 * overall_conf + 0.3 * avg_ocr_conf, 4)

        return {
            "receipt": {
                "merchant": merchant,
                "total_amount": total_val,
                "subtotal": subtotal_val,
                "tax": tax_val,
                "currency": "INR",
                "date": date_val,
                "time": time_val,
                "payment_method": payment_method or "UNKNOWN",
                "transaction_reference": ref_number,
            },
            "line_items": line_items,
            "raw_text": raw_text,
            "field_confidences": {
                "merchant": {"value": merchant, "confidence": round(merchant_conf, 4)},
                "total_amount": {"value": total_val, "confidence": round(total_conf, 4)},
                "subtotal": {"value": subtotal_val, "confidence": round(subtotal_conf, 4)},
                "tax": {"value": tax_val, "confidence": round(tax_conf, 4)},
                "date": {"value": date_val, "confidence": round(date_conf, 4)},
                "payment_method": {"value": payment_method, "confidence": round(payment_conf, 4)},
            },
            "overall_confidence": final_overall_conf,
        }

    def _extract_merchant(self, ocr_elements: List[Dict[str, Any]]) -> Tuple[Optional[str], float]:
        """
        Extracts merchant name from top prominent lines, skipping standard receipt metadata.
        """
        # Consider top 8 elements
        candidates = ocr_elements[:8]
        if not candidates:
            return None, 0.0

        for el in candidates:
            text = el.get("text", "").strip()
            if not text or len(text) < 3:
                continue

            # Check if line matches ignore patterns
            lower_text = text.lower()
            if any(re.search(pat, lower_text) for pat in HEADER_IGNORE_PATTERNS):
                continue

            # Reject lines that are primarily digits, dates, or prices
            if re.search(r"^\d+[\s\-\/\.]", text) or clean_amount_string(text) is not None:
                continue

            # Clean extra noise like quotes or trailing separators
            cleaned = re.sub(r"^[#*~\-_:\s]+|[#*~\-_:\s]+$", "", text).strip()
            if len(cleaned) >= 2:
                word_conf = el.get("confidence", 0.8)
                merchant_conf = max(0.6, min(0.98, word_conf))
                return cleaned, merchant_conf

        return None, 0.0

    def _extract_totals_and_taxes(self, ocr_elements: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Identifies total_amount, subtotal, and tax using exact keywords and structural heuristics.
        """
        total_val: Optional[float] = None
        total_conf: float = 0.0
        subtotal_val: Optional[float] = None
        subtotal_conf: float = 0.0
        tax_components: List[float] = []
        tax_conf: float = 0.0

        # Primary total labels (high priority)
        total_patterns = [
            (r"\b(?:grand\s*total|net\s*total|amount\s*payable|amount\s*due|total\s*amount|balance\s*due|final\s*amount|bill\s*total|net\s*payable|paid\s*amount)\b", 0.97),
            (r"\btotal\b", 0.90),
            (r"\bamount\b", 0.70),
        ]

        # Subtotal patterns
        subtotal_patterns = [
            r"\b(?:sub\s*total|subtotal|sub-total|item\s*total|gross\s*amount|sub\s*tot)\b"
        ]

        # Tax patterns
        tax_patterns = [
            r"\b(?:cgst|sgst|igst|gst|vat|service\s*tax|tax|total\s*tax)\b"
        ]

        # Scan elements backwards or forwards
        for idx, el in enumerate(ocr_elements):
            text = el.get("text", "").strip()
            lower_text = text.lower()
            conf = el.get("confidence", 0.8)

            # Check Subtotal
            if any(re.search(pat, lower_text) for pat in subtotal_patterns):
                amt = clean_amount_string(text)
                if amt is None and idx + 1 < len(ocr_elements):
                    # Check next element if value is on adjacent box
                    amt = clean_amount_string(ocr_elements[idx + 1]["text"])
                if amt is not None and (subtotal_val is None or amt > subtotal_val):
                    subtotal_val = amt
                    subtotal_conf = max(0.85, conf)

            # Check Tax
            elif any(re.search(pat, lower_text) for pat in tax_patterns):
                # Avoid capturing 'Tax Invoice'
                if not re.search(r"\btax\s*invoice\b", lower_text):
                    amt = clean_amount_string(text)
                    if amt is None and idx + 1 < len(ocr_elements):
                        amt = clean_amount_string(ocr_elements[idx + 1]["text"])
                    if amt is not None and amt > 0:
                        tax_components.append(amt)
                        tax_conf = max(tax_conf, conf)

            # Check Total
            for pattern, base_weight in total_patterns:
                if re.search(pattern, lower_text):
                    # Skip if it's subtotal or tax line
                    if any(re.search(sp, lower_text) for sp in subtotal_patterns):
                        continue
                    amt = clean_amount_string(text)
                    if amt is None and idx + 1 < len(ocr_elements):
                        amt = clean_amount_string(ocr_elements[idx + 1]["text"])
                    if amt is not None:
                        # If we already found a total, prioritize the one matching grand total or later in the receipt
                        total_val = amt
                        total_conf = max(base_weight, conf)
                        break

        # If total_val is still not found, check if last prominent numerical value near bottom represents total
        if total_val is None:
            # Look in the bottom 40% of elements for currency amounts
            bottom_slice = ocr_elements[max(0, int(len(ocr_elements) * 0.5)):]
            for el in reversed(bottom_slice):
                amt = clean_amount_string(el.get("text", ""))
                if amt is not None and amt > 0:
                    total_val = amt
                    total_conf = 0.55  # Lower confidence because label was missing
                    break

        # Calculate aggregated tax if components exist
        final_tax = round(sum(tax_components), 2) if tax_components else None
        final_tax_conf = tax_conf if final_tax is not None else 0.0

        return {
            "total": total_val,
            "total_conf": total_conf,
            "subtotal": subtotal_val,
            "subtotal_conf": subtotal_conf,
            "tax": final_tax,
            "tax_conf": final_tax_conf,
        }

    def _extract_date(self, ocr_elements: List[Dict[str, Any]]) -> Tuple[Optional[str], float]:
        """Scans all OCR elements for dates and returns the best normalized match."""
        for el in ocr_elements:
            text = el.get("text", "")
            date_str, conf = parse_date_string(text)
            if date_str:
                return date_str, conf
        return None, 0.0

    def _extract_time(self, ocr_elements: List[Dict[str, Any]]) -> Optional[str]:
        """Scans OCR elements for transaction timestamp."""
        for el in ocr_elements:
            text = el.get("text", "")
            time_str = parse_time_string(text)
            if time_str:
                return time_str
        return None

    def _extract_payment_info(
        self,
        ocr_elements: List[Dict[str, Any]],
    ) -> Tuple[Optional[str], float, Optional[str]]:
        """
        Identifies payment method and reference/transaction numbers.
        """
        payment_method = "UNKNOWN"
        confidence = 0.0
        ref_number = None

        full_text = " ".join(el.get("text", "") for el in ocr_elements)
        lower_full = full_text.lower()

        # Check UPI
        if any(keyword in lower_full for keyword in ["upi", "gpay", "google pay", "phonepe", "paytm", "bhim"]):
            payment_method = "UPI"
            confidence = 0.95
        # Check Credit Card / Debit Card
        elif any(keyword in lower_full for keyword in ["credit card", "mastercard", "visa", "amex"]):
            payment_method = "Credit Card"
            confidence = 0.92
        elif any(keyword in lower_full for keyword in ["debit card", "rupay", "maestro"]):
            payment_method = "Debit Card"
            confidence = 0.92
        elif "card" in lower_full:
            payment_method = "Credit Card"
            confidence = 0.80
        # Check Cash
        elif any(keyword in lower_full for keyword in ["cash tendered", "cash paid", "cash"]):
            payment_method = "Cash"
            confidence = 0.90
        elif any(keyword in lower_full for keyword in ["bank transfer", "neft", "rtgs", "imps"]):
            payment_method = "Bank Transfer"
            confidence = 0.90

        # Look for Reference ID / Transaction ID / UPI Ref
        ref_match = re.search(
            r"(?:upi\s*ref(?:erence)?\s*(?:no\.?|id)?|txn\s*(?:id|no\.?)|ref\s*(?:no\.?|id)|rrn|auth\s*code|order\s*(?:id|no\.?))\s*[:\-#]?\s*([A-Za-z0-9\/]{6,30})",
            full_text,
            re.IGNORECASE,
        )
        if ref_match:
            ref_number = ref_match.group(1).strip()

        return payment_method, confidence, ref_number

    def _extract_line_items(self, ocr_elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extracts structured item lines if the receipt clearly contains tabular data:
        Name | Quantity | Unit Price | Total Price
        Does not hallucinate items if layout is not clear.
        """
        line_items: List[Dict[str, Any]] = []

        # Common non-item terms
        skip_terms = [
            "total", "subtotal", "tax", "cgst", "sgst", "discount", "change",
            "cash", "card", "round off", "balance", "net", "amount", "invoice",
            "date", "time", "tel", "thank", "visit", "upi", "gstin", "fssai"
        ]

        for el in ocr_elements:
            text = el.get("text", "").strip()
            lower = text.lower()

            if any(term in lower for term in skip_terms):
                continue

            # Pattern: Item Name ... Quantity ... Price (e.g., "Cappuccino 1 220.00" or "Sandwich 2 90 180")
            # Case 1: Name, Quantity, Unit Price, Total Price (e.g. "Cold Coffee 2 120 240.00")
            four_part = re.match(
                r"^([A-Za-z\s\.\&\-]{3,30})\s+(\d+)\s+([\d\.]+)\s+([\d\.]+)$",
                text,
            )
            if four_part:
                name, qty, unit_p, tot_p = four_part.groups()
                try:
                    line_items.append({
                        "name": name.strip(),
                        "quantity": float(qty),
                        "unit_price": round(float(unit_p), 2),
                        "total_price": round(float(tot_p), 2),
                    })
                    continue
                except ValueError:
                    pass

            # Case 2: Name, Quantity, Total Price (e.g. "Cappuccino 1 220.00")
            three_part = re.match(
                r"^([A-Za-z\s\.\&\-]{3,30})\s+(\d+)\s+([\d\.]+)$",
                text,
            )
            if three_part:
                name, qty, tot_p = three_part.groups()
                try:
                    tot = round(float(tot_p), 2)
                    q = float(qty)
                    unit = round(tot / q, 2) if q > 0 else tot
                    line_items.append({
                        "name": name.strip(),
                        "quantity": q,
                        "unit_price": unit,
                        "total_price": tot,
                    })
                    continue
                except ValueError:
                    pass

            # Case 3: Name and Price (e.g. "Cappuccino 220.00" or "Sandwich ₹180")
            two_part = re.match(
                r"^([A-Za-z\s\.\&\-]{3,30})\s+(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)$",
                text,
                re.IGNORECASE,
            )
            if two_part:
                name, price_str = two_part.groups()
                # Check name isn't just common words
                if len(name.strip()) >= 3 and not any(t in name.lower() for t in skip_terms):
                    try:
                        p = round(float(price_str), 2)
                        if p > 0:
                            line_items.append({
                                "name": name.strip(),
                                "quantity": 1.0,
                                "unit_price": p,
                                "total_price": p,
                            })
                    except ValueError:
                        pass

        return line_items
