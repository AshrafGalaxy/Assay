from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class WhatIfAssumptions(BaseModel):
    horizon_months: int = Field(6, description="1, 3, or 6")
    discretionary_reduction_pct: float = 15.0
    extra_debt_payment: float = 0.0
    savings_contribution_delta: float = 0.0
    income_change_pct: float = 0.0
    essential_expense_shock: float = 0.0
    minimum_reserve: Optional[float] = None
    savings_target: Optional[float] = None


class WhatIfRequest(BaseModel):
    assumptions: WhatIfAssumptions = Field(default_factory=WhatIfAssumptions)


class WhatIfPeriod(BaseModel):
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


class WhatIfViolation(BaseModel):
    period_index: int
    period_label: str
    type: str
    severity: str
    required_cash: float
    available_cash: float
    deficit: float
    reason: str
    corrective_actions: List[str] = []


class WhatIfPlan(BaseModel):
    id: str
    name: str
    summary: str
    trade_offs: List[str] = []
    periods: List[WhatIfPeriod]
    ending_balance: float
    minimum_balance: float
    reserve_breach_rate: float
    periods_below_reserve: int
    cumulative_savings: float
    cumulative_extra_debt: float
    debt_remaining: float
    violations: List[WhatIfViolation] = []
    feasible: bool
    interest_saved_estimate: Optional[float] = None


class WhatIfResponse(BaseModel):
    forecast_updated_at: str
    horizon_months: int
    minimum_reserve: float
    savings_target: float
    savings_target_feasible: bool
    income_volatility: float
    opening_balance: float
    baseline_run_rate: Dict[str, Any]
    assumptions: Dict[str, Any]
    baseline: WhatIfPlan
    plans: List[WhatIfPlan]
    recommended_plan_id: str
    preference_reason: str
    what_changed: List[str]
    limitations: List[str]
    data_quality: Dict[str, Any]
