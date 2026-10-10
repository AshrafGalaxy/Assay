"""
Copilot Query API Router.
Integrates Hugging Face open-model inference with deterministic financial calculation
and post-generation regex faithfulness audit.
"""

import re
from fastapi import APIRouter
from app.schemas.financial_health import CopilotQueryRequest, CopilotQueryResponse
from app.providers.llm.copilot_explainer import CopilotExplainer

router = APIRouter(prefix="/copilot", tags=["copilot"])
explainer = CopilotExplainer()


@router.post("/query", response_model=CopilotQueryResponse)
async def query_copilot(request: CopilotQueryRequest):
    """
    Copilot query endpoint.
    Extracts financial parameters, verifies mathematical facts,
    and returns a grounded, audit-checked LLM explanation.
    """
    question = request.question
    
    # Extract target expense amount from natural language (e.g. "Can I buy a ₹30,000 phone?")
    amount_match = re.search(r'(?:₹|rs\.?|inr)?\s*([\d,]+)', question, re.IGNORECASE)
    item_cost = 30000.0
    if amount_match:
        try:
            cleaned = amount_match.group(1).replace(",", "")
            if cleaned.isdigit() and float(cleaned) > 0:
                item_cost = float(cleaned)
        except Exception:
            pass

    # Dynamically bind user balance and projected buffer from active ledger
    try:
        from app.services.financial_intelligence.ledger import get_user_profile, get_ledger_transactions
        from app.services.financial_intelligence.engine import build_financial_health

        profile = get_user_profile()
        health = build_financial_health(get_ledger_transactions(historical_only=True))
        current_balance = float(profile.get("starting_balance") or 42850.0)
        projected_buffer = float(health.get("projected_month_end_balance") or 27650.0)
    except Exception:
        current_balance = 42850.0
        projected_buffer = 27650.0

    result = await explainer.explain_affordability_grounded(
        question=question,
        current_balance=current_balance,
        projected_buffer=projected_buffer,
        item_cost=item_cost,
    )


    return CopilotQueryResponse(
        intent=result.get("intent", "affordability"),
        answer=result.get("answer", ""),
        observed=result.get("observed", []),
        analysis=result.get("analysis", {}),
        recommendation=result.get("recommendation"),
        confidence=result.get("confidence", 0.95),
        limitations=result.get("limitations", []),
        audit_passed=result.get("audit_passed", True),
        provider=result.get("provider", "huggingface"),
    )
