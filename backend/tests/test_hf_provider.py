import pytest
from unittest.mock import MagicMock, patch
from app.providers.llm.hf_provider import HuggingFaceLLMProvider
from app.providers.llm.copilot_explainer import CopilotExplainer


@pytest.mark.asyncio
async def test_hf_provider_fallback_when_unconfigured():
    """Verifies that HuggingFaceLLMProvider falls back seamlessly to deterministic rules when token is empty."""
    provider = HuggingFaceLLMProvider(token="", model_id="meta-llama/Llama-3.1-8B-Instruct")
    assert not provider.is_configured

    res = await provider.explain_affordability(
        question="Can I afford a ₹15,000 phone?",
        current_balance=50000.0,
        projected_buffer=25000.0,
        item_cost=15000.0,
    )
    assert res["intent"] == "affordability"
    assert res["analysis"]["can_afford"] is True
    assert "₹15,000" in res["answer"]


@pytest.mark.asyncio
async def test_hf_provider_mocked_inference():
    """Verifies HuggingFaceLLMProvider chat completion format with mocked InferenceClient."""
    provider = HuggingFaceLLMProvider(token="hf_mock_token_12345", model_id="meta-llama/Llama-3.1-8B-Instruct")
    assert provider.is_configured

    mock_client = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "Yes, you can comfortably afford this ₹15,000 purchase. Your projected buffer remains ₹10,000."
    mock_response = MagicMock(choices=[mock_choice])
    mock_client.chat.completions.create.return_value = mock_response

    with patch.object(provider, "_get_client", return_value=mock_client):
        res = await provider.explain_affordability(
            question="Can I buy this ₹15,000 phone?",
            current_balance=50000.0,
            projected_buffer=25000.0,
            item_cost=15000.0,
        )
        assert res["intent"] == "affordability"
        assert "₹15,000" in res["answer"]
        assert res["provider"] == "huggingface/meta-llama/Llama-3.1-8B-Instruct"


@pytest.mark.asyncio
async def test_copilot_explainer_circuit_breaker_on_hallucination():
    """Verifies that if an LLM outputs an ungrounded currency figure, the circuit breaker fires."""
    explainer = CopilotExplainer()

    # Mock HF provider returning a hallucinated number ₹99,999 not in verified facts
    mock_hf = MagicMock()
    async def mock_call(**kwargs):
        return {
            "intent": "affordability",
            "answer": "You should buy this item for ₹99,999 right away!",
            "observed": [],
            "analysis": {"can_afford": False},
            "provider": "huggingface/mock",
        }
    mock_hf.explain_affordability = mock_call

    explainer.hf_provider = mock_hf
    explainer.groq_provider.api_key = ""  # isolate to testing hf_provider


    res = await explainer.explain_affordability_grounded(
        question="Can I afford this phone?",
        current_balance=42850.0,
        projected_buffer=27650.0,
        item_cost=30000.0,
    )

    # Circuit breaker must catch the violation
    assert res["audit_passed"] is False
    assert 99999.0 in res["ungrounded_detected"]
    assert res["provider"] == "circuit_breaker_deterministic"
    assert "₹30,000" in res["answer"]
    assert "₹99,999" not in res["answer"]
