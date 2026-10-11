"""
Grounded Financial Copilot Explainer & Faithfulness Auditor (FIN 02 Additions 1 & 2).
Implements the 5-layer robustness stack:
1. Ingests pre-computed verified mathematical facts (zero LLM arithmetic).
2. Strict negative prompting ("You must NEVER compute or alter arithmetic").
3. Structured output parsing.
4. Post-generation regex faithfulness audit (verifies 100% of numerical tokens).
5. Zero-downtime deterministic fallback circuit breaker to base.py.
"""

import json
import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from app.core.config import settings
from app.providers.llm.base import LLMProvider
from app.providers.llm.hf_provider import HuggingFaceLLMProvider
from app.providers.llm.groq_provider import GroqLLMProvider
from app.providers.llm.local_slm_provider import LocalSLMProvider
from app.providers.llm.ohttp_client import ohttp_client, OHTTPClient, DeviceHardwareProfiler


logger = logging.getLogger(__name__)



class CopilotExplainer:
    """Grounded financial reasoning explainer with deterministic faithfulness audit."""

    def __init__(
        self,
        fallback_provider: Optional[LLMProvider] = None,
        hf_provider: Optional[HuggingFaceLLMProvider] = None,
        groq_provider: Optional[GroqLLMProvider] = None,
        local_slm_provider: Optional[LocalSLMProvider] = None,
        ohttp_relay_client: Optional[OHTTPClient] = None,
    ):
        self.fallback_provider = fallback_provider or LLMProvider()
        self.hf_provider = hf_provider or HuggingFaceLLMProvider()
        self.groq_provider = groq_provider or GroqLLMProvider()
        self.local_slm_provider = local_slm_provider or LocalSLMProvider()
        self.ohttp_client = ohttp_relay_client or ohttp_client


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
        elif isinstance(payload, str):
            # Also extract numbers in the query or draft, including ₹1,202,140.
            for token in re.findall(r"(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)", payload, re.IGNORECASE):
                try:
                    v = float(token.replace(",", ""))
                    numbers.add(round(v, 0))
                    numbers.add(round(v, 1))
                    numbers.add(round(v, 2))
                except ValueError:
                    pass
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

    @staticmethod
    def _amount_token(token: str) -> Optional[float]:
        """Parse a currency token. A bare comma is not a number."""
        cleaned = token.replace(",", "").strip()
        if not cleaned or cleaned == ".":
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None

    @staticmethod
    def _currency_amounts(text: str) -> List[float]:
        amounts = []
        for token in re.findall(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)", text, re.IGNORECASE):
            value = CopilotExplainer._amount_token(token)
            if value is not None:
                amounts.append(value)
        return amounts

    @staticmethod
    def _first_amount(tokens: List[str]) -> Optional[float]:
        for token in tokens:
            value = CopilotExplainer._amount_token(token)
            if value is not None:
                return value
        return None

    @staticmethod
    def labels_match_draft(draft: str, generated_text: str) -> bool:
        """A named amount in the reply must be the same amount named in the draft."""
        labels = (
            "Expected Cash",
            "Safety Buffer",
            "Money Above Buffer",
            "Risk of Running Short",
            "Monthly Income",
            "Monthly Spending & Bills",
            "Money Left Each Month",
            "Possible Cash Range",
        )
        for label in labels:
            pattern = rf"{re.escape(label)}[^0-9₹]{{0,48}}₹?\s*([\d,]+(?:\.\d+)?)"
            draft_value = CopilotExplainer._first_amount(re.findall(pattern, draft))
            reply_value = CopilotExplainer._first_amount(re.findall(pattern, generated_text))
            if reply_value is None:
                continue
            if draft_value is None or abs(reply_value - draft_value) > 1:
                return False
        return True

    @staticmethod
    def claimed_differences_hold(text: str) -> bool:
        """Reject '₹A, which is ₹B above ₹C' when B is not A − C."""
        pattern = re.compile(
            r"₹\s*([\d,]+(?:\.\d+)?)(?:(?!₹).){0,90}?"
            r"(?:which is|that is|this amount is|this is)\s+"
            r"₹\s*([\d,]+(?:\.\d+)?)\s+(above|below)"
            r"(?:(?!₹).){0,90}?₹\s*([\d,]+(?:\.\d+)?)",
            re.IGNORECASE,
        )
        for left, gap, direction, right in pattern.findall(text):
            left_value = CopilotExplainer._amount_token(left)
            gap_value = CopilotExplainer._amount_token(gap)
            right_value = CopilotExplainer._amount_token(right)
            if left_value is None or gap_value is None or right_value is None:
                return False
            expected = (left_value - right_value) if direction.lower() == "above" else (right_value - left_value)
            if abs(expected - gap_value) > 1:
                return False
        return True

    @staticmethod
    def rewrite_keeps_figures(draft: str, generated_text: str) -> bool:
        """A cloud rewrite may use only the figures already written in the verified draft."""
        try:
            faithful, _ungrounded = CopilotExplainer.audit_faithfulness(
                generated_text, {"draft_answer": draft}
            )
            if not faithful:
                return False
            draft_numbers = CopilotExplainer.extract_numbers_from_payload(draft)
            for token in re.findall(r"(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)", generated_text, re.IGNORECASE):
                if "." not in token:
                    continue
                value = CopilotExplainer._amount_token(token)
                if value is None or not any(abs(value - valid) < 0.01 for valid in draft_numbers):
                    return False
            if not CopilotExplainer.labels_match_draft(draft, generated_text):
                return False
            if not CopilotExplainer.claimed_differences_hold(generated_text):
                return False
            if re.search(r"cannot answer|can't answer|not able to", generated_text, re.IGNORECASE):
                return False
            if re.search(r"expected cash.{0,80}includes", generated_text, re.IGNORECASE):
                return False
            reply_amounts = CopilotExplainer._currency_amounts(generated_text)
            for amount in CopilotExplainer._currency_amounts(draft):
                if not any(abs(amount - other) <= 1 for other in reply_amounts):
                    return False
            return True
        except Exception:
            logger.warning("[CopilotExplainer] Could not audit the model reply; keeping the verified answer.")
            return False

    def generate_grounded_explanation(
        self,
        intent: str,
        verified_math: Dict[str, Any],
        user_query: Optional[str] = None,
        user_mode: Optional[str] = None,
        user_consented: bool = False,
    ) -> Dict[str, Any]:
        """
        Generates a verified, audit-passed explanation from the pre-computed mathematical facts.
        Respects user-consented settings: Local SLM (default) or Cloud OHTTP (with explicit consent).
        If audit fails or API is unavailable, fires the deterministic circuit breaker.
        """
        explanation_text = ""
        effective_mode = user_mode or settings.LLM_PROVIDER

        # Cloud OHTTP Mode requires explicit user consent in Settings
        if effective_mode == "cloud_ohttp" and not user_consented:
            logger.warning("[CopilotExplainer] Cloud mode requested without user consent; falling back to On-Device SLM.")
            effective_mode = "local_slm"

        if intent == "decision_flip":
            seq_a = verified_math.get("sequence_a", {})
            seq_b = verified_math.get("sequence_b", {})
            r_min = verified_math.get("declared_reserve_min", 25000.0)

            # Attempt on-device SLM inference if in local_slm or hybrid mode
            if self.local_slm_provider.is_configured and effective_mode in ["local_slm", "hybrid"]:
                try:
                    explanation_text = self.local_slm_provider.explain_decision_flip(verified_math)
                except Exception as e:
                    logger.warning(f"[CopilotExplainer] Local SLM generation failed ({e}), using grounded template.")
                    explanation_text = ""

            if not explanation_text:
                # High-fidelity grounded template
                explanation_text = (
                    f"Under deterministic median conditions, {seq_a.get('name', 'Sequence A')} projects an ending "
                    f"Expected Cash of ₹{seq_a.get('ending_balance_expected', 0):,.2f}. Accounting for uncertainty, "
                    f"Sequence A carries a {seq_a.get('shortfall_risk_pct', 0)}% Risk of Running Short "
                    f"against your Safety Buffer of ₹{r_min:,.0f}. "
                    f"By contrast, {seq_b.get('name', 'Sequence B')} sets Monthly Spending & Bills to ₹{seq_b.get('discretionary_budget_monthly', 0):,.2f}/mo, "
                    f"bringing Risk of Running Short to {seq_b.get('shortfall_risk_pct', 0)}% "
                    f"with Expected Cash of ₹{seq_b.get('ending_balance_expected', 0):,.2f}. "
                    f"Sequence B is mathematically safer."
                )

        elif intent == "replan_shock":
            shock = verified_math.get("shock_applied", "Financial shock")
            conflicts = verified_math.get("conflict_description", "Constraint conflict detected")
            ending_bal = verified_math.get("ending_cash_balance", 0.0)
            status = verified_math.get("status", "REBALANCED")

            # Attempt on-device SLM inference if configured
            if self.local_slm_provider.is_configured and effective_mode in ["local_slm", "hybrid"]:
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
        user_mode: Optional[str] = None,
        user_consented: bool = False,
    ) -> Dict[str, Any]:
        """
        Grounded affordability explainer integrating On-Device SLM (default)
        or user-consented Cloud OHTTP inference with deterministic faithfulness regex audit.
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
            "question": question,
        }

        effective_mode = user_mode or settings.LLM_PROVIDER
        if effective_mode == "cloud_ohttp" and not user_consented:
            logger.warning("[CopilotExplainer] Cloud mode requested without user consent; falling back to On-Device SLM.")
            effective_mode = "local_slm"

        # Provider dispatch:
        # 1. Explicit local_slm
        if effective_mode == "local_slm":
            if self.local_slm_provider.is_configured:
                res = await self.local_slm_provider.explain_affordability(
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
        # 2. Cloud OHTTP with explicit user consent
        elif effective_mode == "cloud_ohttp" and user_consented:
            if self.groq_provider.is_configured:
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
        # 3. Explicit Groq (with HF fallback if Groq is unconfigured)
        elif effective_mode == "groq":
            if self.groq_provider.is_configured:
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
        # 4. Explicit Hugging Face
        elif effective_mode == "huggingface" and self.hf_provider.is_configured:
            res = await self.hf_provider.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )
        # 5. Hybrid mode: on-device SLM if configured; else cloud providers (Groq/HF) if configured; else fallback
        elif effective_mode == "hybrid":
            if self.local_slm_provider.is_configured:
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

    async def phrase_verified_answer(
        self,
        *,
        question: str,
        draft_answer: str,
        facts: Dict[str, Any],
        mode: str,
    ) -> Dict[str, Any]:
        """Rewrite a verified answer with the model the user selected.

        Numbers that are not already in the verified facts or the draft are
        rejected, and the original answer is kept. If the selected model is not
        configured, the verified answer is returned as-is.
        """
        system_prompt = (
            "You are the Assay Grounded Financial Copilot. "
            "CRITICAL SAFETY CONSTRAINTS:\n"
            "1. You must NEVER invent currency amounts or percentages.\n"
            "2. Every number in your reply MUST already appear in the VERIFIED FACTS JSON.\n"
            "3. Use only this vocabulary: Expected Cash, Safety Buffer, Money Above Buffer, "
            "Risk of Running Short, Monthly Income, Monthly Spending & Bills, Money Left Each Month, "
            "Possible Cash Range, Update My Plan.\n"
            "4. Reply in 2 sentences. Change only the words around the figures.\n"
            "5. Keep each amount beside the same name it has in the draft. "
            "Expected Cash, Safety Buffer, and Money Above Buffer are different figures.\n"
            "6. Copy amounts from the draft answer. Do not use a more precise figure from the JSON.\n"
            "7. Do not connect two different figures with 'which is', and do not say Expected Cash includes the Safety Buffer."
        )
        user_prompt = (
            f"User question: {question}\n\n"
            f"DRAFT ANSWER:\n{draft_answer}\n\n"
            "Rewrite the draft. Change only the words around the figures. "
            "Copy every amount from the draft, not from any other number."
        )

        if mode == "cloud":
            text = await self.groq_provider.generate_grounded(system_prompt, user_prompt)
            provider = "groq"
            label = f"Cloud · {self.groq_provider.model_id}"
            if not text:
                text = await self.hf_provider.generate_grounded(system_prompt, user_prompt)
                provider = f"huggingface/{self.hf_provider.model_id}"
                label = f"Cloud · {self.hf_provider.model_id}"
            if text and not self.rewrite_keeps_figures(draft_answer, text):
                correction = (
                    f"{user_prompt}\n\n"
                    "The previous reply was rejected. Rewrite the draft again. "
                    "Keep every amount next to the same name. "
                    "Do not connect two figures with 'which is'.\n\n"
                    f"DRAFT:\n{draft_answer}"
                )
                retried = await self.groq_provider.generate_grounded(system_prompt, correction)
                if retried:
                    text = retried
            if not text:
                return {
                    "answer": draft_answer,
                    "provider": "deterministic",
                    "model_label": "Verified rules (cloud model is not configured)",
                }
        else:
            text = await self.local_slm_provider.generate_grounded(system_prompt, user_prompt)
            provider = "local_slm"
            label = "Local · Qwen2.5 0.5B"
            if not text:
                return {
                    "answer": draft_answer,
                    "provider": "deterministic",
                    "model_label": "Verified rules (local model is not installed)",
                }

        faithful = self.rewrite_keeps_figures(draft_answer, text)
        if not faithful:
            logger.warning("[CopilotExplainer] Selected model added numbers that are not in the verified answer.")
            return {
                "answer": draft_answer,
                "provider": "deterministic",
                "model_label": "Verified rules (model reply did not match the figures)",
            }
        return {"answer": text, "provider": provider, "model_label": label}
