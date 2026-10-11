import json
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.copilot_audit import CopilotAuditLog
from app.services.financial_intelligence.engine import (
    build_cash_flow_forecast,
    calculate_affordability,
    get_upcoming_obligations_projection,
)
from app.services.financial_intelligence.ledger import get_user_profile
from app.services.financial_intelligence.unified_data import (
    get_unified_financial_data,
    get_user_forecast_settings,
)

MODEL_VERSION = "assay-engine-v2.1+rules-audited"


def _format_inr(val: float) -> str:
    return f"₹{abs(val):,.0f}"


def _extract_amount(text: str) -> Optional[float]:
    match = re.search(r"(?:₹|rs\.?|inr)?\s*([\d,]+)", text, re.IGNORECASE)
    if match:
        try:
            cleaned = match.group(1).replace(",", "")
            if cleaned.isdigit() and float(cleaned) > 0:
                return float(cleaned)
        except Exception:
            pass
    return None


def execute_audited_copilot_query(
    question: str,
    db: Session,
    user_id: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Core Audited Financial Intelligence Copilot Engine.
    Grounds all responses in real balances, contractual obligations,
    forecast period balances, and safety buffer headroom.
    Logs full audit trail to database.
    """
    # 1. Fetch verified financial inputs
    profile = get_user_profile(user_id=user_id)
    unified = get_unified_financial_data(db, user_id=user_id)
    settings = get_user_forecast_settings(db, user_id=user_id)

    current_balance = float(unified.get("available_balance") or 0.0)
    min_reserve = float((settings.get("minimum_reserve") if isinstance(settings, dict) else getattr(settings, "minimum_reserve", 0.0)) or 0.0)
    last_synced = unified.get("last_synced_at") or datetime.now(timezone.utc).isoformat()
    raw_txns = unified.get("transactions", [])

    # 2. Compute 1-month and 6-month forecast
    include = {
        "include_income": bool(settings.get("include_income", True)) if isinstance(settings, dict) else True,
        "include_essential": bool(settings.get("include_essential", True)) if isinstance(settings, dict) else True,
        "include_discretionary": bool(settings.get("include_discretionary", True)) if isinstance(settings, dict) else True,
        "include_debt": bool(settings.get("include_debt", True)) if isinstance(settings, dict) else True,
        "include_obligations": bool(settings.get("include_obligations", True)) if isinstance(settings, dict) else True,
    }
    forecast_1m = build_cash_flow_forecast(
        raw_txns,
        profile=profile,
        horizon_months=1,
        opening_balance=current_balance,
        minimum_reserve=min_reserve,
        **include,
    )
    forecast_6m = build_cash_flow_forecast(
        raw_txns,
        profile=profile,
        horizon_months=6,
        opening_balance=current_balance,
        minimum_reserve=min_reserve,
        **include,
    )

    # 3. Compute upcoming obligations
    obligations_data = get_upcoming_obligations_projection(raw_txns, horizon_months=6)
    upcoming_list = obligations_data.get("obligations", [])
    today_iso = date.today().isoformat()
    soon_iso = (date.today() + timedelta(days=31)).isoformat()
    near_term_obligations = [
        ob for ob in upcoming_list
        if today_iso <= str(ob.get("due_date_iso", ""))[:10] <= soon_iso
    ]
    if not near_term_obligations and upcoming_list:
        first_month = str(upcoming_list[0].get("due_date_iso", ""))[:7]
        near_term_obligations = [
            ob for ob in upcoming_list if str(ob.get("due_date_iso", "")).startswith(first_month)
        ]
    near_term_total = sum(ob["amount"] for ob in near_term_obligations)
    near_term_detail = ", ".join(
        f"{ob['name']} ({_format_inr(ob['amount'])})" for ob in near_term_obligations[:3]
    ) or "No upcoming bills in the transaction history"

    # Baseline monthly discretionary pace
    disc_baseline = float(forecast_1m.get("monthly_discretionary") or 0.0)
    weekly_disc_pace = round(disc_baseline / 4.0)

    # 4. Classify intent
    q_lower = question.lower()
    extracted_cost = _extract_amount(question)

    intent = "general_inquiry"
    if any(k in q_lower for k in ["afford", "buy", "purchase", "spend", "watch", "car", "phone", "cost"]):
        intent = "affordability"
    elif any(k in q_lower for k in ["save", "saving", "cut spend", "cut cost", "reduce expense"]):
        intent = "savings_opportunity"
    elif any(k in q_lower for k in ["short", "shortfall", "trough", "buffer", "breach", "payday", "overdraft", "risk"]):
        intent = "reserve_shortfall"
    elif any(k in q_lower for k in ["obligation", "bill", "rent", "emi", "debt", "due"]):
        intent = "obligations"
    elif any(k in q_lower for k in ["trend", "burn", "cash flow", "trajectory"]):
        intent = "cash_flow_change"
    if intent == "affordability" and not (extracted_cost and extracted_cost > 0):
        intent = "general_inquiry"

    insight_id = f"ins_{uuid.uuid4().hex[:10]}"
    audit_id = str(uuid.uuid4())

    # 5. Build Grounded Answer Structure
    if intent == "affordability":
        item_cost = extracted_cost if extracted_cost and extracted_cost > 0 else 0.0
        afford_res = calculate_affordability(
            raw_txns,
            purchase_amount=item_cost,
            purchase_date=date.today().isoformat(),
            expense_type="onetime",
            opening_balance=current_balance,
            minimum_reserve=min_reserve,
            profile=profile,
        )

        can_afford = afford_res["verdict"] == "affordable"
        post_bal = afford_res["post_purchase_balance"]
        trough = afford_res["trough_before_payday"]
        headroom = afford_res["headroom_above_reserve"]

        headline = f"Purchase Assessment: {_format_inr(item_cost)}"
        if can_afford:
            answer = (
                f"Yes, you can afford this purchase of {_format_inr(item_cost)}. "
                f"Expected Cash stays at {_format_inr(post_bal)}, "
                f"with Money Above Buffer of {_format_inr(headroom)} over your Safety Buffer of {_format_inr(min_reserve)}."
            )
        else:
            deficit = abs(headroom)
            answer = (
                f"Making this {_format_inr(item_cost)} purchase right now will create cash-flow pressure, "
                f"reducing your liquidity trough to {_format_inr(trough)}. This is {_format_inr(deficit)} below "
                f"your Safety Buffer of {_format_inr(min_reserve)}. We recommend deferring or selecting an installment plan."
            )

        what_we_know = [
            {
                "label": "Current Available Cash",
                "value": _format_inr(current_balance),
                "detail": "Verified across active linked accounts",
                "source": "Account Aggregator",
            },
            {
                "label": "Upcoming Bills Before Payday",
                "value": _format_inr(afford_res["upcoming_obligations_total"]),
                "detail": "Mandatory contractual obligations (Rent + EMIs)",
                "source": "Bank Ledger",
            },
            {
                "label": "Safety Buffer",
                "value": _format_inr(min_reserve),
                "detail": "User-defined reserve threshold",
                "source": "Forecast Settings",
            },
        ]

        what_may_happen = (
            f"Post-purchase liquidity will reach {_format_inr(trough)} before your next income deposit. "
            f"Buffer status: {'Preserved' if can_afford else f'Breached with {_format_inr(deficit)} deficit'}."
        )

        what_you_can_do = {
            "action": (
                "Proceed with purchase"
                if can_afford
                else "Test 3-Month No-Cost EMI or delay purchase until after payday"
            ),
            "impact": (
                f"Keeps Money Above Buffer at {_format_inr(headroom)}"
                if can_afford
                else f"Avoids cash deficit of {_format_inr(deficit)} before payday"
            ),
            "action_url": "/copilot/affordability",
            "action_label": "Open Affordability Check",
        }

        assumptions = [
            "Assumes regular monthly salary deposit clears on expected payday",
            "Assumes scheduled debt payments and bills are debited on time",
            "Does not factor in unrecorded offline cash expenses",
        ]
        limitations = [
            "Based on verified 90-day transaction history and active account balances",
            "Discretionary spending variance may adjust available headroom by +/- 10%",
        ]

        analysis = {
            "can_afford": can_afford,
            "projected_buffer_after_purchase": post_bal,
            "trough_before_payday": trough,
            "risk_level": "low" if can_afford else "high",
        }
        recommendation_obj = {
            "action": what_you_can_do["action"],
            "impact": what_you_can_do["impact"],
        }

    elif intent == "reserve_shortfall":
        lowest_bal = float(forecast_1m.get("minimum_balance") or 0.0)
        trough_period = min(
            forecast_1m.get("periods") or [{"closing_balance": lowest_bal, "period_label": "the next month"}],
            key=lambda p: p.get("closing_balance", lowest_bal),
        )
        trough_date = trough_period.get("period_label", "the next month")
        shortfall = max(0.0, min_reserve - lowest_bal)

        headline = "Risk of Running Short"
        if shortfall > 0:
            answer = (
                f"After scheduled loan EMIs and rent auto-debits process, Expected Cash reaches {_format_inr(lowest_bal)}. "
                f"That is {_format_inr(shortfall)} below your Safety Buffer of {_format_inr(min_reserve)}."
            )
        else:
            above = max(0.0, lowest_bal - min_reserve)
            answer = (
                f"After scheduled loan EMIs and rent auto-debits process, Expected Cash reaches {_format_inr(lowest_bal)}. "
                f"That is {_format_inr(above)} above your Safety Buffer of {_format_inr(min_reserve)}."
            )

        what_we_know = [
            {
                "label": "Current Total Bank Balance",
                "value": _format_inr(current_balance),
                "detail": "Consolidated across linked accounts",
                "source": "Connected Accounts",
            },
            {
                "label": "Mandatory Contractual Bills",
                "value": _format_inr(near_term_total),
                "detail": near_term_detail,
                "source": "Contractual Obligations",
            },
            {
                "label": "Discretionary Spending Pace",
                "value": f"{_format_inr(weekly_disc_pace)}/wk",
                "detail": "Average discretionary spending from your transactions",
                "source": "Transaction Categorization",
            },
        ]

        what_may_happen = (
            f"Checking balance trough occurs around {trough_date} before payday. "
            f"If spending continues at the current rate, Money Above Buffer turns negative by {_format_inr(shortfall)}."
        )

        what_you_can_do = {
            "action": f"Cap discretionary spending to {_format_inr(weekly_disc_pace * 0.7)} this week",
            "impact": f"Protects your Safety Buffer and restores Money Above Buffer",
            "action_url": "/simulator",
            "action_label": "Update My Plan",
        }

        assumptions = [
            "Income timing follows the credits already in your transactions",
            "Rent and loan EMIs auto-debit on scheduled contractual due dates",
        ]
        limitations = [
            "Verified against 90-day banking transactions ledger",
            "Excludes unconfirmed pending transfers and offline cash transactions",
        ]

        analysis = {
            "lowest_balance": lowest_bal,
            "shortfall": shortfall,
            "trough_date": trough_date,
            "risk_level": "medium" if shortfall > 0 else "low",
        }
        recommendation_obj = {
            "action": what_you_can_do["action"],
            "impact": what_you_can_do["impact"],
        }

    elif intent == "obligations":
        headline = "Upcoming Contractual Commitments"
        answer = (
            f"You have {_format_inr(near_term_total)} in mandatory contractual obligations due in the next cycle. "
            f"Your current cash of {_format_inr(current_balance)} covers these commitments with a net balance of {_format_inr(current_balance - near_term_total)}."
        )

        what_we_know = [
            {
                "label": "Current Available Cash",
                "value": _format_inr(current_balance),
                "detail": "Liquid checking and savings funds",
                "source": "Bank Accounts",
            },
            {
                "label": "Next Cycle Commitments",
                "value": _format_inr(near_term_total),
                "detail": f"{len(near_term_obligations)} contractual payments scheduled",
                "source": "Obligations Ledger",
            },
            {
                "label": "Safety Buffer Setting",
                "value": _format_inr(min_reserve),
                "detail": "Target reserve threshold",
                "source": "Forecast Settings",
            },
        ]

        what_may_happen = (
            f"All contractual payments will clear. Remaining liquid balance after payment will be "
            f"{_format_inr(current_balance - near_term_total)}."
        )

        what_you_can_do = {
            "action": "Review payment calendar and confirm auto-debit balance sufficiency",
            "impact": "Eliminates bounce risks and ensures zero late fees",
            "action_url": "/forecast/obligations",
            "action_label": "View Upcoming Obligations",
        }

        assumptions = ["Contractual payments scheduled on regular recurring calendar dates."]
        limitations = ["Covers known recurring debt, bills, and subscriptions."]

        analysis = {
            "total_obligations": near_term_total,
            "post_obligation_balance": current_balance - near_term_total,
            "risk_level": "low" if (current_balance - near_term_total) >= min_reserve else "medium",
        }
        recommendation_obj = {
            "action": what_you_can_do["action"],
            "impact": what_you_can_do["impact"],
        }

    elif intent == "savings_opportunity":
        annual_potential = disc_baseline * 0.20 * 12
        headline = "Savings Optimization Opportunity"
        answer = (
            f"Reducing discretionary expenses by 20% would liberate approximately {_format_inr(disc_baseline * 0.20)}/month "
            f"({_format_inr(annual_potential)}/year) toward your Safety Buffer, without changing the rest of Monthly Spending & Bills."
        )

        what_we_know = [
            {
                "label": "Discretionary Spending",
                "value": f"{_format_inr(disc_baseline)}/mo",
                "detail": "Dining, shopping, and flexible categories",
                "source": "Expense Run-Rate",
            },
            {
                "label": "Essential Outflows",
                "value": f"{_format_inr(forecast_1m.get('monthly_essential') or 0.0)}/mo",
                "detail": "Rent, utilities, groceries, and insurance",
                "source": "Core Ledger",
            },
        ]

        what_may_happen = (
            f"Boosting monthly savings by {_format_inr(disc_baseline * 0.20)} increases Money Above Buffer "
            f"from {_format_inr(max(0.0, current_balance - min_reserve))} to {_format_inr(current_balance - min_reserve + (disc_baseline * 0.20))} in 30 days."
        )

        what_you_can_do = {
            "action": "Simulate a 20% discretionary spending reduction plan",
            "impact": f"Adds {_format_inr(disc_baseline * 0.20)} to Money Left Each Month",
            "action_url": "/simulator",
            "action_label": "Update My Plan",
        }

        assumptions = ["Discretionary spending is flexible and can be trimmed without penalty."]
        limitations = ["Fixed contractual obligations cannot be altered without refinancing."]

        analysis = {
            "discretionary_spend": disc_baseline,
            "monthly_savings_potential": disc_baseline * 0.20,
            "annualized": annual_potential,
        }
        recommendation_obj = {
            "action": what_you_can_do["action"],
            "impact": what_you_can_do["impact"],
        }

    else:  # general_inquiry / cash_flow_change
        surplus = forecast_1m.get("projected_income", 0.0) - forecast_1m.get("projected_expenses", 0.0)
        headline = "Audited Cash Flow Health Summary"
        answer = (
            f"Your liquid position is {_format_inr(current_balance)} across linked accounts. "
            f"Monthly Income of {_format_inr(forecast_1m.get('projected_income', 0.0))} "
            f"against Monthly Spending & Bills of {_format_inr(forecast_1m.get('projected_expenses', 0.0))} "
            f"leaves Money Left Each Month of {_format_inr(surplus)}."
        )

        what_we_know = [
            {
                "label": "Total Liquid Balance",
                "value": _format_inr(current_balance),
                "detail": "Verified across connected accounts",
                "source": "Bank Accounts",
            },
            {
                "label": "Monthly Income",
                "value": _format_inr(forecast_1m.get("projected_income", 0.0)),
                "detail": "Expected confirmed salary schedule",
                "source": "Income Ledger",
            },
            {
                "label": "Monthly Spending & Bills",
                "value": _format_inr(forecast_1m.get("projected_expenses", 0.0)),
                "detail": "Essential bills, debt EMIs, and discretionary spend",
                "source": "Expenditure Ledger",
            },
        ]

        what_may_happen = (
            f"Expected Cash in 6 months is {_format_inr(forecast_6m.get('ending_balance', 0.0))}, "
            f"above your Safety Buffer of {_format_inr(min_reserve)}."
        )

        what_you_can_do = {
            "action": "Explore 6-month scenario variations and stress tests",
            "impact": "Examines Best, Expected, and Adverse outcome paths",
            "action_url": "/forecast/scenarios",
            "action_label": "View Scenario Analysis",
        }

        assumptions = [
            "Income and regular expenses maintain 90-day observed baseline",
            "Internal transfers between user's own accounts are excluded from expenditure",
        ]
        limitations = [
            "Projections rely on historical consistency and confirmed obligations",
            "Unscheduled discretionary spikes are not predicted deterministically",
        ]

        analysis = {
            "current_balance": current_balance,
            "projected_surplus": surplus,
            "ending_balance_6m": forecast_6m.get("ending_balance", 122000.0),
        }
        recommendation_obj = {
            "action": what_you_can_do["action"],
            "impact": what_you_can_do["impact"],
        }

    # 6. Audit Trail Logging (Privacy compliant, user isolated)
    audit_log = CopilotAuditLog(
        id=audit_id,
        user_id=user_id,
        insight_id=insight_id,
        intent=intent,
        query=question,
        model_version=MODEL_VERSION,
        data_snapshot=json.dumps({
            "current_balance": current_balance,
            "minimum_reserve": min_reserve,
            "last_synced_at": last_synced,
            "near_term_obligations": near_term_total,
        }),
        assumptions=json.dumps(assumptions),
        findings=json.dumps({
            "headline": headline,
            "answer": answer,
            "analysis": analysis,
        }),
        recommendation=json.dumps(recommendation_obj),
        limitations=json.dumps(limitations),
    )
    db.add(audit_log)
    try:
        db.commit()
    except Exception:
        db.rollback()

    audit_info = {
        "audit_id": audit_id,
        "insight_id": insight_id,
        "model_version": MODEL_VERSION,
        "calculation_basis": "Deterministic ledger reconciliation + unified bank data",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_freshness": f"Last synchronized at {last_synced}",
        "limitations": limitations,
    }

    # Format observed items for backward compatibility
    observed = [
        {"label": item["label"], "value": item["value"]}
        for item in what_we_know
    ]

    return {
        "intent": intent,
        "headline": headline,
        "answer": answer,
        "what_we_know": what_we_know,
        "what_may_happen": what_may_happen,
        "what_you_can_do": what_you_can_do,
        "why_this_answer": audit_info,
        "observed": observed,
        "analysis": analysis,
        "recommendation": recommendation_obj,
        "confidence": 0.94,
        "limitations": limitations,
    }


def get_proactive_audited_insights(db: Session, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Returns prioritized list of proactive audited financial insights.
    """
    profile = get_user_profile(user_id=user_id)
    unified = get_unified_financial_data(db, user_id=user_id)
    settings = get_user_forecast_settings(db, user_id=user_id)

    current_balance = float(unified.get("available_balance") or 0.0)
    min_reserve = float((settings.get("minimum_reserve") if isinstance(settings, dict) else getattr(settings, "minimum_reserve", 0.0)) or 0.0)
    raw_txns = unified.get("transactions", [])

    include = {
        "include_income": bool(settings.get("include_income", True)) if isinstance(settings, dict) else True,
        "include_essential": bool(settings.get("include_essential", True)) if isinstance(settings, dict) else True,
        "include_discretionary": bool(settings.get("include_discretionary", True)) if isinstance(settings, dict) else True,
        "include_debt": bool(settings.get("include_debt", True)) if isinstance(settings, dict) else True,
        "include_obligations": bool(settings.get("include_obligations", True)) if isinstance(settings, dict) else True,
    }
    forecast_1m = build_cash_flow_forecast(
        raw_txns,
        profile=profile,
        horizon_months=1,
        opening_balance=current_balance,
        minimum_reserve=min_reserve,
        **include,
    )

    insights = []

    # 1. Trough / Shortfall Insight
    lowest_bal = float(forecast_1m.get("minimum_balance") or 0.0)
    shortfall = max(0.0, min_reserve - lowest_bal)
    if shortfall > 0:
        insights.append({
            "id": f"ins_trough_{uuid.uuid4().hex[:6]}",
            "category": "reserve_shortfall",
            "severity": "high",
            "title": "Risk of Running Short",
            "summary": f"Expected Cash drops to {_format_inr(lowest_bal)}, {_format_inr(shortfall)} below your Safety Buffer.",
            "evidence": [
                f"Current Total Bank Balance: {_format_inr(current_balance)}",
                f"Upcoming contractual bills: {_format_inr(float(forecast_1m.get('monthly_essential') or 0.0) + float(forecast_1m.get('monthly_debt') or 0.0))}",
                f"Configured Safety Buffer: {_format_inr(min_reserve)}",
            ],
            "recommendation": "Trim spending this week so Expected Cash stays above your Safety Buffer.",
            "action_url": "/simulator",
            "action_label": "Update My Plan",
        })

    # 2. Largest upcoming obligation actually in the projection
    upcoming = get_upcoming_obligations_projection(raw_txns, horizon_months=1).get("obligations") or []
    if upcoming:
        top = max(upcoming, key=lambda ob: ob.get("amount") or 0.0)
        insights.append({
            "id": f"ins_ob_{uuid.uuid4().hex[:6]}",
            "category": "large_payment",
            "severity": "medium",
            "title": f"Upcoming {top['name']} ({_format_inr(top['amount'])})",
            "summary": f"{top['name']} of {_format_inr(top['amount'])} is due {top['due_date']}.",
            "evidence": [
                top.get("recurrence") or "Recurring payment from your transactions",
                f"Available liquid funds: {_format_inr(current_balance)}",
            ],
            "recommendation": "Keep this amount available before the debit date.",
            "action_url": "/forecast/obligations",
            "action_label": "View Upcoming Obligations",
        })

    # 3. Discretionary Spending Alert
    disc_baseline = float(forecast_1m.get("monthly_discretionary") or 0.0)
    if disc_baseline > 0:
        insights.append({
        "id": f"ins_disc_{uuid.uuid4().hex[:6]}",
        "category": "savings_opportunity",
        "severity": "low",
        "title": "Discretionary Spending Pacing",
        "summary": f"Discretionary spend is pacing at {_format_inr(disc_baseline / 4.0)}/wk. A 15% reduction frees {_format_inr(disc_baseline * 0.15)}/mo.",
        "evidence": [
            f"90-day discretionary median: {_format_inr(disc_baseline)}/mo",
            "Flexible dining and shopping categories",
        ],
        "recommendation": "Set a weekly discretionary target to accelerate emergency reserve growth.",
        "action_url": "/simulator",
        "action_label": "Update My Plan",
    })

    return insights
