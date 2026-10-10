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

export type WhatIfAssumptions = {
  horizon_months: 1 | 3 | 6;
  discretionary_reduction_pct: number;
  extra_debt_payment: number;
  savings_contribution_delta: number;
  income_change_pct: number;
  essential_expense_shock: number;
  minimum_reserve?: number | null;
  savings_target?: number | null;
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
