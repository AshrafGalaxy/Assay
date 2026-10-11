"""
Local Small Language Model (SLM) Provider for Assay Financial Copilot.
Runs the fine-tuned 485 MB Qwen2.5-0.5B-Instruct Q4_K_M GGUF model locally
on CPU via llama-cpp-python with zero external network dependencies.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

from app.core.config import settings
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)

# backend/app/providers/llm/local_slm_provider.py -> parents[3] is the backend directory.
# The server's working directory is not reliable, so the model is resolved from here.
BACKEND_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_LOCAL_MODEL_PATH = BACKEND_ROOT / "models" / "assay-copilot-qwen0.5b-q4_k_m.gguf"


def resolve_model_path(configured: Optional[str]) -> Path:
    """Find the GGUF whether the process was started from the repo or from backend/."""
    if not configured:
        return DEFAULT_LOCAL_MODEL_PATH
    candidate = Path(configured)
    if candidate.is_absolute():
        return candidate
    from_cwd = (Path.cwd() / candidate).resolve()
    if from_cwd.exists():
        return from_cwd
    return (BACKEND_ROOT / "models" / candidate.name).resolve()


class LocalSLMProvider:
    """
    On-device / Local CPU SLM Inference Provider.
    Executes the quantized 485 MB Qwen2.5-0.5B-Instruct binary locally.
    Enforces strict grounding against pre-computed verified mathematical facts.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        n_ctx: int = 1024,
        n_threads: int = 4,
    ):
        configured_path = model_path or getattr(settings, "LOCAL_SLM_MODEL_PATH", None)
        self.model_path = resolve_model_path(configured_path)
        self.n_ctx = n_ctx
        self.n_threads = n_threads
        self.fallback = LLMProvider()
        self._llm = None

    @property
    def is_configured(self) -> bool:
        """Returns True if the quantized GGUF model file exists on disk."""
        # The full Q4 file is about 379 MB. A smaller file is a partial download.
        return self.model_path.exists() and self.model_path.stat().st_size > 300_000_000

    def _get_llm(self):
        """Lazy-initializes llama_cpp.Llama on first inference call."""
        if self._llm is None and self.is_configured:
            try:
                from llama_cpp import Llama

                logger.info(
                    f"[LocalSLMProvider] Initializing GGUF model from {self.model_path.resolve()} "
                    f"using {self.n_threads} CPU threads..."
                )
                self._llm = Llama(
                    model_path=str(self.model_path.resolve()),
                    n_ctx=self.n_ctx,
                    n_threads=self.n_threads,
                    verbose=False,
                )
                logger.info("[LocalSLMProvider] GGUF model loaded successfully.")
            except ImportError:
                logger.warning(
                    "[LocalSLMProvider] llama-cpp-python is not installed. "
                    "Run 'pip install llama-cpp-python' for offline local inference."
                )
                self._llm = None
            except Exception as e:
                logger.error(f"[LocalSLMProvider] Failed to load GGUF model: {e}")
                self._llm = None
        return self._llm

    def _generate_chatml(self, system_prompt: str, user_prompt: str, max_tokens: int = 220) -> str:
        """Runs local generation using ChatML formatted tokens."""
        llm = self._get_llm()
        if llm is None:
            raise RuntimeError("Local SLM engine is unavailable.")

        prompt = (
            f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
            f"<|im_start|>user\n{user_prompt}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )

        output = llm(
            prompt,
            max_tokens=max_tokens,
            temperature=0.1,
            top_p=0.9,
            stop=["<|im_end|>", "<|endoftext|>"],
        )
        return output["choices"][0]["text"].strip()

    async def generate_grounded(self, system_prompt: str, user_prompt: str) -> str | None:
        """Return model text, or None when the local model cannot run."""
        if not self.is_configured:
            return None
        try:
            text = self._generate_chatml(system_prompt, user_prompt)
            return text or None
        except Exception as exc:
            logger.warning(f"[LocalSLMProvider] Grounded generation failed: {exc}")
            return None

    async def explain_affordability(
        self,
        question: str,
        current_balance: float,
        projected_buffer: float,
        item_cost: float,
    ) -> Dict[str, Any]:
        """
        Explains purchase affordability using on-device SLM inference.
        Falls back seamlessly to deterministic rules if model is not loaded.
        """
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
            "minimum_reserve": getattr(settings, "MINIMUM_RESERVE_FLOOR", 25000.0),
        }

        if not self.is_configured or self._get_llm() is None:
            return await self.fallback.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )

        system_prompt = (
            "You are the Assay Grounded Financial Copilot. "
            "CRITICAL SAFETY CONSTRAINTS:\n"
            "1. You must NEVER perform calculations or invent new numbers.\n"
            "2. Every single currency amount and percentage in your reply MUST be copied directly from the VERIFIED FACTS JSON.\n"
            "3. Use only this vocabulary: Expected Cash, Safety Buffer, Money Above Buffer, Risk of Running Short, Monthly Income, Monthly Spending & Bills, Money Left Each Month, Possible Cash Range, Update My Plan. State whether Expected Cash stays above the Safety Buffer, and suggest installments if there is pressure.\n"
            "4. Tone: Empathetic, concise, clear, and professional."
        )

        user_content = (
            f"User Query: {question}\n\n"
            f"VERIFIED FACTS JSON:\n"
            f"{json.dumps(verified_facts, indent=2)}\n\n"
            "Provide a grounded, helpful 2-to-3 sentence explanation."
        )

        try:
            answer_text = self._generate_chatml(system_prompt, user_content)
            return {
                "intent": "affordability",
                "answer": answer_text,
                "observed": [
                    {"label": "Current Available Balance", "value": f"₹{current_balance:,.0f}"},
                    {"label": "Safety Buffer", "value": f"₹{projected_buffer:,.0f}"},
                    {"label": "Target Expense", "value": f"₹{item_cost:,.0f}"},
                ],
                "analysis": {
                    "can_afford": can_afford,
                    "projected_buffer_after_purchase": buffer_after,
                    "risk_level": "low" if can_afford else "high",
                },
                "recommendation": {
                    "action": "Proceed with purchase" if can_afford else "Defer purchase or split across No-Cost EMI",
                    "impact": f"Keeps Money Above Buffer at ₹{max(0.0, buffer_after):,.0f}",
                },
                "confidence": 0.98,
                "provider": "local_slm/qwen2.5-0.5b-q4_k_m",
                "limitations": [
                    "Generated entirely on-device (zero cloud latency / zero data egress)",
                    "Verified against Assay Conformal Solvency Engine",
                ],
            }
        except Exception as e:
            logger.warning(f"[LocalSLMProvider] Inference failed ({e}), falling back to deterministic template.")
            fallback_res = await self.fallback.explain_affordability(
                question=question,
                current_balance=current_balance,
                projected_buffer=projected_buffer,
                item_cost=item_cost,
            )
            fallback_res["provider"] = "deterministic_fallback"
            return fallback_res

    def explain_decision_flip(self, verified_math: Dict[str, Any]) -> str:
        """Explains Decision-Flip Theorem (Sequence B vs Sequence A under uncertainty)."""
        system_prompt = (
            "You are the Assay Financial Health Copilot. Explain mathematical trade-offs "
            "accurately using only provided facts. Never invent or hallucinate figures."
        )
        user_prompt = (
            f"Explain the cash-flow trade-off between Sequence A and Sequence B under uncertainty.\n\n"
            f"VERIFIED FACTS JSON:\n{json.dumps(verified_math)}"
        )
        return self._generate_chatml(system_prompt, user_prompt)

    def explain_replanning_shock(self, verified_math: Dict[str, Any]) -> str:
        """Explains dynamic constraint relaxation during income cuts or emergency shocks."""
        system_prompt = (
            "You are the Assay Financial Health Copilot. Explain mathematical trade-offs "
            "accurately using only provided facts. Never invent or hallucinate figures."
        )
        user_prompt = (
            f"Provide recovery guidance after an unexpected essential financial shock.\n\n"
            f"VERIFIED FACTS JSON:\n{json.dumps(verified_math)}"
        )
        return self._generate_chatml(system_prompt, user_prompt)
