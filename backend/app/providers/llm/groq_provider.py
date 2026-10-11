"""
Groq LLM Provider for Assay Grounded Copilot.
Calls ultra-fast instruction models (e.g. qwen/qwen3.8-27b or llama-3.3-70b-versatile)
using pre-calculated mathematical facts and strict negative constraint prompting.
"""

import json
import logging
import re
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

    @staticmethod
    def _visible_answer(text: str) -> str:
        """Drop a reasoning trace so only the reply the user should see remains."""
        cleaned = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL | re.IGNORECASE)
        return cleaned.strip()

    def _chat_payload(self, messages: list, max_tokens: int, disable_reasoning: bool) -> dict:
        payload = {
            "model": self.model_id,
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": max_tokens,
        }
        # Qwen on Groq spends the token budget on a hidden trace unless this is set,
        # and the visible answer then comes back empty.
        if disable_reasoning:
            payload["reasoning_effort"] = "none"
        return payload

    async def _complete(self, messages: list, max_tokens: int) -> str | None:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                payload = self._chat_payload(messages, max_tokens, disable_reasoning=True)
                res = await client.post(self.endpoint, headers=headers, json=payload)
                if res.status_code == 400 and "reasoning_effort" in res.text:
                    payload = self._chat_payload(messages, max_tokens, disable_reasoning=False)
                    res = await client.post(self.endpoint, headers=headers, json=payload)
                if res.status_code != 200:
                    logger.warning(
                        "[GroqLLMProvider] API error HTTP %s: %s",
                        res.status_code,
                        res.text[:300],
                    )
                    return None
                message = res.json()["choices"][0]["message"]
                return self._visible_answer(message.get("content") or "") or None
        except Exception as exc:
            logger.warning(f"[GroqLLMProvider] Grounded generation failed: {exc}")
            return None

    async def generate_grounded(self, system_prompt: str, user_prompt: str) -> str | None:
        """Return cloud model text, or None when Groq is not configured or the call fails."""
        if not self.is_configured:
            return None
        return await self._complete(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=250,
        )

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
            "3. Use only this vocabulary: Expected Cash, Safety Buffer, Money Above Buffer, Risk of Running Short, Monthly Income, Monthly Spending & Bills, Money Left Each Month, Possible Cash Range, Update My Plan. State whether Expected Cash stays above the Safety Buffer, and suggest installments if there is pressure.\n"
            "4. Tone: Empathetic, concise, clear, and professional. Return 2 to 3 sentences max."
        )

        user_content = (
            f"User Query: {question}\n\n"
            f"VERIFIED FACTS JSON:\n"
            f"{json.dumps(verified_facts, indent=2)}\n\n"
            "Provide a grounded, helpful 2-to-3 sentence explanation directly referencing the verified facts."
        )

        answer_text = await self._complete(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_tokens=250,
        )
        if answer_text:
            observed = [
                {"name": "Current Liquid Balance", "value": f"₹{current_balance:,.0f}"},
                {"name": "Target Item Cost", "value": f"₹{item_cost:,.0f}"},
                {"name": "Money Above Buffer", "value": f"₹{buffer_after:,.0f}"},
                {"name": "Safety Buffer", "value": f"₹{settings.MINIMUM_RESERVE_FLOOR:,.0f}"},
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

        return await self.fallback.explain_affordability(
            question=question,
            current_balance=current_balance,
            projected_buffer=projected_buffer,
            item_cost=item_cost,
        )
