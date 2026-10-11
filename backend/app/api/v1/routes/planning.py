"""
Planning & Forecasting API Router (FIN 02 Additions 1 & 2).
Exposes endpoints for:
- CQ-AR 6-month calibrated probabilistic cash flow forecast envelopes
- Statistical benchmark evaluation suite vs. mandatory baselines
- Constrained multi-period action planning & Decision-Flip simulation
- Dynamic replanning under financial shocks with prioritized relaxation
- Intra-month spend velocity and behavioral micro-nudges
"""

from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.planning import (
    ForecastPeriod,
    ForecastResponse,
    BenchmarkComparisonResponse,
    SimulationResponse,
    ReplanRequest,
    ReplanResponse,
    SpendVelocityResponse,
    DebtBreakdownResponse,
    LoanItemSchema,
    AvalancheRecommendation,
)
from app.services.forecasting.conformal_engine import ConformalQuantileEngine
from app.services.forecasting.evaluator import ForecastEvaluator
from app.services.planning.action_planner import ActionPlanner
from app.services.planning.replanner import DynamicReplanner
from app.services.planning.velocity_engine import SpendVelocityEngine
from app.services.financial_intelligence.unified_data import get_unified_financial_data
from app.services.financial_intelligence.ledger_metrics import (
    average_monthly_debt,
    average_monthly_discretionary,
    average_monthly_income,
    average_monthly_savings,
    build_period_ledgers,
    month_to_date_snapshot,
    monthly_aggregates,
    recurring_debt_payments,
    seasonal_projection,
    split_chronological,
)

router = APIRouter(prefix="/planning", tags=["planning"])


def _ledger_history(db: Session, user_id: str | None = None):
    """Monthly history, reserve and current balance derived entirely from transactions."""
    unified = get_unified_financial_data(db, user_id=user_id)
    transactions = unified["transactions"]
    opening = float(unified["profile"].get("starting_balance") or 0.0)
    periods = build_period_ledgers(transactions, opening)
    reserve = float(unified["settings"].get("minimum_reserve") or 0.0)
    return unified, transactions, periods, reserve


@router.get("/forecast", response_model=ForecastResponse)
def get_probabilistic_forecast(
    horizon_months: int = Query(default=6, ge=1, le=12, description="Forecast horizon in months"),
    confidence_level: float = Query(default=0.80, ge=0.50, le=0.99, description="Conformal confidence coverage"),
    db: Session = Depends(get_db),
):
    """
    Returns 6-month calibrated probabilistic cash flow forecast bounds (P10, P50, P90)
    using Conformal Quantile Autoregression (CQ-AR) with Split-Conformal Calibration.
    """
    # 1. Monthly history derived from the transaction ledger
    _unified, _txs, history, reserve = _ledger_history(db)
    train_s, val_s, test_s = split_chronological(history)
    if len(train_s) < 4 or not val_s:
        return ForecastResponse(
            horizon_months=horizon_months,
            periods=[],
            summary={"declared_reserve_min": reserve, "note": "Not enough transaction history to fit a forecast."},
        )

    # 2. Train and calibrate Conformal Quantile Engine for Income
    train_inc = [p.total_income for p in train_s]
    val_inc = [p.total_income for p in val_s]

    inc_engine = ConformalQuantileEngine(target_coverage=confidence_level)
    inc_engine.fit(train_inc)
    inc_engine.calibrate(calibration_preceding=train_inc, calibration_actuals=val_inc)
    inc_preds = inc_engine.predict_horizon(train_inc + val_inc, horizon=horizon_months)

    # 3. Train and calibrate Conformal Quantile Engine for Essential Outflows
    train_ess = [p.total_essential for p in train_s]
    val_ess = [p.total_essential for p in val_s]

    ess_engine = ConformalQuantileEngine(target_coverage=confidence_level)
    ess_engine.fit(train_ess)
    ess_engine.calibrate(calibration_preceding=train_ess, calibration_actuals=val_ess)
    ess_preds = ess_engine.predict_horizon(train_ess + val_ess, horizon=horizon_months)

    # 4. Construct calibrated monthly ForecastPeriod models
    periods: List[ForecastPeriod] = []
    for h in range(horizon_months):
        i_pred = inc_preds[h]
        e_pred = ess_preds[h]

        net_p50 = round(i_pred["p50"] - e_pred["p50"], 2)
        periods.append(
            ForecastPeriod(
                period_id=h + 1,
                month_label=f"Month {h + 1}",
                income_p10=i_pred["p10"],
                income_p50=i_pred["p50"],
                income_p90=i_pred["p90"],
                essential_p10=e_pred["p10"],
                essential_p50=e_pred["p50"],
                essential_p90=e_pred["p90"],
                net_cash_p50=net_p50,
                reserve_threshold=reserve,
            )
        )

    avg_surplus = round(sum(p.net_cash_p50 for p in periods) / len(periods), 2)

    return ForecastResponse(
        horizon_months=horizon_months,
        uncertainty_method="Conformal Quantile Autoregression (CQ-AR) with Split-Conformal Calibration",
        conformal_coverage_pct=round(confidence_level * 100, 1),
        periods=periods,
        summary={
            "declared_reserve_min": reserve,
            "average_net_surplus_p50": avg_surplus,
            "guaranteed_coverage": f">={round(confidence_level * 100)}%",
        },
    )


@router.get("/benchmark", response_model=BenchmarkComparisonResponse)
def get_benchmark_comparison(db: Session = Depends(get_db)):
    """
    Returns statistical evaluation metrics (MAE, RMSE, CRPS, 80% Coverage %, Interval Width)
    benchmarking the proposed CQ-AR model against Historical Moving Average and Fixed Recurring baselines
    on held-out test data.
    """
    _unified, _txs, history, _reserve = _ledger_history(db)
    train_s, val_s, test_s = split_chronological(history)
    if not test_s:
        test_s = val_s or train_s

    train_inc = [p.total_income for p in train_s]
    val_inc = [p.total_income for p in val_s]
    test_inc = [p.total_income for p in test_s]

    engine = ConformalQuantileEngine(target_coverage=0.80)
    engine.fit(train_inc)
    engine.calibrate(calibration_preceding=train_inc, calibration_actuals=val_inc)

    return ForecastEvaluator.run_benchmark(
        history_before_test=train_inc + val_inc,
        test_actuals=test_inc,
        cq_engine=engine,
    )


@router.post("/simulate-actions", response_model=SimulationResponse)
def simulate_action_sequences(db: Session = Depends(get_db)):
    """
    Compares Sequence A (Aggressive Debt Prepayment) vs Sequence B (Balanced Liquidity Shield)
    across a 6-month horizon under a declared minimum cash reserve constraint (R_min = ₹25,000).
    Demonstrates the Decision-Flip Theorem under cash flow uncertainty.
    """
    unified, transactions, periods, reserve = _ledger_history(db)
    horizon = min(6, len(periods)) or 1
    planner = ActionPlanner(declared_reserve_min=reserve, horizon_months=horizon)

    # Project the next horizon months from the observed seasonal pattern.
    incomes = seasonal_projection([p.total_income for p in periods], horizon)
    essentials = seasonal_projection([p.total_essential for p in periods], horizon)

    return planner.compare_and_prove_decision_flip(
        starting_cash=unified["available_balance"],
        incomes=incomes,
        essential_expenses=essentials,
        baseline_discretionary=average_monthly_discretionary(transactions),
        baseline_debt=average_monthly_debt(transactions),
        baseline_savings=average_monthly_savings(transactions),
    )


@router.post("/replan", response_model=ReplanResponse)
def dynamic_replan_shock(request: ReplanRequest, db: Session = Depends(get_db)):
    """
    Evaluates sudden unexpected financial shocks (e.g. -25% salary cut, ₹35,000 emergency medical expense)
    and executes prioritized 3-tier constraint relaxation to maintain cash solvency.
    """
    unified, transactions, periods, reserve = _ledger_history(db)
    horizon = min(6, len(periods)) or 1
    replanner = DynamicReplanner(declared_reserve_min=reserve, horizon_months=horizon)

    return replanner.evaluate_and_replan(
        starting_cash=unified["available_balance"],
        baseline_incomes=seasonal_projection([p.total_income for p in periods], horizon),
        baseline_essential=seasonal_projection([p.total_essential for p in periods], horizon),
        baseline_discretionary=average_monthly_discretionary(transactions),
        baseline_savings_goal=average_monthly_savings(transactions),
        shock_request=request,
    )


@router.get("/velocity", response_model=SpendVelocityResponse)
def get_spend_velocity(
    current_day: Optional[int] = Query(default=None, ge=1, le=31, description="Day of month (default: latest ledger day)"),
    db: Session = Depends(get_db),
):
    """
    Analyzes intra-month daily spending burn velocity and returns proactive behavioral micro-nudges.
    All inputs are derived from the transaction ledger.
    """
    unified, transactions, _periods, reserve = _ledger_history(db)
    snapshot = month_to_date_snapshot(transactions)
    aggs = monthly_aggregates(transactions)
    # Fixed bills still ahead this month: a typical month's non-negotiable outflows
    # minus what has already been paid in the current month.
    typical_fixed = (sum(a.non_negotiable for a in aggs) / len(aggs)) if aggs else 0.0
    upcoming_fixed = max(0.0, typical_fixed - snapshot["fixed_paid"])

    velocity_engine = SpendVelocityEngine(reserve_floor=reserve)
    metrics = velocity_engine.analyze_velocity(
        current_day=current_day or snapshot["day"] or 1,
        days_in_month=snapshot["days_in_month"],
        discretionary_spent_so_far=snapshot["discretionary_spent"],
        current_liquid_balance=unified["available_balance"],
        upcoming_fixed_bills=round(upcoming_fixed, 2),
        monthly_discretionary_budget=average_monthly_discretionary(transactions),
    )
    return SpendVelocityResponse(**metrics)


@router.get("/debt-breakdown", response_model=DebtBreakdownResponse)
def get_debt_breakdown(
    db: Session = Depends(get_db),
):
    """
    Debt breakdown derived from recurring debt/EMI payments in the transaction ledger.

    Outstanding principal and APR are not present in transaction history, so this
    reports what is observable: the monthly repayment, how long it has been paid,
    and the total repaid. DTI uses observed monthly income.
    """
    _unified, transactions, _periods, _reserve = _ledger_history(db)
    streams = recurring_debt_payments(transactions)

    loans: List[LoanItemSchema] = []
    for index, stream in enumerate(streams):
        loans.append(
            LoanItemSchema(
                id=f"debt_{index}",
                name=stream["name"],
                bank="ledger",
                balance=stream["total_paid"],
                detail=f"Repaid over {stream['months_paid']} months (outstanding principal is not in the transaction history)",
                schedule=f"₹{int(stream['monthly_amount']):,}/mo observed",
                monthly_emi=stream["monthly_amount"],
                apr="APR not in transaction history",
                apr_rate=0.0,
                is_high_apr=False,
                progress=0.0,
                progress_label=f"{stream['months_paid']} months paid",
            )
        )

    total_repaid = sum(l.balance for l in loans)
    total_emis = sum(l.monthly_emi for l in loans)

    monthly_income = average_monthly_income(transactions)
    dti_val = round((total_emis / monthly_income) * 100, 1) if monthly_income > 0 else 0.0
    dti_label = "Healthy" if dti_val < 36.0 else ("Moderate" if dti_val < 43.0 else "High Risk")

    # Without interest rates an avalanche ordering cannot be computed honestly.
    avalanche = None

    return DebtBreakdownResponse(
        total_outstanding_debt=total_repaid,
        dti_ratio=dti_val,
        dti_status=dti_label,
        total_monthly_emis=total_emis,
        avg_blended_apr=0.0,
        loans=loans,
        avalanche_recommendation=avalanche,
    )

