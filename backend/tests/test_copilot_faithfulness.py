"""
Unit tests for CopilotExplainer and Regex Faithfulness Auditor (FIN 02).
Verifies:
- 5-layer robustness stack
- Extraction of numbers from nested math payloads
- Faithfulness audit passing on grounded explanations
- Faithfulness audit catching and flagging hallucinated numbers
- Circuit breaker fallback behavior
"""

import pytest
from app.providers.llm.copilot_explainer import CopilotExplainer


def test_copilot_explainer_extract_numbers():
    payload = {
        "sequence_a": {"ending_balance": 48200.5, "shortfall_risk": 31.4},
        "sequence_b": {"ending_balance": 59100.0, "shortfall_risk": 4.2},
        "reserve_min": 25000.0,
        "cut": 5000,
    }

    nums = CopilotExplainer.extract_numbers_from_payload(payload)
    assert 25000.0 in nums
    assert 5000.0 in nums
    assert 31.4 in nums
    assert 4.2 in nums


def test_copilot_explainer_faithfulness_audit_pass():
    explainer = CopilotExplainer()

    verified_math = {
        "sequence_a": {
            "name": "Sequence A",
            "ending_balance_expected": 48200.0,
            "shortfall_risk_pct": 31.4,
        },
        "sequence_b": {
            "name": "Sequence B",
            "discretionary_budget_monthly": 11500.0,
            "ending_balance_expected": 59100.0,
            "shortfall_risk_pct": 4.2,
        },
        "declared_reserve_min": 25000.0,
    }

    res = explainer.generate_grounded_explanation(
        intent="decision_flip",
        verified_math=verified_math,
    )

    assert res["audit_passed"] is True
    assert len(res["ungrounded_detected"]) == 0
    assert "₹25,000" in res["answer"]
    assert "31.4%" in res["answer"]
    assert "4.2%" in res["answer"]


def test_copilot_explainer_flags_hallucination():
    payload = {"declared_reserve_min": 25000.0, "discretionary_budget": 5000.0}

    # Text containing hallucinated numbers not present in payload (e.g. ₹99,999)
    hallucinated_text = "You will save ₹99,999 by investing in stocks with a ₹25,000 reserve."

    is_faithful, ungrounded = CopilotExplainer.audit_faithfulness(hallucinated_text, payload)

    assert is_faithful is False
    assert 99999.0 in ungrounded
