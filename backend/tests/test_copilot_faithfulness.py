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


def test_label_swap_is_rejected():
    draft = "Expected Cash stays at ₹1,202,140, with a Safety Buffer of ₹80,000."
    swapped = "You can afford it, with a Safety Buffer of ₹1,202,140."
    assert CopilotExplainer.labels_match_draft(draft, swapped) is False
    kept = "Yes. Expected Cash stays at ₹1,202,140 and the Safety Buffer stays at ₹80,000."
    assert CopilotExplainer.labels_match_draft(draft, kept) is True


def test_label_followed_by_a_comma_does_not_crash():
    draft = "Put the surplus toward your Safety Buffer, without changing Monthly Spending & Bills."
    reply = "Your Safety Buffer stays in place, and Monthly Spending & Bills stay the same."
    assert CopilotExplainer.labels_match_draft(draft, reply) is True


def test_false_gap_between_named_amounts_is_rejected():
    text = (
        "Your Expected Cash remains at ₹1,195,140, which is ₹1,105,871 above "
        "your Safety Buffer of ₹80,000."
    )
    assert CopilotExplainer.claimed_differences_hold(text) is False
    true_gap = (
        "Expected Cash reaches ₹1,225,503. That is ₹1,145,503 above your Safety Buffer of ₹80,000."
    )
    assert CopilotExplainer.claimed_differences_hold(true_gap) is True


def test_rewrite_rejects_extra_paise_and_a_false_gap():
    draft = (
        "Yes, you can afford this purchase of ₹15,000. "
        "Expected Cash stays at ₹1,195,140, with Money Above Buffer of ₹1,105,871 "
        "over your Safety Buffer of ₹80,000."
    )
    false_gap = (
        "Yes, you can afford this purchase of ₹15,000. "
        "Your Expected Cash remains at ₹1,195,140, which is ₹1,105,871 above "
        "your Safety Buffer of ₹80,000."
    )
    assert CopilotExplainer.rewrite_keeps_figures(draft, false_gap) is False
    extra_paise = "Upcoming bills are ₹3,850, leaving a balance of ₹1,206,289.72."
    assert CopilotExplainer.rewrite_keeps_figures(
        "You have ₹3,850 due. Your current cash covers these with a net balance of ₹1,206,290.",
        extra_paise,
    ) is False
    faithful = (
        "Yes. This ₹15,000 purchase leaves Expected Cash at ₹1,195,140, "
        "Money Above Buffer at ₹1,105,871, and the Safety Buffer at ₹80,000."
    )
    assert CopilotExplainer.rewrite_keeps_figures(draft, faithful) is True
    dropped_amount = (
        "Your Expected Cash remains ₹1,195,140, which includes a Safety Buffer of ₹80,000. "
        "You have Money Above Buffer of ₹1,105,871."
    )
    assert CopilotExplainer.rewrite_keeps_figures(draft, dropped_amount) is False
    assert CopilotExplainer.rewrite_keeps_figures(draft, "I cannot answer this question using the provided vocabulary.") is False
    misnamed = "Your Monthly Spending & Bills total ₹3,850. Expected Cash is ₹1,210,140."
    obligations = "You have ₹3,850 due. Your current cash of ₹1,210,140 covers them."
    assert CopilotExplainer.rewrite_keeps_figures(obligations, misnamed) is False


class _ScriptedCloud:
    def __init__(self, text: str):
        self.model_id = "qwen/test"
        self.text = text

    async def generate_grounded(self, system_prompt: str, user_prompt: str) -> str:
        return self.text


@pytest.mark.asyncio
async def test_cloud_rewrite_falls_back_when_the_gap_is_wrong():
    draft = (
        "Yes, you can afford this purchase of ₹15,000. "
        "Expected Cash stays at ₹1,195,140, with Money Above Buffer of ₹1,105,871 "
        "over your Safety Buffer of ₹80,000."
    )
    explainer = CopilotExplainer(
        groq_provider=_ScriptedCloud(
            "Your Expected Cash remains at ₹1,195,140, which is ₹1,105,871 above your Safety Buffer of ₹80,000."
        )
    )
    result = await explainer.phrase_verified_answer(
        question="Can I buy a phone for ₹15,000?",
        draft_answer=draft,
        facts={},
        mode="cloud",
    )
    assert result["answer"] == draft
    assert result["provider"] == "deterministic"
