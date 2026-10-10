from typing import List, Optional, Any, Dict
from pydantic import BaseModel


class Signal(BaseModel):
    type: str
    category: Optional[str] = None
    change_percent: Optional[float] = None
    description: Optional[str] = None
    severity: str = "info"  # "info" | "warning" | "alert"


class FinancialHealthOut(BaseModel):
    income: float
    spending: float
    savings: float
    savings_rate: float
    fixed_expenses: float
    variable_expenses: float
    recurring_obligations: float
    projected_month_end_balance: float
    health_score: int = 78
    signals: List[Signal] = []


class CopilotQueryRequest(BaseModel):
    question: str
    context: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None


class CopilotQueryResponse(BaseModel):
    intent: str
    headline: Optional[str] = None
    answer: str
    what_we_know: List[Dict[str, Any]] = []
    what_may_happen: Optional[str] = None
    what_you_can_do: Optional[Dict[str, Any]] = None
    why_this_answer: Optional[Dict[str, Any]] = None
    observed: List[Any] = []
    analysis: Dict[str, Any] = {}
    recommendation: Optional[Dict[str, Any]] = None
    confidence: float = 0.94
    limitations: List[str] = []
    audit_passed: Optional[bool] = True
    provider: Optional[str] = None


class CopilotInsightItem(BaseModel):
    id: str
    category: str
    severity: str
    title: str
    summary: str
    evidence: List[str] = []
    recommendation: str
    action_url: Optional[str] = None
    action_label: Optional[str] = None



class RecommendationAssumption(BaseModel):
    category: str
    monthly_reduction: float


class RecommendationSimulateRequest(BaseModel):
    assumption: RecommendationAssumption


class RecommendationSimulateResponse(BaseModel):
    baseline_monthly_buffer: float
    projected_monthly_buffer: float
    monthly_impact: float
    annualized_impact: float
    confidence: float
    assumption: str


class RecommendationOut(BaseModel):
    id: str
    title: str
    category: str
    potential_monthly_savings: float
    impact_description: str
    action_type: str
