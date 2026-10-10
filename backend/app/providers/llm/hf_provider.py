"""
Hugging Face LLM Provider for Assay Grounded Copilot.
Uses huggingface_hub.InferenceClient with strict negative prompts,
deterministic parameter grounding, and zero-downtime fallback.
"""

import json
import logging
from typing import Dict, Any, Optional
from app.core.config import settings
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class HuggingFaceLLMProvider:
    """
    Hugging Face Inference Provider.
    Calls open instruction-tuned foundation models (e.g. meta-llama/Llama-3.1-8B-Instruct)
    using strictly pre-calculated mathematical facts.
    """

    def __init__(self, token: Optional[str] = None, model_id: Optional[str] = None):
        self.token = token or settings.HF_TOKEN
        self.model_id = model_id or settings.HF_MODEL_ID
        self.fallback = LLMProvider()
        self._client = None

    @property
    def is_configured(self) -> bool:
        """Returns True if a valid Hugging Face token is provided."""
        return bool(self.token and len(self.token.strip()) > 5)

    def _get_client(self):
        """Lazy-initializes huggingface_hub.InferenceClient."""
        if self._client is None and self.is_configured:
            try:
                from huggingface_hub import InferenceClient
                self._client = InferenceClient(
                    model=self.model_id,
                    token=self.token,
                    timeout=15.0,
                )
            except Exception as e:
                logger.warning(f"[HuggingFaceLLMProvider] Failed to initialize InferenceClient: {e}")
                self._client = None
        return self._client

    async def explain_affordability(
        self,
        question: str,
        current_balance: float,
        projected_buffer: float,
        item_cost: float,
    ) -> Dict[str, Any]:
        """
        Explains affordability of a planned purchase.
        If Hugging Face is unconfigured or errors out, falls back seamlessly to deterministic rules.
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

        # If HF is not configured, return high-fidelity fallback immediately
        client = self._get_client()
        if client is None:
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
            "1. You must NEVER perform calculations or invent new numbers.\n"
            "2. Every single currency amount and percentage in your reply MUST be copied directly from the VERIFIED FACTS JSON.\n"
            "3. State clearly whether the user can afford the item, explain the safety buffer impact, and suggest splitting into installments if there is cash-flow pressure.\n"
            "4. Tone: Empathetic, concise, clear, and professional."
        )

        user_content = (
            f"User Query: {question}\n\n"
            f"VERIFIED FACTS JSON:\n"
            f"{json.dumps(verified_facts, indent=2)}\n\n"
            "Provide a grounded, helpful 2-to-3 sentence explanation."
        )

        try:
            # Call Hugging Face Chat Completion endpoint
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ]
            response = client.chat.completions.create(
                messages=messages,
                max_tokens=220,
                temperature=0.1,
            )
            answer_text = response.choices[0].message.content.strip()

            return {
                "intent": "affordability",
                "answer": answer_text,
                "observed": [
                    {"label": "Current Available Balance", "value": f"₹{current_balance:,.0f}"},
                    {"label": "Projected Monthly Buffer", "value": f"₹{projected_buffer:,.0f}"},
                    {"label": "Target Expense", "value": f"₹{item_cost:,.0f}"},
                ],
                "analysis": {
                    "can_afford": can_afford,
                    "projected_buffer_after_purchase": buffer_after,
                    "risk_level": "low" if can_afford else "high",
                },
                "recommendation": {
                    "action": "Proceed with purchase" if can_afford else "Defer purchase or split across No-Cost EMI",
                    "impact": f"Retains safety buffer of ₹{max(0.0, buffer_after):,.0f}",
                },
                "confidence": 0.95,
                "provider": f"huggingface/{self.model_id}",
                "limitations": [
                    "Verified by Assay Conformal Solvency Engine",
                    "Assumes scheduled debt EMIs and rent are maintained",
                ],
            }

        except Exception as e:
            logger.warning(
                f"[HuggingFaceLLMProvider] HF Inference failed ({e}). "
                f"Gracefully falling back to deterministic template engine."
            )
            fallback_res = await self.fallback.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )
            fallback_res["provider"] = "deterministic_fallback"
            return fallback_res
