import { api, endpoints } from './api';

export type FinancialHealth = {
  income: number;
  spending: number;
  savings: number;
  savings_rate: number;
  fixed_expenses: number;
  variable_expenses: number;
  recurring_obligations: number;
  projected_month_end_balance: number;
  health_score: number;
  signals: Array<{
    type: string;
    description: string;
    severity?: string;
    category?: string;
    change_percent?: number;
  }>;
};

export type ApiTransaction = {
  id: string;
  account_id?: string | null;
  amount: number;
  type: 'debit' | 'credit' | string;
  category: string;
  merchant_name: string;
  description?: string | null;
  transaction_date: string;
  is_recurring: boolean;
  is_fixed: boolean;
  is_discretionary: boolean;
  source_type: string;
};

export type SpendingCategory = {
  name: string;
  amount: number;
  percentage: number;
};

export type ObligationItem = {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  due_day: number;
  category: string;
};

export function formatINR(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
}

export function formatSignedINR(amount: number, isIncome: boolean): string {
  return `${isIncome ? '+' : '-'}${formatINR(amount)}`;
}

export function paymentMethodLabel(source: string | undefined, category: string): string {
  if (category === 'Salary') return 'Bank';
  if (source === 'synthetic') return 'UPI';
  return 'UPI';
}

export async function fetchFinancialHealth(): Promise<FinancialHealth> {
  const { data } = await api.get<FinancialHealth>(endpoints.financialHealth.summary);
  return data;
}

export async function fetchTransactions(limit = 50): Promise<{
  items: ApiTransaction[];
  total: number;
}> {
  const { data } = await api.get<{ items: ApiTransaction[]; total: number }>(
    endpoints.transactions.list,
    { params: { limit, offset: 0 } },
  );
  return data;
}

export async function fetchSpendingBreakdown(): Promise<SpendingCategory[]> {
  const { data } = await api.get<{ categories: SpendingCategory[] }>(
    endpoints.financialHealth.spending,
  );
  return data.categories || [];
}

export async function fetchObligations(): Promise<{
  total_monthly_obligations: number;
  items: ObligationItem[];
}> {
  const { data } = await api.get<{
    total_monthly_obligations: number;
    items: ObligationItem[];
  }>(endpoints.financialHealth.obligations);
  return data;
}

export async function fetchCashFlow(months = 6): Promise<{
  monthly_summary: Array<{ month: string; inflow: number; outflow: number; net: number }>;
  projected_month_end: number;
  daily_burn_rate: number;
}> {
  const { data } = await api.get(endpoints.financialHealth.cashFlow, {
    params: { months },
  });
  return data;
}

export type DailyCashPoint = {
  day: number;
  date: string;
  label: string;
  balance: number;
  balance_low?: number;
  balance_high?: number;
  pct_x: number;
  is_forecast?: boolean;
  source?: string;
  event?: string;
  event_amount?: number;
  event_type?: 'income' | 'bill' | 'emi' | 'subscription' | string;
  event_category?: string;
};

export type DailyCashFlowResponse = {
  month: string;
  opening_balance: number;
  closing_balance: number;
  minimum_balance: number;
  minimum_reserve: number;
  source: string;
  forecast_source?: string | null;
  model_id?: string | null;
  limitations: string[];
  points: DailyCashPoint[];
  observed?: { points: DailyCashPoint[] };
  forecast?: { points: DailyCashPoint[]; source?: string; model_id?: string } | null;
};

export async function fetchDailyCashFlow(options?: {
  month?: string;
  includeForecastDays?: number;
}): Promise<DailyCashFlowResponse> {
  const { data } = await api.get<DailyCashFlowResponse>(endpoints.financialHealth.cashFlowDaily, {
    params: {
      month: options?.month,
      include_forecast_days: options?.includeForecastDays ?? 0,
    },
  });
  return data;
}

export type ForecastPeriod = {
  period_index: number;
  period_label: string;
  opening_balance: number;
  income: number;
  essential_expenses: number;
  mandatory_debt: number;
  additional_debt_repayment: number;
  discretionary_spending: number;
  savings_contribution: number;
  planned_savings: number;
  closing_balance: number;
  minimum_reserve: number;
  reserve_violated: boolean;
  reserve_headroom: number;
  balance_low: number;
  balance_high: number;
  debt_remaining: number;
};

export type ForecastRisk = {
  id: string;
  severity: string;
  title: string;
  what: string;
  when: string;
  factors: string[];
  impact: string;
  action: string;
};

export type ForecastInsight = {
  horizon_months: number;
  theme: string;
  headline: string;
  body: string;
  metrics_cited: string[];
};

export type CashFlowForecast = {
  forecast_updated_at: string;
  horizon_months: number;
  minimum_reserve: number;
  savings_target: number;
  savings_target_feasible: boolean;
  income_volatility: number;
  opening_balance: number;
  ending_balance: number;
  minimum_balance: number;
  projected_income: number;
  projected_expenses: number;
  monthly_income: number;
  monthly_essential: number;
  monthly_discretionary: number;
  monthly_debt: number;
  monthly_savings: number;
  income_after_mandatory: number;
  baseline_run_rate: Record<string, number>;
  periods: ForecastPeriod[];
  observed_months: Array<{
    month: string;
    inflow: number;
    outflow: number;
    net: number;
    is_forecast: boolean;
  }>;
  reserve_breach_rate: number;
  periods_below_reserve: number;
  shortfall_probability: number | null;
  expected_shortfall: number | null;
  shortfall_method: string | null;
  shortfall_note: string | null;
  cumulative_savings: number;
  debt_remaining: number;
  violations: Array<Record<string, unknown>>;
  risks: ForecastRisk[];
  insights: ForecastInsight[];
  source: string;
  model_id: string;
  is_projection: boolean;
  limitations: string[];
  data_quality: {
    transaction_count: number;
    sufficient_history: boolean;
    opening_below_reserve: boolean;
    zero_income?: boolean;
    missing_debt_terms?: boolean;
  };
};

export type ForecastSettings = {
  id?: string;
  user_id?: string | null;
  horizon_months: 1 | 3 | 6 | 12;
  minimum_reserve: number;
  include_income: boolean;
  include_essential: boolean;
  include_discretionary: boolean;
  include_debt: boolean;
  include_obligations: boolean;
  updated_at?: string | null;
};

export async function fetchForecastSettings(): Promise<ForecastSettings> {
  const { data } = await api.get<ForecastSettings>(endpoints.settings.forecast);
  return data;
}

export async function saveForecastSettings(
  settings: Partial<ForecastSettings>,
): Promise<ForecastSettings> {
  const { data } = await api.post<ForecastSettings>(endpoints.settings.forecast, settings);
  return data;
}

export type ScenarioDetail = {
  type: 'best' | 'expected' | 'worst';
  title: string;
  description: string;
  projected_outcome: string;
  ending_balance: number;
  lowest_balance: number;
  reserve_breached: boolean;
  assumptions_summary: string;
  difference_explanation: string;
  periods: ForecastPeriod[];
};

export type ForecastScenariosResponse = {
  horizon_months: number;
  minimum_reserve: number;
  scenarios: ScenarioDetail[];
  probability_of_running_out_of_cash: number;
  calculation_basis: string;
  limitations: string[];
};

export async function fetchForecastScenarios(
  horizonMonths: 1 | 3 | 6 | 12 = 6,
  minimumReserve?: number,
): Promise<ForecastScenariosResponse> {
  const { data } = await api.get<ForecastScenariosResponse>(
    endpoints.financialHealth.scenarios,
    {
      params: {
        horizon_months: horizonMonths,
        minimum_reserve: minimumReserve,
      },
    },
  );
  return data;
}

export type AffordabilityRequest = {
  purchase_amount: number;
  purchase_date: string;
  expense_type?: string;
  recurring_frequency?: string;
};

export type AffordabilityResponse = {
  purchase_amount: number;
  purchase_date: string;
  expense_type: string;
  current_balance: number;
  post_purchase_balance: number;
  minimum_reserve: number;
  upcoming_obligations_total: number;
  trough_before_payday: number;
  headroom_above_reserve: number;
  verdict: 'affordable' | 'caution' | 'shortfall';
  status_headline: string;
  finding_explanation: string;
  conflicting_obligations: Array<{ name: string; amount: number; due: string }>;
  alternatives: Array<{
    id: string;
    name: string;
    description: string;
    monthly_commitment?: number;
    recommended_date?: string;
  }>;
  limitations: string[];
};

export async function checkAffordability(
  request: AffordabilityRequest,
): Promise<AffordabilityResponse> {
  const { data } = await api.post<AffordabilityResponse>(
    endpoints.financialHealth.affordability,
    request,
  );
  return data;
}

export type UpcomingObligationItem = {
  id: string;
  name: string;
  due_date: string;
  due_date_iso?: string;
  amount: number;
  type: string;
  recurrence: string;
  status: string;
};

export async function fetchUpcomingObligations(
  horizonMonths: 6 | 12 = 6,
): Promise<{
  horizon_months: number;
  total_commitments: number;
  count: number;
  obligations: UpcomingObligationItem[];
}> {
  const { data } = await api.get(endpoints.financialHealth.obligations, {
    params: { horizon_months: horizonMonths },
  });
  return data;
}

export async function fetchCashFlowForecast(
  horizonMonths: 1 | 3 | 6 | 12 = 6,
  options?: {
    minimum_reserve?: number;
    include_income?: boolean;
    include_essential?: boolean;
    include_discretionary?: boolean;
    include_debt?: boolean;
    include_obligations?: boolean;
  },
): Promise<CashFlowForecast> {
  const { data } = await api.get<CashFlowForecast>(endpoints.financialHealth.cashFlowForecast, {
    params: {
      horizon_months: horizonMonths,
      minimum_reserve: options?.minimum_reserve,
      include_income: options?.include_income,
      include_essential: options?.include_essential,
      include_discretionary: options?.include_discretionary,
      include_debt: options?.include_debt,
      include_obligations: options?.include_obligations,
    },
  });
  return data;
}

export type WhatIfAssumptions = {
  horizon_months: 1 | 3 | 6;
  discretionary_reduction_pct: number;
  extra_debt_payment: number;
  savings_contribution_delta: number;
  income_change_pct: number;
  essential_expense_shock: number;
  minimum_reserve?: number | null;
  savings_target?: number | null;
  monthly_income?: number | null;
  monthly_spending?: number | null;
  monthly_debt?: number | null;
  monthly_savings?: number | null;
  one_time_expense?: number | null;
};

export type WhatIfPeriod = {
  period_index: number;
  period_label: string;
  opening_balance: number;
  income: number;
  essential_expenses: number;
  mandatory_debt: number;
  additional_debt_repayment: number;
  discretionary_spending: number;
  savings_contribution: number;
  planned_savings: number;
  closing_balance: number;
  minimum_reserve: number;
  reserve_violated: boolean;
  reserve_headroom: number;
  balance_low: number;
  balance_high: number;
  debt_remaining: number;
};

export type WhatIfViolation = {
  period_index: number;
  period_label: string;
  type: string;
  severity: string;
  required_cash: number;
  available_cash: number;
  deficit: number;
  reason: string;
  corrective_actions: string[];
};

export type WhatIfPlan = {
  id: string;
  name: string;
  summary: string;
  trade_offs: string[];
  periods: WhatIfPeriod[];
  ending_balance: number;
  minimum_balance: number;
  reserve_breach_rate: number;
  periods_below_reserve: number;
  cumulative_savings: number;
  cumulative_extra_debt: number;
  debt_remaining: number;
  violations: WhatIfViolation[];
  feasible: boolean;
  interest_saved_estimate: number | null;
};

export type WhatIfResponse = {
  forecast_updated_at: string;
  horizon_months: number;
  minimum_reserve: number;
  savings_target: number;
  savings_target_feasible: boolean;
  income_volatility: number;
  opening_balance: number;
  baseline_run_rate: Record<string, number>;
  assumptions: WhatIfAssumptions;
  baseline: WhatIfPlan;
  status_quo: WhatIfPlan;
  user_plan: WhatIfPlan;
  plans: WhatIfPlan[];
  recommended_plan_id: string;
  preference_reason: string;
  what_changed: string[];
  limitations: string[];
  data_quality: {
    transaction_count: number;
    sufficient_history: boolean;
    opening_below_reserve: boolean;
  };
};

export async function runWhatIfSimulation(
  assumptions: WhatIfAssumptions,
): Promise<WhatIfResponse> {
  const { data } = await api.post<WhatIfResponse>(endpoints.simulator.whatIf, {
    assumptions,
  });
  return data;
}

export type MoneyLeakItem = {
  title: string;
  amount: number;
  count: number;
  label: string;
};

export type MoneyLeaksResponse = {
  target_month: string;
  total_amount: number;
  total_count: number;
  leaks: MoneyLeakItem[];
  note: string;
};

export async function fetchMoneyLeaks(threshold: number = 250): Promise<MoneyLeaksResponse> {
  const { data } = await api.get<MoneyLeaksResponse>(endpoints.financialHealth.moneyLeaks, {
    params: { threshold },
  });
  return data;
}

export type ConformalForecastPeriod = {
  period_id: number;
  month_label: string;
  income_p10: number;
  income_p50: number;
  income_p90: number;
  essential_p10: number;
  essential_p50: number;
  essential_p90: number;
  net_cash_p50: number;
  reserve_threshold: number;
};

export type ConformalForecastResponse = {
  horizon_months: number;
  uncertainty_method: string;
  conformal_coverage_pct: number;
  periods: ConformalForecastPeriod[];
  summary: Record<string, any>;
};

export async function fetchConformalForecast(
  horizonMonths: number = 6,
  confidenceLevel: number = 0.80,
): Promise<ConformalForecastResponse> {
  const { data } = await api.get<ConformalForecastResponse>(endpoints.planning.forecast, {
    params: {
      horizon_months: horizonMonths,
      confidence_level: confidenceLevel,
    },
  });
  return data;
}

export function groupTransactionsByDate(items: ApiTransaction[]) {
  const groups = new Map<string, ApiTransaction[]>();
  const sorted = [...items].sort((a, b) =>
    b.transaction_date.localeCompare(a.transaction_date),
  );

  for (const item of sorted) {
    const key = item.transaction_date.slice(0, 10);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  return Array.from(groups.entries()).map(([date, rows]) => ({
    date,
    label: formatDateLabel(date),
    items: rows,
  }));
}

function formatDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export type CopilotEvidenceItem = {
  label: string;
  value: string;
  detail?: string;
  source?: string;
};

export type CopilotRecommendation = {
  action: string;
  impact: string;
  action_url?: string;
  action_label?: string;
};

export type CopilotAuditInfo = {
  audit_id: string;
  insight_id: string;
  model_version: string;
  calculation_basis: string;
  generated_at: string;
  data_freshness: string;
  limitations: string[];
};

export type CopilotQueryResponse = {
  intent: string;
  headline?: string;
  answer: string;
  what_we_know: CopilotEvidenceItem[];
  what_may_happen?: string;
  what_you_can_do?: CopilotRecommendation;
  why_this_answer?: CopilotAuditInfo;
  observed?: Array<{ label: string; value: string }>;
  analysis?: Record<string, any>;
  recommendation?: Record<string, any>;
  confidence?: number;
  limitations?: string[];
};

export type CopilotInsightItem = {
  id: string;
  category: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string[];
  recommendation: string;
  action_url?: string;
  action_label?: string;
};

export async function queryCopilot(
  question: string,
  context?: Record<string, any>,
): Promise<CopilotQueryResponse> {
  const { data } = await api.post<CopilotQueryResponse>(endpoints.copilot.query, {
    question,
    context,
  });
  return data;
}

export async function fetchCopilotInsights(): Promise<CopilotInsightItem[]> {
  const { data } = await api.get<CopilotInsightItem[]>(endpoints.copilot.insights);
  return data;
}

export async function fetchCopilotAudit(auditId: string): Promise<Record<string, any>> {
  const { data } = await api.get<Record<string, any>>(endpoints.copilot.audit(auditId));
  return data;
}

