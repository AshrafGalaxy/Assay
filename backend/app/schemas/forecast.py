from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ForecastPeriod(BaseModel):
    period_index: int
    period_label: str
    opening_balance: float
    income: float
    essential_expenses: float
    mandatory_debt: float
    additional_debt_repayment: float
    discretionary_spending: float
    savings_contribution: float
    planned_savings: float
    closing_balance: float
    minimum_reserve: float
    reserve_violated: bool
    reserve_headroom: float
    balance_low: float
    balance_high: float
    debt_remaining: float


class ForecastRisk(BaseModel):
    id: str
    severity: str
    title: str
    what: str
    when: str
    factors: List[str] = []
    impact: str
    action: str


class ForecastInsight(BaseModel):
    horizon_months: int
    theme: str
    headline: str
    body: str
    metrics_cited: List[str] = []


class CashFlowForecastOut(BaseModel):
    forecast_updated_at: str
    horizon_months: int
    minimum_reserve: float
    savings_target: float
    savings_target_feasible: bool
    income_volatility: float
    opening_balance: float
    ending_balance: float
    minimum_balance: float
    projected_income: float
    projected_expenses: float
    monthly_income: float
    monthly_essential: float
    monthly_discretionary: float
    monthly_debt: float
    monthly_savings: float
    income_after_mandatory: float
    baseline_run_rate: Dict[str, Any]
    periods: List[ForecastPeriod]
    observed_months: List[Dict[str, Any]] = Field(default_factory=list)
    reserve_breach_rate: float
    periods_below_reserve: int
    shortfall_probability: Optional[float] = None
    expected_shortfall: Optional[float] = None
    shortfall_method: Optional[str] = None
    shortfall_note: Optional[str] = None
    cumulative_savings: float
    debt_remaining: float
    violations: List[Dict[str, Any]] = Field(default_factory=list)
    risks: List[ForecastRisk] = Field(default_factory=list)
    insights: List[ForecastInsight] = Field(default_factory=list)
    source: str
    model_id: str
    is_projection: bool = True
    limitations: List[str] = Field(default_factory=list)
    data_quality: Dict[str, Any] = Field(default_factory=dict)


class ForecastSettingsIn(BaseModel):
    horizon_months: int = Field(default=6, description="1, 3, 6, or 12")
    minimum_reserve: float = Field(default=15000.0, ge=0)
    include_income: bool = True
    include_essential: bool = True
    include_discretionary: bool = True
    include_debt: bool = True
    include_obligations: bool = True


class ForecastSettingsOut(BaseModel):
    id: Optional[str] = None
    user_id: Optional[str] = None
    horizon_months: int = 6
    minimum_reserve: float = 15000.0
    include_income: bool = True
    include_essential: bool = True
    include_discretionary: bool = True
    include_debt: bool = True
    include_obligations: bool = True
    updated_at: Optional[str] = None


class ScenarioDetail(BaseModel):
    type: str  # "best" | "expected" | "worst"
    title: str
    description: str
    projected_outcome: str
    ending_balance: float
    lowest_balance: float
    reserve_breached: bool
    assumptions_summary: str
    difference_explanation: str
    periods: List[Dict[str, Any]] = Field(default_factory=list)


class ForecastScenariosResponse(BaseModel):
    horizon_months: int
    minimum_reserve: float
    scenarios: List[ScenarioDetail]
    probability_of_running_out_of_cash: float
    calculation_basis: str
    limitations: List[str] = Field(default_factory=list)


class AffordabilityRequest(BaseModel):
    purchase_amount: float = Field(..., gt=0, description="Cost of purchase in INR")
    purchase_date: str = Field(..., description="Target purchase date (YYYY-MM-DD or descriptive)")
    expense_type: str = Field(default="onetime", description="'onetime' or 'recurring'")
    recurring_frequency: Optional[str] = Field(default="monthly", description="If recurring: 'monthly' | 'yearly'")


class AffordabilityResponse(BaseModel):
    purchase_amount: float
    purchase_date: str
    expense_type: str
    current_balance: float
    post_purchase_balance: float
    minimum_reserve: float
    upcoming_obligations_total: float
    trough_before_payday: float
    headroom_above_reserve: float
    verdict: str  # "affordable" | "caution" | "shortfall"
    status_headline: str
    finding_explanation: str
    conflicting_obligations: List[Dict[str, Any]] = Field(default_factory=list)
    alternatives: List[Dict[str, Any]] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)


class UpcomingObligationsResponse(BaseModel):
    horizon_months: int
    total_commitments: float
    count: int
    obligations: List[Dict[str, Any]] = Field(default_factory=list)

