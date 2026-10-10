"""
Pydantic schemas for Constrained Action Planning & Probabilistic Cash Flow Forecasting (FIN 02 Additions 1 & 2).
Provides typed data contracts for:
- 6-month calibrated probabilistic forecast bounds (P10, P50, P90)
- Benchmark evaluation metrics vs. Historical Average and Fixed Recurring baselines
- Action sequence simulation with Monte Carlo shortfall risk and Decision-Flip proof
- Dynamic replanning under financial shocks with prioritized constraint relaxations
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


# ============================================================================
# 1. FORECASTING SCHEMAS (FIN 02 Addition 2)
# ============================================================================

class ForecastPeriod(BaseModel):
    """Calibrated probabilistic forecast bounds for a single month."""
    period_id: int = Field(..., description="Chronological month index (1 to 6)")
    month_label: str = Field(..., description="Human-readable label, e.g. 'Month 1' or '2026-04'")
    
    # Income Quantiles
    income_p10: float = Field(..., description="10th percentile conservative income estimate")
    income_p50: float = Field(..., description="50th percentile median expected income")
    income_p90: float = Field(..., description="90th percentile optimistic income estimate")
    
    # Essential Outflow Quantiles (Rent, groceries, utilities, debt obligations)
    essential_p10: float = Field(..., description="10th percentile lower bound of essential spend")
    essential_p50: float = Field(..., description="50th percentile median expected essential spend")
    essential_p90: float = Field(..., description="90th percentile upper stress bound of essential spend")
    
    # Net Expected Discretionary Surplus / Buffer
    net_cash_p50: float = Field(..., description="Expected monthly cash delta: income_p50 - essential_p50")
    reserve_threshold: float = Field(default=25000.0, description="Declared minimum cash reserve requirement")


class ForecastResponse(BaseModel):
    """Complete 6-month probabilistic cash flow forecast response."""
    horizon_months: int = Field(default=6, description="Forecast horizon in months")
    uncertainty_method: str = Field(
        default="Conformal Quantile Autoregression (CQ-AR) with Split-Conformal Calibration",
        description="Explicit declared uncertainty methodology"
    )
    conformal_coverage_pct: float = Field(
        default=80.0,
        description="Declared empirical confidence coverage guarantee (>= 80%)"
    )
    periods: List[ForecastPeriod] = Field(..., description="6 monthly forecast periods")
    summary: Dict[str, Any] = Field(default_factory=dict, description="Aggregated horizon metrics")


# ============================================================================
# 2. BENCHMARK EVALUATION SCHEMAS (FIN 02 Addition 2)
# ============================================================================

class BenchmarkMetrics(BaseModel):
    """Statistical evaluation metrics computed on held-out test periods."""
    mae: float = Field(..., description="Mean Absolute Error of median (P50) predictions")
    rmse: float = Field(..., description="Root Mean Squared Error of median (P50) predictions")
    crps: float = Field(..., description="Continuous Ranked Probability Score across distribution")
    coverage_80_pct: float = Field(..., description="Empirical percentage of actuals falling within [P10, P90]")
    interval_width: float = Field(..., description="Average prediction interval width (P90 - P10)")


class BenchmarkComparisonResponse(BaseModel):
    """Comparison of CQ-AR model against mandatory baselines on held-out test data."""
    test_periods_count: int = Field(default=6, description="Number of held-out test periods evaluated")
    cq_ar_model: BenchmarkMetrics = Field(..., description="Proposed Conformal Quantile Autoregression performance")
    historical_average_baseline: BenchmarkMetrics = Field(..., description="Baseline 1: 6-month trailing moving average")
    recurring_payment_baseline: BenchmarkMetrics = Field(..., description="Baseline 2: Fixed recurring payments schedule")
    beats_all_baselines: bool = Field(default=True, description="Whether CQ-AR achieves lower error and valid coverage")
    evaluation_notes: List[str] = Field(default_factory=list, description="Methodological commentary")


# ============================================================================
# 3. ACTION PLANNING & DECISION-FLIP SCHEMAS (FIN 02 Addition 1)
# ============================================================================

class ActionSequence(BaseModel):
    """A multi-period financial strategy comparing spending, savings, and debt allocation."""
    name: str = Field(..., description="Sequence label, e.g. 'Sequence A' or 'Sequence B'")
    description: str = Field(..., description="Strategy description")
    discretionary_budget_monthly: float = Field(..., description="Allocated monthly discretionary spending")
    debt_payment_monthly: float = Field(..., description="Allocated monthly debt servicing payment")
    savings_monthly: float = Field(..., description="Allocated monthly emergency fund / savings contribution")
    ending_balance_expected: float = Field(..., description="Projected month 6 cash balance under median conditions")
    shortfall_risk_pct: float = Field(..., description="Monte Carlo probability of breaching minimum reserve R_min")
    is_reserve_safe: bool = Field(..., description="Whether shortfall risk is within acceptable risk tolerance (< 10%)")
    period_balances: List[float] = Field(..., description="Projected month-end cash balances across periods 1 to 6")


class SimulationResponse(BaseModel):
    """Comparison of Sequence A vs Sequence B with Decision-Flip proof."""
    horizon_months: int = Field(default=6, description="Planning horizon")
    declared_reserve_min: float = Field(default=25000.0, description="Minimum reserve constraint R_min")
    sequence_a: ActionSequence = Field(..., description="Aggressive / Status-Quo sequence")
    sequence_b: ActionSequence = Field(..., description="Balanced / Liquidity-Preserving sequence")
    preferred_sequence: str = Field(..., description="Mathematically recommended sequence ('Sequence B')")
    decision_flip_detected: bool = Field(
        default=True,
        description="True if accounting for downside risk flips preference from Sequence A to Sequence B"
    )
    decision_flip_explanation: str = Field(
        ...,
        description="Detailed explanation of how downside uncertainty flips the preferred strategy"
    )


# ============================================================================
# 4. DYNAMIC REPLANNING & CONFLICT RELAXATION SCHEMAS (FIN 02 Addition 1)
# ============================================================================

class ReplanRequest(BaseModel):
    """Simulate a financial shock requiring dynamic replanning."""
    shock_type: str = Field(
        default="income_cut",
        description="Type of shock: 'income_cut', 'medical_shock', or 'infeasible_target'"
    )
    magnitude: Optional[float] = Field(
        default=None,
        description="Optional custom magnitude (e.g. 0.25 for 25% cut, or 35000 for ₹35,000 emergency expense)"
    )


class RelaxationItem(BaseModel):
    """Explicit proposed relaxation when constraints conflict."""
    target: str = Field(..., description="Constraint relaxed, e.g. 'Savings Contribution' or 'Discretionary Budget'")
    original_value: float = Field(..., description="Original planned value per period")
    relaxed_value: float = Field(..., description="Proposed relaxed value per period")
    rationale: str = Field(..., description="Why this relaxation resolves the conflict")


class ReplanResponse(BaseModel):
    """Dynamic replanning output with conflict identification and proposed relaxations."""
    shock_applied: str = Field(..., description="Description of the financial shock evaluated")
    conflict_detected: bool = Field(..., description="Whether original constraints could all be satisfied")
    conflict_description: Optional[str] = Field(None, description="Explicit identification of the constraint conflict")
    proposed_relaxations: List[RelaxationItem] = Field(
        default_factory=list,
        description="Explicit proposed relaxations ordered by priority"
    )
    rebalanced_period_balances: List[float] = Field(
        ...,
        description="Projected cash balances across periods under the revised plan"
    )
    ending_cash_balance: float = Field(..., description="Projected cash balance at the end of the horizon")
    shortfall_risk_after_replan_pct: float = Field(..., description="Revised shortfall risk probability")
    status: str = Field(default="REBALANCED", description="Plan status: 'REBALANCED' or 'STRUCTURAL_DEFICIT'")


# ============================================================================
# 5. SPEND VELOCITY & MICRO-NUDGE SCHEMAS (FIN 02 Pillar 2)
# ============================================================================

class SpendVelocityResponse(BaseModel):
    """Real-time intra-month spend velocity metrics and behavioral micro-nudges."""
    current_day: int = Field(..., description="Current day of the billing cycle (1 to 30)")
    days_remaining: int = Field(..., description="Days remaining until the next payday")
    daily_velocity: float = Field(..., description="Discretionary spend burn rate per day in ₹")
    projected_month_end_spend: float = Field(..., description="Projected total discretionary spend by month-end")
    projected_ending_cash: float = Field(..., description="Projected cash balance at next payday")
    reserve_floor: float = Field(default=25000.0, description="Minimum reserve threshold R_min")
    reserve_cushion: float = Field(..., description="Projected cushion above reserve floor (+/-)")
    is_reserve_threatened: bool = Field(..., description="Whether projected ending cash drops below reserve floor")
    safe_daily_cap: float = Field(..., description="Recommended daily spending cap to protect reserve floor")
    severity: str = Field(..., description="'safe', 'warning', or 'critical'")
    micro_nudge: str = Field(..., description="Behavioral micro-nudge coaching text")


# ============================================================================
# 6. DEBT BREAKDOWN & AVALANCHE PAYOFF SCHEMAS
# ============================================================================

class LoanItemSchema(BaseModel):
    id: str = Field(..., description="Unique loan identifier")
    name: str = Field(..., description="Display name of credit line or loan")
    bank: str = Field(..., description="Bank identifier code (icici, axis, hdfc, etc.)")
    balance: float = Field(..., description="Current principal balance outstanding in INR")
    detail: str = Field(default="", description="Secondary detail or limit usage")
    schedule: str = Field(..., description="EMI tenure or payment due schedule")
    monthly_emi: float = Field(..., description="Monthly EMI or minimum due amount in INR")
    apr: str = Field(..., description="Formatted APR string, e.g. '38.4% APR (High)'")
    apr_rate: float = Field(..., description="Numeric annual percentage rate")
    is_high_apr: bool = Field(default=False, description="Flag indicating high interest debt > 20%")
    progress: float = Field(..., description="Repayment or utilization progress ratio (0.0 to 1.0)")
    progress_label: str = Field(..., description="Label for progress bar")


class AvalancheRecommendation(BaseModel):
    target_debt_id: str
    target_name: str
    payoff_amount: float
    annual_interest_saved: float
    recommendation_text: str


class DebtBreakdownResponse(BaseModel):
    total_outstanding_debt: float
    dti_ratio: float
    dti_status: str
    total_monthly_emis: float
    avg_blended_apr: float
    loans: List[LoanItemSchema]
    avalanche_recommendation: AvalancheRecommendation

