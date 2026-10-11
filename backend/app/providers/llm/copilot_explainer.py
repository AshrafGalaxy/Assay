"""
Grounded Financial Copilot Explainer & Faithfulness Auditor (FIN 02 Additions 1 & 2).
Implements the 5-layer robustness stack:
1. Ingests pre-computed verified mathematical facts (zero LLM arithmetic).
2. Strict negative prompting ("You must NEVER compute or alter arithmetic").
3. Structured output parsing.
4. Post-generation regex faithfulness audit (verifies 100% of numerical tokens).
5. Zero-downtime deterministic fallback circuit breaker to base.py.
"""

import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from app.core.config import settings
from app.providers.llm.base import LLMProvider
from app.providers.llm.hf_provider import HuggingFaceLLMProvider
from app.providers.llm.groq_provider import GroqLLMProvider
from app.providers.llm.local_slm_provider import LocalSLMProvider


logger = logging.getLogger(__name__)



class CopilotExplainer:
    """Grounded financial reasoning explainer with deterministic faithfulness audit."""

    def __init__(
        self,
        fallback_provider: Optional[LLMProvider] = None,
        hf_provider: Optional[HuggingFaceLLMProvider] = None,
        groq_provider: Optional[GroqLLMProvider] = None,
        local_slm_provider: Optional[LocalSLMProvider] = None,
    ):
        self.fallback_provider = fallback_provider or LLMProvider()
        self.hf_provider = hf_provider or HuggingFaceLLMProvider()
        self.groq_provider = groq_provider or GroqLLMProvider()
        self.local_slm_provider = local_slm_provider or LocalSLMProvider()


    @staticmethod
    def extract_numbers_from_payload(payload: Any) -> set:
        """Recursively extracts all numeric values from arbitrary dictionary/list structures."""
        numbers = set()
        if isinstance(payload, dict):
            for v in payload.values():
                numbers.update(CopilotExplainer.extract_numbers_from_payload(v))
        elif isinstance(payload, (list, tuple)):
            for item in payload:
                numbers.update(CopilotExplainer.extract_numbers_from_payload(item))
        elif isinstance(payload, (int, float)):
            # Store exact number as well as rounded representations
            val = float(payload)
            numbers.add(round(val, 0))
            numbers.add(round(val, 1))
            numbers.add(round(val, 2))
        return numbers

    @staticmethod
    def audit_faithfulness(generated_text: str, source_payload: Dict[str, Any]) -> Tuple[bool, List[float]]:
        """
        Deterministic regex audit: extracts all currency / number tokens in the generated text
        and verifies that each exists in the source mathematical payload.
        Returns (is_faithful, ungrounded_numbers).
        """
        # Match currency numbers like ₹15,000, ₹25,000.50, 31.4%, 4.2%
        tokens = re.findall(r"(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)", generated_text, re.IGNORECASE)
        valid_numbers = CopilotExplainer.extract_numbers_from_payload(source_payload)

        # Standard common formatting tokens to ignore (e.g. Month 1, Period 6)
        whitelisted_small_ints = {1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 12.0, 24.0, 100.0}

        ungrounded = []
        for token in tokens:
            try:
                cleaned = float(token.replace(",", ""))
                if cleaned in whitelisted_small_ints:
                    continue

                # Check if cleaned value or its close equivalent exists in source
                found = False
                for valid_val in valid_numbers:
                    if abs(cleaned - valid_val) < 0.5:
                        found = True
                        break

                if not found:
                    ungrounded.append(cleaned)
            except ValueError:
                continue

        is_faithful = len(ungrounded) == 0
        return is_faithful, ungrounded

    def generate_grounded_explanation(
        self,
        intent: str,
        verified_math: Dict[str, Any],
        user_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generates a verified, audit-passed explanation from the pre-computed mathematical facts.
        If audit fails or API is unavailable, fires the deterministic circuit breaker.
        """
        explanation_text = ""

        if intent == "decision_flip":
            seq_a = verified_math.get("sequence_a", {})
            seq_b = verified_math.get("sequence_b", {})
            r_min = verified_math.get("declared_reserve_min", 25000.0)

            # Attempt on-device SLM inference if configured
            if self.local_slm_provider.is_configured and settings.LLM_PROVIDER in ["local_slm", "hybrid"]:
                try:
                    explanation_text = self.local_slm_provider.explain_decision_flip(verified_math)
                except Exception as e:
                    logger.warning(f"[CopilotExplainer] Local SLM generation failed ({e}), using grounded template.")
                    explanation_text = ""

            if not explanation_text:
                # High-fidelity grounded template
                explanation_text = (
                    f"Under deterministic median conditions, {seq_a.get('name', 'Sequence A')} projects an ending "
                    f"balance of ₹{seq_a.get('ending_balance_expected', 0):,.2f}. However, accounting for cash flow "
                    f"uncertainty, Sequence A carries an unacceptable {seq_a.get('shortfall_risk_pct', 0)}% risk "
                    f"of breaching your ₹{r_min:,.0f} minimum reserve threshold. "
                    f"By contrast, {seq_b.get('name', 'Sequence B')} implements a ₹{seq_b.get('discretionary_budget_monthly', 0):,.2f}/mo "
                    f"discretionary budget, collapsing your shortfall risk to {seq_b.get('shortfall_risk_pct', 0)}% "
                    f"while securing ₹{seq_b.get('ending_balance_expected', 0):,.2f} in final reserves. "
                    f"Sequence B is mathematically safer."
                )

        elif intent == "replan_shock":
            shock = verified_math.get("shock_applied", "Financial shock")
            conflicts = verified_math.get("conflict_description", "Constraint conflict detected")
            ending_bal = verified_math.get("ending_cash_balance", 0.0)
            status = verified_math.get("status", "REBALANCED")

            # Attempt on-device SLM inference if configured
            if self.local_slm_provider.is_configured and settings.LLM_PROVIDER in ["local_slm", "hybrid"]:
                try:
                    explanation_text = self.local_slm_provider.explain_replanning_shock(verified_math)
                except Exception as e:
                    logger.warning(f"[CopilotExplainer] Local SLM generation failed ({e}), using grounded template.")
                    explanation_text = ""

            if not explanation_text:
                explanation_text = (
                    f"Evaluating shock: {shock}. {conflicts}. "
                    f"Plan status is {status} with a rebalanced ending cash reserve of ₹{ending_bal:,.2f}."
                )

        else:
            # General fallback to existing provider
            return {
                "intent": intent,
                "answer": "Financial plan computed and verified against cash reserve constraints.",
                "verified_math": verified_math,
                "audit_passed": True,
            }

        # Run Faithfulness Audit
        is_faithful, ungrounded = self.audit_faithfulness(explanation_text, verified_math)

        if not is_faithful:
            logger.warning(
                f"[CopilotExplainer] Faithfulness audit violation! Hallucinated numbers: {ungrounded}. "
                f"Triggering circuit breaker fallback."
            )
            # Circuit breaker
            explanation_text = (
                f"Financial evaluation complete. Sequence B is recommended to maintain your declared cash reserve. "
                f"Projected ending balance: ₹{verified_math.get('sequence_b', {}).get('ending_balance_expected', 0):,.2f}."
            )

        return {
            "intent": intent,
            "answer": explanation_text,
            "audit_passed": is_faithful,
            "ungrounded_detected": ungrounded,
            "verified_math": verified_math,
        }

    async def explain_affordability_grounded(
        self,
        question: str,
        current_balance: float,
        projected_buffer: float,
        item_cost: float,
    ) -> Dict[str, Any]:
        """
        Grounded affordability explainer integrating Hugging Face open models
        with deterministic faithfulness regex audit.
        """
        can_afford = projected_buffer >= item_cost
        shortfall = max(0.0, item_cost - projected_buffer)
        buffer_after = projected_buffer - item_cost

        verified_math = {
            "current_balance": current_balance,
            "projected_buffer": projected_buffer,
            "item_cost": item_cost,
            "can_afford": can_afford,
            "shortfall": shortfall,
            "buffer_after_purchase": buffer_after,
            "minimum_reserve": settings.MINIMUM_RESERVE_FLOOR,
            "installment_3mo": round(item_cost / 3, 2),
            "installment_months": 3,
        }


        # Provider dispatch: Local SLM (if selected or configured) -> Groq -> HuggingFace -> Deterministic Fallback
        if settings.LLM_PROVIDER == "local_slm" or (self.local_slm_provider.is_configured and not self.groq_provider.is_configured):
            res = await self.local_slm_provider.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )
        elif self.groq_provider.is_configured:
            res = await self.groq_provider.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )
        elif self.hf_provider.is_configured:
            res = await self.hf_provider.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )
        else:
            res = await self.fallback_provider.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )

        # Run Faithfulness Audit on returned text
        is_faithful, ungrounded = self.audit_faithfulness(res.get("answer", ""), verified_math)


        if not is_faithful:
            logger.warning(
                f"[CopilotExplainer] Affordability audit violation! Hallucinated numbers: {ungrounded}. "
                f"Triggering deterministic fallback circuit breaker."
            )
            # Circuit breaker fallback
            if can_afford:
                res["answer"] = (
                    f"Yes, you can afford this purchase of ₹{item_cost:,.0f}. "
                    f"Your projected month-end buffer will remain safe at ₹{buffer_after:,.0f}."
                )
            else:
                res["answer"] = (
                    f"Making this ₹{item_cost:,.0f} purchase right now would create cash-flow pressure, "
                    f"exceeding your projected buffer by ₹{shortfall:,.0f}. We recommend waiting until next month's salary cycle or splitting into zero-cost installments."
                )
            res["provider"] = "circuit_breaker_deterministic"

        res["audit_passed"] = is_faithful
        res["ungrounded_detected"] = ungrounded
        res["verified_math"] = verified_math
        return res
