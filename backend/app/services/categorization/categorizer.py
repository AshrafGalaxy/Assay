from typing import Optional, List, Dict, Any
import re

# Deterministic merchant keyword mappings to ASSAY categories
CATEGORY_KEYWORD_RULES = {
    "Food & Dining": [
        "starbucks", "blue tokai", "cafe", "coffee", "restaurant", "swiggy", "zomato",
        "mcdonald", "mcdonalds", "burger", "pizza", "domino", "subway", "kfc", "dunkin",
        "bakery", "bistro", "dhaba", "kitchen", "biryani", "chaat", "tea", "chai",
        "dining", "eat club", "box8", "faasos", "behrouz",
    ],
    "Groceries": [
        "supermarket", "grocery", "groceries", "blinkit", "zepto", "instamart",
        "bigbasket", "dmart", "reliance fresh", "spencer", "nature basket", "kirana",
        "organic", "provisions", "general store", "more megastore", "jiomart",
    ],
    "Shopping": [
        "amazon", "flipkart", "myntra", "zara", "h&m", "uniqlo", "retail", "apparel",
        "clothing", "footwear", "electronics", "croma", "reliance digital", "apple",
        "ajio", "nykaa", "meesho",
    ],
    "Healthcare": [
        "pharmacy", "chemist", "apothecary", "apollo", "medplus", "hospital", "clinic",
        "diagnostic", "dental", "doctor", "pharma", "1mg", "pharmeasy", "netmeds",
    ],
    "Transportation": [
        "uber", "ola", "rapido", "metro", "fuel", "petrol", "diesel", "hpcl", "bpcl",
        "iocl", "shell", "toll", "parking", "fastag", "railway", "irctc", "indigo",
        "namma yatri", "blusmart",
    ],
    "Utilities": [
        "electricity", "water bill", "airtel", "jio", "vodafone", "broadband",
        "wifi", "bescom", "tneb", "mahadiscom", "bill payment", "recharge",
    ],
    "Entertainment": [
        "netflix", "spotify", "pvr", "inox", "cinema", "theatre", "movie", "bookmyshow",
        "hotstar", "prime video", "steam", "playstation", "youtube premium",
    ],
    "Services": [
        "urban company", "salon", "spa", "dry clean", "laundry", "cleaning", "repair",
        "google pay", "phonepe", "paytm", "bhim",
    ],
}


class TransactionCategorizer:
    """Service for classifying transactions into standard financial categories."""

    def categorize(
        self,
        merchant_name: Optional[str] = None,
        line_items: Optional[List[Dict[str, Any]]] = None,
        raw_text: Optional[str] = None,
    ) -> str:
        """
        Determines the appropriate financial category for a transaction.
        Separated cleanly from the OCR text extraction layer.
        Uses merchant, line items, and full OCR text together.
        """
        parts: List[str] = []
        if merchant_name:
            parts.append(merchant_name)
        if line_items:
            parts.extend(item.get("name", "") for item in line_items if item.get("name"))
        if raw_text:
            parts.append(raw_text)

        search_text = " ".join(parts).lower()
        if not search_text.strip():
            return "Other"

        # Prefer merchant/line-item matches, then fall through the same keyword scan on full text.
        for category, keywords in CATEGORY_KEYWORD_RULES.items():
            for kw in keywords:
                if re.search(r"\b" + re.escape(kw) + r"\b", search_text):
                    return category

        if "coffee" in search_text or "food" in search_text:
            return "Food & Dining"
        return "Other"


categorizer = TransactionCategorizer()
