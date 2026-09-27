from typing import Optional, List, Dict, Any
import re

# Deterministic merchant keyword mappings to ASSAY categories
CATEGORY_KEYWORD_RULES = {
    "Food & Dining": [
        "starbucks", "blue tokai", "cafe", "coffee", "restaurant", "swiggy", "zomato",
        "mcdonald", "burger", "pizza", "domino", "subway", "kfc", "dunkin", "bakery",
        "bistro", "dhaba", "bar", "kitchen", "biryani", "chaat", "tea", "chai",
    ],
    "Groceries": [
        "supermarket", "mart", "grocery", "groceries", "blinkit", "zepto", "instamart",
        "bigbasket", "dmart", "reliance fresh", "spencer", "nature basket", "kirana",
        "organic", "provisions", "general store",
    ],
    "Shopping": [
        "amazon", "flipkart", "myntra", "zara", "h&m", "uniqlo", "retail", "apparel",
        "clothing", "footwear", "electronics", "croma", "reliance digital", "apple",
    ],
    "Healthcare": [
        "pharmacy", "chemist", "apothecary", "apollo", "medplus", "hospital", "clinic",
        "diagnostic", "lab", "dental", "doctor", "health", "pharma",
    ],
    "Transportation": [
        "uber", "ola", "rapido", "metro", "fuel", "petrol", "diesel", "hpcl", "bpcl",
        "iocl", "shell", "toll", "parking", "fastag", "railway", "irctc", "indigo",
    ],
    "Utilities": [
        "electricity", "water", "gas", "airtel", "jio", "vodafone", "vi", "broadband",
        "wifi", "bescom", "tneb", "mahadiscom", "bill payment",
    ],
    "Entertainment": [
        "netflix", "spotify", "pvr", "inox", "cinema", "theatre", "movie", "bookmyshow",
        "hotstar", "prime video", "steam", "playstation",
    ],
    "Services": [
        "urban company", "salon", "spa", "dry clean", "laundry", "cleaning", "repair",
    ],
}


class TransactionCategorizer:
    """Service for classifying transactions into standard financial categories."""

    def __init__(self):
        pass

    def categorize(
        self,
        merchant_name: Optional[str] = None,
        line_items: Optional[List[Dict[str, Any]]] = None,
        raw_text: Optional[str] = None,
    ) -> str:
        """
        Determines the appropriate financial category for a transaction.
        Separated cleanly from the OCR text extraction layer.
        """
        search_text = (merchant_name or "").lower()

        # Check line items if merchant is unclear
        if line_items:
            item_names = " ".join(item.get("name", "") for item in line_items).lower()
            search_text = f"{search_text} {item_names}"

        if not search_text and raw_text:
            search_text = raw_text.lower()

        # Match against predefined category dictionaries
        for category, keywords in CATEGORY_KEYWORD_RULES.items():
            for kw in keywords:
                if re.search(r"\b" + re.escape(kw) + r"\b", search_text):
                    return category

        # Fallback default
        return "Food & Dining" if "coffee" in search_text or "food" in search_text else "Other"


categorizer = TransactionCategorizer()
