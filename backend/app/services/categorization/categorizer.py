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
        "medico", "medicos",
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
        "carpenter", "plumber", "electrician", "tailor", "service centre", "maintenance",
    ],
}


from app.services.categorization.semantic_classifier import semantic_categorizer


class TransactionCategorizer:
    """Two-tier hybrid service for classifying transactions into standard financial categories."""

    def categorize(
        self,
        merchant_name: Optional[str] = None,
        line_items: Optional[List[Dict[str, Any]]] = None,
        raw_text: Optional[str] = None,
    ) -> str:
        """
        Determines the appropriate financial category for a transaction.
        Tier 1: High-speed deterministic regex & merchant keyword dictionary (< 0.1ms).
        Tier 2: On-device semantic embedding similarity via all-MiniLM-L6-v2 (< 2ms).
        """
        # Tier 1a: Check merchant_name first with highest priority
        if merchant_name:
            m_lower = merchant_name.lower().strip()
            for category, keywords in CATEGORY_KEYWORD_RULES.items():
                for kw in keywords:
                    if re.search(r"\b" + re.escape(kw) + r"\b", m_lower):
                        return category
            if "coffee" in m_lower or "food" in m_lower or "starbucks" in m_lower:
                return "Food & Dining"

        # Construct combined text for broader matching
        parts: List[str] = []
        if merchant_name:
            parts.append(merchant_name)
        if line_items:
            parts.extend(item.get("name", "") for item in line_items if item.get("name"))
        if raw_text:
            parts.append(raw_text)

        search_text = " ".join(parts).strip()
        if not search_text:
            return "Other"

        lower_text = search_text.lower()

        # Tier 1b: Fast deterministic keyword & brand rules across items & text
        for category, keywords in CATEGORY_KEYWORD_RULES.items():
            for kw in keywords:
                if re.search(r"\b" + re.escape(kw) + r"\b", lower_text):
                    return category

        if "coffee" in lower_text or "food" in lower_text:
            return "Food & Dining"

        # Tier 2: On-device zero-shot semantic embedding classification (all-MiniLM-L6-v2)
        try:
            # Semantic classifier prioritizes merchant and line items over noise
            semantic_query = merchant_name if merchant_name else search_text
            sem_category, score = semantic_categorizer.classify(semantic_query)
            if sem_category != "Other":
                return sem_category
            if merchant_name and search_text != merchant_name:
                sem_category_all, _ = semantic_categorizer.classify(search_text)
                if sem_category_all != "Other":
                    return sem_category_all
        except Exception:
            pass

        return "Other"


categorizer = TransactionCategorizer()

