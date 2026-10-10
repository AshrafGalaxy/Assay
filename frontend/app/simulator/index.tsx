import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { API_BASE_URL } from '../../services/api';
import {
  WhatIfAssumptions,
  WhatIfPeriod,
  WhatIfPlan,
  WhatIfResponse,
  formatINR,
  runWhatIfSimulation,
} from '../../services/finance';
import {
  ChevronLeft,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Shield,
  Landmark,
  Info,
} from 'lucide-react-native';

const HORIZONS = [1, 3, 6] as const;
const CHART_COLORS = {
  baseline: '#94A3B8',
  plan_a: '#16A34A',
  plan_b: '#D97706',
  reserve: '#DC2626',
};

function parseHorizon(value?: string): 1 | 3 | 6 {
  const n = Number(value);
  if (n === 1 || n === 3 || n === 6) return n;
  return 6;
}

export default function WhatIfSimulatorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ horizon?: string }>();

  const defaults: WhatIfAssumptions = {
    horizon_months: parseHorizon(params.horizon),
    discretionary_reduction_pct: 20,
    extra_debt_payment: 2000,
    savings_contribution_delta: 0,
    income_change_pct: 0,
    essential_expense_shock: 0,
    minimum_reserve: null,
    savings_target: null,
  };

  const [draft, setDraft] = useState<WhatIfAssumptions>(defaults);
  const [applied, setApplied] = useState<WhatIfAssumptions>(defaults);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const recalculate = useCallback(async (assumptions: WhatIfAssumptions) => {
    setLoading(true);
    setError(null);
    try {
      const data = await runWhatIfSimulation(assumptions);
      setResult(data);
      setApplied(assumptions);
      setStale(false);
      setSelectedPeriod(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Simulation failed';
      setError(`${message} (API: ${API_BASE_URL})`);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void recalculate(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markStale = (patch: Partial<WhatIfAssumptions>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStale(true);
  };

  const planA = result?.plans.find((p) => p.id === 'plan_a') || null;
  const planB = result?.plans.find((p) => p.id === 'plan_b') || null;
  const recommendedId = result?.recommended_plan_id;

  const selectedBreakdown = useMemo(() => {
    if (!planA || !planB || !result) return null;
    const a = planA.periods.find((p) => p.period_index === selectedPeriod);
    const b = planB.periods.find((p) => p.period_index === selectedPeriod);
    const base = result.baseline.periods.find((p) => p.period_index === selectedPeriod);
    return { a, b, base };
  }, [planA, planB, result, selectedPeriod]);

  const allViolations = useMemo(() => {
    if (!result) return [];
    return [...result.baseline.violations, ...result.plans.flatMap((p) => p.violations)];
  }, [result]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ChevronLeft color={COLORS.text} size={22} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Typography variant="h2" style={styles.title}>What-If Simulator</Typography>
          <Typography variant="caption" color={COLORS.textSecondary}>
            Explore your options before making a financial decision.
          </Typography>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            setDraft(defaults);
            void recalculate(defaults);
          }}
          activeOpacity={0.7}
        >
          <RotateCcw color={COLORS.text} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.metaRow}>
          <TouchableOpacity onPress={() => router.push('/cashflow-detail')} activeOpacity={0.75}>
            <Typography variant="caption" color={COLORS.info}>← Cash Flow Forecast</Typography>
          </TouchableOpacity>
          <Typography variant="caption" color={COLORS.textSecondary}>
            Updated {result?.forecast_updated_at || '—'}
          </Typography>
        </View>

        <View style={styles.horizonRow}>
          {HORIZONS.map((h) => {
            const active = draft.horizon_months === h;
            return (
              <TouchableOpacity
                key={h}
                style={[styles.horizonPill, active && styles.horizonPillActive]}
                onPress={() => markStale({ horizon_months: h })}
              >
                <Typography variant="caption" color={active ? COLORS.white : COLORS.text}>
                  {h} mo
                </Typography>
              </TouchableOpacity>
            );
          })}
          <View style={styles.reserveChip}>
            <Typography variant="caption" color={COLORS.textSecondary}>
              Reserve {result ? formatINR(result.minimum_reserve) : '—'}
            </Typography>
          </View>
        </View>

        {stale && (
          <View style={styles.staleBanner}>
            <Info size={14} color={COLORS.warning} />
            <Typography variant="caption" color={COLORS.warning} style={{ flex: 1 }}>
              Assumptions changed. Recalculate to refresh plans.
            </Typography>
          </View>
        )}

        <Section title="Scenario controls">
          <Lever
            label="Discretionary reduction"
            value={`${draft.discretionary_reduction_pct.toFixed(0)}%`}
            min={0}
            max={60}
            step={1}
            sliderValue={draft.discretionary_reduction_pct}
            onChange={(v) => markStale({ discretionary_reduction_pct: v })}
          />
          <Lever
            label="Extra debt repayment / mo"
            value={formatINR(draft.extra_debt_payment)}
            min={0}
            max={20000}
            step={500}
            sliderValue={draft.extra_debt_payment}
            onChange={(v) => markStale({ extra_debt_payment: v })}
          />
          <Lever
            label="Savings contribution delta / mo"
            value={`${draft.savings_contribution_delta >= 0 ? '+' : ''}${formatINR(draft.savings_contribution_delta)}`}
            min={-10000}
            max={15000}
            step={500}
            sliderValue={draft.savings_contribution_delta}
            onChange={(v) => markStale({ savings_contribution_delta: v })}
          />
          <Lever
            label="Income change"
            value={`${draft.income_change_pct >= 0 ? '+' : ''}${draft.income_change_pct.toFixed(0)}%`}
            min={-40}
            max={20}
            step={1}
            sliderValue={draft.income_change_pct}
            onChange={(v) => markStale({ income_change_pct: v })}
          />
          <Lever
            label="One-time essential shock"
            value={formatINR(draft.essential_expense_shock)}
            min={0}
            max={100000}
            step={1000}
            sliderValue={draft.essential_expense_shock}
            onChange={(v) => markStale({ essential_expense_shock: v })}
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setDraft(applied);
                setStale(false);
              }}
            >
              <Typography variant="bodyBold">Reset draft</Typography>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void recalculate(draft)}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <>
                  <RefreshCw size={16} color={COLORS.primary} />
                  <Typography variant="bodyBold" color={COLORS.primary}>Replan</Typography>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Section>

        {error && (
          <View style={styles.errorCard}>
            <AlertTriangle size={16} color={COLORS.error} />
            <Typography variant="caption" color={COLORS.error} style={{ flex: 1 }}>
              {error}
            </Typography>
          </View>
        )}

        {result && (
          <>
            <Section title="Action plan comparison">
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.preference}>
                {result.preference_reason}
              </Typography>
              <View style={styles.planStack}>
                {result.baseline && (
                  <PlanCard plan={result.baseline} recommended={false} muted />
                )}
                {planA && (
                  <PlanCard plan={planA} recommended={recommendedId === 'plan_a'} />
                )}
                {planB && (
                  <PlanCard plan={planB} recommended={recommendedId === 'plan_b'} />
                )}
              </View>
              {!result.savings_target_feasible && (
                <View style={styles.warningCard}>
                  <AlertTriangle size={16} color={COLORS.warning} />
                  <Typography variant="caption" color={COLORS.warning} style={{ flex: 1 }}>
                    Savings target {formatINR(result.savings_target)} is infeasible under reserve + mandatory payment constraints.
                  </Typography>
                </View>
              )}
            </Section>

            <Section title="Projected cash balance">
              <BalanceChart
                baseline={result.baseline}
                planA={planA}
                planB={planB}
                reserve={result.minimum_reserve}
                selectedPeriod={selectedPeriod}
                onSelectPeriod={setSelectedPeriod}
              />
              <Typography variant="caption" color={COLORS.textSecondary} style={{ marginTop: 8 }}>
                Bands show a simple income-volatility envelope from the user profile — not a calibrated prediction interval.
              </Typography>
            </Section>

            {selectedBreakdown?.a && selectedBreakdown.b && (
              <Section title={`Period ${selectedPeriod} breakdown`}>
                <PeriodDetail label="Plan A" period={selectedBreakdown.a} accent={CHART_COLORS.plan_a} />
                <PeriodDetail label="Plan B" period={selectedBreakdown.b} accent={CHART_COLORS.plan_b} />
              </Section>
            )}

            <Section title="Period comparison">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.tableHeader}>
                    {['Period', 'Plan A', 'Plan B', 'Debt left', 'Reserve'].map((h) => (
                      <Typography key={h} variant="caption" color={COLORS.textSecondary} style={styles.tableCell}>
                        {h}
                      </Typography>
                    ))}
                  </View>
                  {(planA?.periods || []).map((period, index) => {
                    const b = planB?.periods[index];
                    return (
                      <TouchableOpacity
                        key={period.period_label}
                        style={[styles.tableRow, selectedPeriod === period.period_index && styles.tableRowActive]}
                        onPress={() => setSelectedPeriod(period.period_index)}
                      >
                        <Typography variant="caption" style={styles.tableCell}>{period.period_label}</Typography>
                        <Typography variant="caption" style={styles.tableCell}>{formatINR(period.closing_balance)}</Typography>
                        <Typography variant="caption" style={styles.tableCell}>{formatINR(b?.closing_balance || 0)}</Typography>
                        <Typography variant="caption" style={styles.tableCell}>{formatINR(b?.debt_remaining || period.debt_remaining)}</Typography>
                        <Typography
                          variant="caption"
                          color={period.reserve_violated || b?.reserve_violated ? COLORS.error : COLORS.success}
                          style={styles.tableCell}
                        >
                          {period.reserve_violated || b?.reserve_violated ? 'Breach' : 'OK'}
                        </Typography>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </Section>

            <Section title="Risk & trade-offs">
              <RiskRow
                icon={<Shield size={16} color={COLORS.success} />}
                title="Plan A reserve-breach share"
                value={`${((planA?.reserve_breach_rate || 0) * 100).toFixed(1)}% of periods`}
              />
              <RiskRow
                icon={<Landmark size={16} color={COLORS.warning} />}
                title="Plan B reserve-breach share"
                value={`${((planB?.reserve_breach_rate || 0) * 100).toFixed(1)}% of periods`}
              />
              <RiskRow
                icon={<TrendingDown size={16} color={COLORS.primary} />}
                title="Lowest projected balances"
                value={`A ${formatINR(planA?.minimum_balance || 0)} · B ${formatINR(planB?.minimum_balance || 0)}`}
              />
              <RiskRow
                icon={<CheckCircle2 size={16} color={COLORS.info} />}
                title="Savings progress"
                value={`A ${formatINR(planA?.cumulative_savings || 0)} · B ${formatINR(planB?.cumulative_savings || 0)}`}
              />
              <Typography variant="caption" color={COLORS.textSecondary} style={{ marginTop: 8 }}>
                Interest saved is unavailable — loan APR / tenure terms are not in the ledger.
              </Typography>
            </Section>

            {allViolations.length > 0 && (
              <Section title="Constraint violations">
                {allViolations.slice(0, 6).map((v, idx) => (
                  <View key={`${v.type}-${v.period_index}-${idx}`} style={styles.violationCard}>
                    <Typography variant="bodyBold" color={v.severity === 'critical' ? COLORS.error : COLORS.warning}>
                      {v.period_label} · {v.type.replace(/_/g, ' ')}
                    </Typography>
                    <Typography variant="caption" color={COLORS.textSecondary} style={{ marginTop: 4 }}>
                      {v.reason}
                    </Typography>
                    <Typography variant="caption" color={COLORS.text} style={{ marginTop: 6 }}>
                      Required {formatINR(v.required_cash)} · Available {formatINR(v.available_cash)} · Deficit {formatINR(v.deficit)}
                    </Typography>
                    {v.corrective_actions?.length > 0 && (
                      <Typography variant="caption" color={COLORS.textSecondary} style={{ marginTop: 4 }}>
                        Try: {v.corrective_actions.slice(0, 2).join(' · ')}
                      </Typography>
                    )}
                  </View>
                ))}
              </Section>
            )}

            <Section title="What changed?">
              {result.what_changed.map((line) => (
                <Typography key={line} variant="caption" color={COLORS.textSecondary} style={styles.bullet}>
                  • {line}
                </Typography>
              ))}
            </Section>

            <Section title="Limitations">
              {result.limitations.map((line) => (
                <Typography key={line} variant="caption" color={COLORS.textSecondary} style={styles.bullet}>
                  • {line}
                </Typography>
              ))}
              {!result.data_quality.sufficient_history && (
                <Typography variant="caption" color={COLORS.warning} style={styles.bullet}>
                  • Limited transaction history may reduce projection reliability.
                </Typography>
              )}
              {result.data_quality.opening_below_reserve && (
                <Typography variant="caption" color={COLORS.error} style={styles.bullet}>
                  • Opening cash is already below the minimum reserve.
                </Typography>
              )}
            </Section>
          </>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Typography variant="cardHeading" style={styles.sectionTitle}>{title}</Typography>
      {children}
    </View>
  );
}

function Lever({
  label, value, min, max, step, sliderValue, onChange,
}: {
  label: string; value: string; min: number; max: number; step: number;
  sliderValue: number; onChange: (v: number) => void;
}) {
  return (
    <View style={styles.lever}>
      <View style={styles.leverHeader}>
        <Typography variant="bodySemiBold">{label}</Typography>
        <Typography variant="bodyBold">{value}</Typography>
      </View>
      <Slider
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={sliderValue}
        onValueChange={onChange}
        minimumTrackTintColor={COLORS.gold}
        maximumTrackTintColor={COLORS.border}
        thumbTintColor={COLORS.primary}
      />
    </View>
  );
}

function PlanCard({
  plan, recommended, muted,
}: {
  plan: WhatIfPlan; recommended: boolean; muted?: boolean;
}) {
  return (
    <View style={[styles.planCard, recommended && styles.planCardRecommended, muted && styles.planCardMuted]}>
      <View style={styles.planHeader}>
        <Typography variant="bodyBold">{plan.name}</Typography>
        {recommended && (
          <View style={styles.recommendedBadge}>
            <Typography variant="caption" color={COLORS.primary}>Recommended</Typography>
          </View>
        )}
        {!plan.feasible && (
          <View style={styles.infeasibleBadge}>
            <Typography variant="caption" color={COLORS.error}>Infeasible</Typography>
          </View>
        )}
      </View>
      <Typography variant="caption" color={COLORS.textSecondary} style={{ marginTop: 4 }}>
        {plan.summary}
      </Typography>
      <View style={styles.planMetrics}>
        <Metric label="Ending cash" value={formatINR(plan.ending_balance)} />
        <Metric label="Min cash" value={formatINR(plan.minimum_balance)} />
        <Metric label="Breach share" value={`${(plan.reserve_breach_rate * 100).toFixed(0)}%`} />
        <Metric label="Savings" value={formatINR(plan.cumulative_savings)} />
      </View>
      {plan.trade_offs.slice(0, 2).map((t) => (
        <Typography key={t} variant="caption" color={COLORS.textSecondary} style={styles.bullet}>
          • {t}
        </Typography>
      ))}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Typography variant="caption" color={COLORS.textSecondary}>{label}</Typography>
      <Typography variant="bodyBold">{value}</Typography>
    </View>
  );
}

function PeriodDetail({ label, period, accent }: { label: string; period: WhatIfPeriod; accent: string }) {
  return (
    <View style={[styles.periodCard, { borderLeftColor: accent }]}>
      <Typography variant="bodyBold">{label}</Typography>
      <Typography variant="caption" color={COLORS.textSecondary}>
        Open {formatINR(period.opening_balance)} · Income {formatINR(period.income)} · Essentials {formatINR(period.essential_expenses)}
      </Typography>
      <Typography variant="caption" color={COLORS.textSecondary}>
        EMI {formatINR(period.mandatory_debt)} · Extra debt {formatINR(period.additional_debt_repayment)} · Disc {formatINR(period.discretionary_spending)}
      </Typography>
      <Typography variant="caption" color={COLORS.textSecondary}>
        Savings {formatINR(period.savings_contribution)} · Close {formatINR(period.closing_balance)} · Headroom {formatINR(period.reserve_headroom)}
      </Typography>
      <Typography variant="caption" color={period.reserve_violated ? COLORS.error : COLORS.success}>
        {period.reserve_violated ? 'Reserve violated' : 'Reserve intact'} · Band {formatINR(period.balance_low)}–{formatINR(period.balance_high)}
      </Typography>
    </View>
  );
}

function RiskRow({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <View style={styles.riskRow}>
      {icon}
      <View style={{ flex: 1 }}>
        <Typography variant="caption" color={COLORS.textSecondary}>{title}</Typography>
        <Typography variant="bodySemiBold">{value}</Typography>
      </View>
    </View>
  );
}

function BalanceChart({
  baseline, planA, planB, reserve, selectedPeriod, onSelectPeriod,
}: {
  baseline: WhatIfPlan;
  planA: WhatIfPlan | null;
  planB: WhatIfPlan | null;
  reserve: number;
  selectedPeriod: number;
  onSelectPeriod: (n: number) => void;
}) {
  const width = Dimensions.get('window').width - 48;
  const height = 180;
  const pad = 16;
  const periods = planA?.periods || baseline.periods;
  const values = [
    ...baseline.periods.map((p) => p.closing_balance),
    ...(planA?.periods.map((p) => p.closing_balance) || []),
    ...(planB?.periods.map((p) => p.closing_balance) || []),
    reserve,
  ];
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, reserve, 1);
  const x = (i: number) => pad + (i * (width - pad * 2)) / Math.max(periods.length - 1, 1);
  const y = (v: number) => height - pad - ((v - minV) / (maxV - minV || 1)) * (height - pad * 2);

  const linePath = (pts: WhatIfPeriod[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.closing_balance)}`).join(' ');

  return (
    <View>
      <Svg width={width} height={height}>
        <Line x1={pad} y1={y(reserve)} x2={width - pad} y2={y(reserve)} stroke={CHART_COLORS.reserve} strokeDasharray="4 4" strokeWidth={1.5} />
        <SvgText x={pad} y={y(reserve) - 4} fill={CHART_COLORS.reserve} fontSize="10">Reserve</SvgText>
        <Path d={linePath(baseline.periods)} stroke={CHART_COLORS.baseline} strokeWidth={2} fill="none" />
        {planA && <Path d={linePath(planA.periods)} stroke={CHART_COLORS.plan_a} strokeWidth={2.5} fill="none" />}
        {planB && <Path d={linePath(planB.periods)} stroke={CHART_COLORS.plan_b} strokeWidth={2.5} fill="none" />}
        {periods.map((p, i) => (
          <Circle
            key={p.period_label}
            cx={x(i)}
            cy={y((planA || baseline).periods[i].closing_balance)}
            r={selectedPeriod === p.period_index ? 5 : 3}
            fill={selectedPeriod === p.period_index ? COLORS.primary : CHART_COLORS.plan_a}
            onPress={() => onSelectPeriod(p.period_index)}
          />
        ))}
      </Svg>
      <View style={styles.legendRow}>
        <LegendDot color={CHART_COLORS.baseline} label="Baseline" />
        <LegendDot color={CHART_COLORS.plan_a} label="Plan A" />
        <LegendDot color={CHART_COLORS.plan_b} label="Plan B" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Typography variant="caption" color={COLORS.textSecondary}>{label}</Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  headerCopy: { flex: 1 },
  title: { color: COLORS.text, fontSize: 24 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  horizonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  horizonPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  horizonPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  reserveChip: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  staleBanner: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
  section: { backgroundColor: COLORS.surface, borderRadius: SIZES.cardRadius, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 14 },
  sectionTitle: { marginBottom: 12, color: COLORS.text },
  lever: { marginBottom: 10 },
  leverHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtn: { flex: 1.4, backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  errorCard: { flexDirection: 'row', gap: 8, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  preference: { marginBottom: 10, lineHeight: 18 },
  planStack: { gap: 10 },
  planCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 12, backgroundColor: COLORS.background },
  planCardRecommended: { borderColor: COLORS.gold, backgroundColor: 'rgba(214,169,40,0.08)' },
  planCardMuted: { opacity: 0.85 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  recommendedBadge: { backgroundColor: COLORS.gold, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  infeasibleBadge: { backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  planMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, marginBottom: 6 },
  metric: { width: '47%' },
  warningCard: { flexDirection: 'row', gap: 8, marginTop: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#FDE68A' },
  legendRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },
  tableHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableRowActive: { backgroundColor: 'rgba(214,169,40,0.08)' },
  tableCell: { width: 88, fontFamily: FONTS.bodyMedium },
  periodCard: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10, gap: 2 },
  riskRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 },
  violationCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, marginBottom: 8, backgroundColor: COLORS.background },
  bullet: { marginTop: 4, lineHeight: 18 },
});
