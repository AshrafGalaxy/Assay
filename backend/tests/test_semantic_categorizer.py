import pytest

pytest.importorskip("transformers", reason="transformers is required for local semantic embedding classification")

from app.services.categorization.semantic_classifier import semantic_categorizer
from app.services.categorization.categorizer import categorizer


def test_semantic_classifier_indian_merchants():
    """Verify all-MiniLM-L6-v2 correctly classifies unlisted Indian merchants."""
    # Test Groceries
    cat, score = semantic_categorizer.classify("Gupta Kirana Store")
    assert cat == "Groceries"
    assert score >= 0.28

    # Test Healthcare
    cat, score = semantic_categorizer.classify("Sharma Medico and Pharmacy")
    assert cat == "Healthcare"
    assert score >= 0.28

    # Test Food & Dining
    cat, score = semantic_categorizer.classify("Punjab Dhaba and Tiffin Centre")
    assert cat == "Food & Dining"
    assert score >= 0.28

    # Test Transportation
    cat, score = semantic_categorizer.classify("Fastag Toll Plaza Bangalore")
    assert cat == "Transportation"
    assert score >= 0.28

    # Test Utilities
    cat, score = semantic_categorizer.classify("City Cable and Broadband")
    assert cat == "Utilities"
    assert score >= 0.28


def test_semantic_classifier_gibberish_returns_other():
    """Verify that random noise text is rejected and returns 'Other'."""
    cat, score = semantic_categorizer.classify("Random non-financial gibberish 98765xyz")
    assert cat == "Other"


def test_semantic_classifier_caching():
    """Verify fast in-memory caching returns identical result instantly."""
    merchant = "Apex Diagnostic Pathology Lab"
    cat1, score1 = semantic_categorizer.classify(merchant)
    assert cat1 == "Healthcare"

    # Second lookup should hit cache
    assert merchant.lower() in semantic_categorizer._cache
    cat2, score2 = semantic_categorizer.classify(merchant)
    assert cat1 == cat2
    assert score1 == score2


def test_categorizer_hybrid_pipeline_integration():
    """Verify the hybrid categorizer correctly runs Tier 1 regex, falling back to Tier 2 semantic ML."""
    # Tier 1 obvious match (Swiggy is in regex list)
    cat_swiggy = categorizer.categorize(merchant_name="Swiggy Delivery")
    assert cat_swiggy == "Food & Dining"

    # Tier 2 semantic match (unlisted Indian shop 'Gupta Kirana')
    cat_kirana = categorizer.categorize(merchant_name="Gupta Kirana Provisions")
    assert cat_kirana == "Groceries"

    # Tier 2 semantic match on OCR text with line items
    cat_medico = categorizer.categorize(
        merchant_name="Ahuja Store",
        line_items=[{"name": "Paracetamol Tablet 500mg"}],
        raw_text="Tax Invoice Ahuja Medicos Paracetamol Tablet",
    )
    assert cat_medico == "Healthcare"
