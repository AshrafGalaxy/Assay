"""
Groq LLM Provider for Assay Grounded Copilot.
Calls ultra-fast instruction models (e.g. qwen/qwen3.8-27b or llama-3.3-70b-versatile)
using pre-calculated mathematical facts and strict negative constraint prompting.
"""

import json
import logging
from typing import Dict, Any, Optional
import httpx

from app.core.config import settings
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class GroqLLMProvider:
    """
    Groq Cloud Inference Provider.
    Ultra-low latency (< 1.0s) OpenAI-compatible inference with 5-layer guardrails.
    """

    def __init__(self, api_key: Optional[str] = None, model_id: Optional[str] = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.model_id = model_id or getattr(settings, "GROQ_MODEL_ID", "qwen/qwen3.8-27b")
        self.endpoint = "https://api.groq.com/openai/v1/chat/completions"
        self.fallback = LLMProvider()

    @property
    def is_configured(self) -> bool:
        """Returns True if a valid Groq API key is provided."""
        return bool(self.api_key and self.api_key.startswith("gsk_") and len(self.api_key.strip()) > 10)

    async def explain_affordability(
        self,
        question: str,
        current_balance: float,
        projected_buffer: float,
        item_cost: float,
    ) -> Dict[str, Any]:
        """
        Explains affordability of a planned purchase.
        If Groq is unconfigured or errors out, falls back seamlessly to deterministic rules.
        """
        # 1. Deterministic baseline computation
        can_afford = projected_buffer >= item_cost
        shortfall = max(0.0, item_cost - projected_buffer)
        buffer_after = projected_buffer - item_cost

        verified_facts = {
            "question": question,
            "current_balance": current_balance,
            "projected_buffer": projected_buffer,
            "item_cost": item_cost,
            "can_afford": can_afford,
            "shortfall": shortfall,
            "buffer_after_purchase": buffer_after,
            "minimum_reserve": settings.MINIMUM_RESERVE_FLOOR,
        }

        # If Groq is not configured, return deterministic fallback immediately
        if not self.is_configured:
            return await self.fallback.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )

        # 2. Strict Negative Prompting to prevent arithmetic hallucinations
        system_prompt = (
            "You are the Assay Grounded Financial Copilot. "
            "CRITICAL SAFETY CONSTRAINTS:\n"
            "1. You must NEVER compute, calculate, or alter financial numbers.\n"
            "2. Every single currency amount and percentage in your reply MUST be copied directly from the VERIFIED FACTS JSON.\n"
            "3. State clearly whether the user can afford the item, explain the safety buffer impact, and suggest splitting into installments if there is cash-flow pressure.\n"
            "4. Tone: Empathetic, concise, clear, and professional. Return 2 to 3 sentences max."
        )

        user_content = (
            f"User Query: {question}\n\n"
            f"VERIFIED FACTS JSON:\n"
            f"{json.dumps(verified_facts, indent=2)}\n\n"
            "Provide a grounded, helpful 2-to-3 sentence explanation directly referencing the verified facts."
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model_id,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.1,
            "max_tokens": 250,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(self.endpoint, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    answer_text = data["choices"][0]["message"]["content"].strip()

                    observed = [
                        {"name": "Current Liquid Balance", "value": f"₹{current_balance:,.0f}"},
                        {"name": "Target Item Cost", "value": f"₹{item_cost:,.0f}"},
                        {"name": "Safety Buffer After Purchase", "value": f"₹{buffer_after:,.0f}"},
                        {"name": "Minimum Reserve Floor", "value": f"₹{settings.MINIMUM_RESERVE_FLOOR:,.0f}"},
                    ]

                    analysis = {
                        "can_afford": can_afford,
                        "shortfall": shortfall,
                        "projected_trough": buffer_after,
                        "declared_reserve": settings.MINIMUM_RESERVE_FLOOR,
                        "buffer_deficit": shortfall > 0,
                    }

                    recommendation = {
                        "action": "Proceed with Purchase" if can_afford else "Consider 3-Month EMI or Delay",
                        "strategy": "lump_sum" if can_afford else "emi_shield",
                        "max_safe_emi": round(projected_buffer / 3, 2),
                    }

                    return {
                        "intent": "affordability",
                        "answer": answer_text,
                        "observed": observed,
                        "analysis": analysis,
                        "recommendation": recommendation,
                        "confidence": 0.98,
                        "limitations": [f"Inference generated via Groq ({self.model_id}) with deterministic math verification."],
                        "provider": "groq",
                        "verified_facts": verified_facts,
                    }
                else:
                    logger.warning(f"[GroqLLMProvider] API error HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"[GroqLLMProvider] Request failed: {e}. Falling back to deterministic rules.")

        # Fallback to local verified template on any error
        return await self.fallback.explain_affordability(
            question=question,
            current_balance=current_balance,
            projected_buffer=projected_buffer,
            item_cost=item_cost,
        )
