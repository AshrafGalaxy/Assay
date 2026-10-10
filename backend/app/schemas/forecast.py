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
