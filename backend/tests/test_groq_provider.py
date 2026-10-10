import pytest
from app.providers.llm.groq_provider import GroqLLMProvider
from app.providers.llm.copilot_explainer import CopilotExplainer


@pytest.mark.asyncio
async def test_groq_provider_initialization():
    provider = GroqLLMProvider()
    assert provider.endpoint == "https://api.groq.com/openai/v1/chat/completions"
    assert provider.model_id == "qwen/qwen3.8-27b"
    assert provider.is_configured is True


@pytest.mark.asyncio
async def test_groq_provider_explains_affordability():
    provider = GroqLLMProvider()
    res = await provider.explain_affordability(
        question="Can I afford a Rs 30,000 phone?",
        current_balance=42850.0,
        projected_buffer=27650.0,
        item_cost=30000.0,
    )
    assert "answer" in res
    assert "observed" in res
    assert "analysis" in res
    assert res["analysis"]["can_afford"] is False
    assert res["analysis"]["shortfall"] == 2350.0


@pytest.mark.asyncio
async def test_copilot_explainer_with_groq_faithfulness_audit():
    explainer = CopilotExplainer()
    assert explainer.groq_provider.is_configured is True

    res = await explainer.explain_affordability_grounded(
        question="Can I buy an appliance for Rs 15,000?",
        current_balance=42850.0,
        projected_buffer=27650.0,
        item_cost=15000.0,
    )
    assert res["intent"] == "affordability"
    assert "answer" in res
    assert res["audit_passed"] is True
    assert res["analysis"]["can_afford"] is True
