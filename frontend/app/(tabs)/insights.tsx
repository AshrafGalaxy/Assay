import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
  Text as SvgText,
  G,
} from 'react-native-svg';
import { Typography } from '../../components/Typography';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { COLORS, SPACING, SIZES } from '../../constants/theme';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';
import { API_BASE_URL } from '../../services/api';
import {
  CashFlowForecast,
  ForecastInsight,
  ForecastPeriod,
  ForecastRisk,
  fetchCashFlowForecast,
  formatINR,
} from '../../services/finance';

const HORIZONS = [
  { months: 1 as const, label: '1 Month' },
  { months: 3 as const, label: '3 Months' },
  { months: 6 as const, label: '6 Months' },
];

/** Floating dock (~62) + typical bottom margin — keep scroll content clear of the tab bar. */
const TAB_CLEARANCE = 88;

function compactINR(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${Math.round(abs / 1000)}k`;
  return formatINR(amount);
}

function pctLabel(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(0)}%`;
}

function riskTone(severity: string): { fg: string; bg: string; border: string } {
  if (severity === 'critical') {
    return { fg: COLORS.error, bg: '#FEF2F2', border: '#FECACA' };
  }
  if (severity === 'elevated' || severity === 'warning') {
    return { fg: COLORS.warning, bg: '#FFFBEB', border: '#FDE68A' };
  }
  return { fg: COLORS.success, bg: '#F0FDF4', border: '#BBF7D0' };
}

/** One primary reserve story; skip duplicate breach variants. */
function selectPrimaryRisks(risks: ForecastRisk[]): ForecastRisk[] {
  const critical = risks.filter((r) => r.severity === 'critical');
  const elevated = risks.filter(
    (r) => r.severity === 'elevated' || r.severity === 'warning',
  );
  const healthy = risks.filter((r) => r.severity === 'healthy');

  const opening = critical.find((r) => r.id === 'opening_below_reserve');
  const firstBreach = critical.find((r) => r.id.startsWith('reserve_breach'));
  const mandatory = critical.find((r) => r.id.startsWith('mandatory_shortfall'));
  const incomeGap = critical.find((r) => r.id === 'income_below_mandatory');

  const picked: ForecastRisk[] = [];
  if (opening) {
    picked.push(opening);
  } else if (firstBreach) {
    picked.push({
      ...firstBreach,
      title: 'Reserve at risk',
      what: firstBreach.what,
      action: 'Explore alternatives in What-If.',
    });
  }
  if (mandatory) picked.push(mandatory);
  else if (incomeGap && !picked.some((r) => r.id === incomeGap.id)) picked.push(incomeGap);

  for (const r of elevated) {
    if (picked.length >= 2) break;
    if (!picked.some((p) => p.id === r.id)) picked.push(r);
  }

  const hasCritical = picked.some((r) => r.severity === 'critical');
  if (!hasCritical && healthy[0]) picked.push(healthy[0]);

  return picked.slice(0, 2);
}

/** Insights that do not restate the primary risk banner. */
function selectInsights(
  insights: ForecastInsight[],
  primaryRisks: ForecastRisk[],
): ForecastInsight[] {
  const hasReserveRisk = primaryRisks.some(
    (r) =>
      r.id === 'opening_below_reserve' ||
      r.id.startsWith('reserve_breach') ||
      r.severity === 'critical',
  );

  return insights
    .filter((insight) => {
      if (!hasReserveRisk) return true;
      return !['reserve_pressure', 'top_risk', 'buffer_ok'].includes(insight.theme);
    })
    .slice(0, 6);
}

export default function InsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [horizon, setHorizon] = useState<1 | 3 | 6>(3);
  const [forecast, setForecast] = useState<CashFlowForecast | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(1);
  const [cardWidth, setCardWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [insightsExpanded, setInsightsExpanded] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);

  const load = useCallback(async (h: 1 | 3 | 6) => {
    try {
      setError(null);
      const data = await fetchCashFlowForecast(h);
      setForecast(data);
      setSelectedPeriod(1);
      setInsightsExpanded(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load forecast';
      setError(`${message} (API: ${API_BASE_URL})`);
      setForecast(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(horizon);
  }, [horizon, load]);

  const periods = forecast?.periods || [];
  const activePeriod =
    periods.find((p) => p.period_index === selectedPeriod) || periods[0] || null;

  const primaryRisks = useMemo(
    () => selectPrimaryRisks(forecast?.risks || []),
    [forecast?.risks],
  );
  const insightPool = useMemo(
    () => selectInsights(forecast?.insights || [], primaryRisks),
    [forecast?.insights, primaryRisks],
  );
  const visibleInsights = insightsExpanded ? insightPool.slice(0, 3) : insightPool.slice(0, 1);
  const moreInsightCount = Math.max(0, Math.min(insightPool.length, 3) - visibleInsights.length);

  const monthlyExpenses = forecast
    ? forecast.monthly_essential +
      forecast.monthly_discretionary +
      forecast.monthly_debt +
      forecast.monthly_savings
    : 0;

  const screenWidth = Dimensions.get('window').width;
  const actualWidth = cardWidth > 0 ? cardWidth : Math.min(screenWidth - 40, 480);
  const chartH = 148;
  const padL = 8;
  const padR = 8;
  const padTop = 12;
  const padBottom = 22;
  const plotW = Math.max(actualWidth - padL - padR, 120);
  const plotH = chartH - padTop - padBottom;
  const baseY = padTop + plotH;

  const { maxVal, minPlot } = useMemo(() => {
    if (!periods.length || !forecast) return { maxVal: 100000, minPlot: 0 };
    const peak = Math.max(
      ...periods.map((p) => p.balance_high),
      ...periods.map((p) => p.closing_balance),
      forecast.minimum_reserve,
      1,
    );
    const floor = Math.min(
      ...periods.map((p) => p.balance_low),
      ...periods.map((p) => p.closing_balance),
      forecast.minimum_reserve,
      0,
    );
    return {
      maxVal: Math.ceil(peak / 10000) * 10000,
      minPlot: Math.min(0, Math.floor(floor / 10000) * 10000),
    };
  }, [periods, forecast]);

  const getX = (index: number, total: number) =>
    padL + (total <= 1 ? plotW / 2 : (index / (total - 1)) * plotW);
  const getY = (val: number) => {
    const span = Math.max(maxVal - minPlot, 1);
    const frac = Math.max(0, Math.min((val - minPlot) / span, 1));
    return Math.min(padTop + (1 - frac) * plotH, baseY - 4);
  };

  const { linePath, bandPath } = useMemo(() => {
    if (periods.length < 1) return { linePath: '', bandPath: '' };
    const pts = periods.map((p, i) => ({
      x: getX(i, periods.length),
      y: getY(p.closing_balance),
      yLow: getY(p.balance_low),
      yHigh: getY(p.balance_high),
    }));
    if (pts.length === 1) {
      return { linePath: `M ${pts[0].x} ${pts[0].y}`, bandPath: '' };
    }
    let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      line += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
    }
    let band = `M ${pts[0].x.toFixed(1)} ${pts[0].yHigh.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      band += ` L ${pts[i].x.toFixed(1)} ${pts[i].yHigh.toFixed(1)}`;
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      band += ` L ${pts[i].x.toFixed(1)} ${pts[i].yLow.toFixed(1)}`;
    }
    band += ' Z';
    return { linePath: line, bandPath: band };
  }, [periods, actualWidth, maxVal, minPlot]);

  const openSimulator = () => {
    router.push({ pathname: '/simulator', params: { horizon: String(horizon) } });
  };

  const bottomPad = TAB_CLEARANCE + Math.max(insets.bottom, 8);

  const riskPct = forecast?.shortfall_probability;
  const riskColor =
    (riskPct || 0) > 0.35
      ? COLORS.error
      : (riskPct || 0) > 0.1
        ? COLORS.warning
        : COLORS.success;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Cash Flow Forecast"
        subtitle="See what's ahead. Prepare before it happens."
        showNotification={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(horizon);
            }}
          />
        }
      >
        <View style={styles.metaRow}>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.metaText}>
            {forecast
              ? `Updated ${forecast.forecast_updated_at} · Projection`
              : 'Loading projection…'}
          </Typography>
          <TouchableOpacity onPress={openSimulator} hitSlop={8} activeOpacity={0.7}>
            <Typography variant="caption" style={styles.metaLink}>
              What-If
            </Typography>
          </TouchableOpacity>
        </View>

        <View style={styles.horizonRow}>
          {HORIZONS.map((item) => {
            const active = horizon === item.months;
            return (
              <TouchableOpacity
                key={item.months}
                style={[styles.horizonPill, active && styles.horizonPillActive]}
                onPress={() => setHorizon(item.months)}
                activeOpacity={0.75}
              >
                <Typography
                  variant="caption"
                  style={[styles.horizonLabel, active && styles.horizonLabelActive]}
                >
                  {item.label}
                </Typography>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Typography variant="caption" color={COLORS.textSecondary}>
              Calculating forecast…
            </Typography>
          </View>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Typography variant="caption" color={COLORS.error} style={{ lineHeight: 18 }}>
              {error}
            </Typography>
          </View>
        )}

        {forecast && !loading && (
          <>
            {/* Primary: cash + safety */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, styles.summaryPrimary]}>
                <Typography variant="caption" style={styles.summaryLbl} numberOfLines={1}>
                  Projected ending cash
                </Typography>
                <Typography
                  variant="financial"
                  style={styles.summaryValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatINR(forecast.ending_balance)}
                </Typography>
              </View>
              <View style={[styles.summaryCard, styles.summaryPrimary]}>
                <Typography variant="caption" style={styles.summaryLbl} numberOfLines={1}>
                  Reserve risk
                </Typography>
                <Typography
                  variant="financial"
                  style={[styles.summaryValue, { color: riskColor }]}
                  numberOfLines={1}
                >
                  {pctLabel(forecast.shortfall_probability)}
                </Typography>
                <Typography variant="caption" color={COLORS.textSecondary} numberOfLines={1}>
                  vs {formatINR(forecast.minimum_reserve)}
                </Typography>
              </View>
            </View>

            <View style={styles.secondaryRow}>
              <View style={styles.secondaryCard}>
                <Typography variant="caption" style={styles.secondaryLbl} numberOfLines={1}>
                  Min balance
                </Typography>
                <Typography variant="financial" style={styles.secondaryVal} numberOfLines={1}>
                  {formatINR(forecast.minimum_balance)}
                </Typography>
              </View>
              <View style={styles.secondaryCard}>
                <Typography variant="caption" style={styles.secondaryLbl} numberOfLines={1}>
                  Income / mo
                </Typography>
                <Typography variant="financial" style={styles.secondaryVal} numberOfLines={1}>
                  {formatINR(forecast.monthly_income)}
                </Typography>
              </View>
              <View style={styles.secondaryCard}>
                <Typography variant="caption" style={styles.secondaryLbl} numberOfLines={1}>
                  Expenses / mo
                </Typography>
                <Typography variant="financial" style={styles.secondaryVal} numberOfLines={1}>
                  {formatINR(monthlyExpenses)}
                </Typography>
              </View>
            </View>

            {/* Single primary risk banner */}
            {primaryRisks[0] && (
              <View
                style={[
                  styles.riskBanner,
                  {
                    backgroundColor: riskTone(primaryRisks[0].severity).bg,
                    borderColor: riskTone(primaryRisks[0].severity).border,
                  },
                ]}
              >
                <AlertTriangle
                  color={riskTone(primaryRisks[0].severity).fg}
                  size={16}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="bodyBold"
                    style={{ fontSize: 13, color: riskTone(primaryRisks[0].severity).fg }}
                    numberOfLines={1}
                  >
                    {primaryRisks[0].title}
                  </Typography>
                  <Typography
                    variant="caption"
                    color={COLORS.text}
                    style={{ lineHeight: 17, marginTop: 2 }}
                    numberOfLines={2}
                  >
                    {primaryRisks[0].what}
                  </Typography>
                  {primaryRisks[0].action ? (
                    <TouchableOpacity onPress={openSimulator} activeOpacity={0.75} style={{ marginTop: 6 }}>
                      <Typography
                        variant="caption"
                        style={{
                          color: riskTone(primaryRisks[0].severity).fg,
                          fontWeight: '700',
                          fontSize: 12,
                        }}
                      >
                        {primaryRisks[0].action} →
                      </Typography>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}

            {/* Chart */}
            <View
              style={styles.chartCard}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width - 28;
                if (w > 0 && Math.abs(w - cardWidth) > 2) setCardWidth(w);
              }}
            >
              <View style={styles.chartHeader}>
                <Typography variant="bodyBold" style={styles.chartTitle}>
                  Projected cash balance
                </Typography>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: '#D6A928' }]} />
                  <Typography variant="caption" style={styles.legendText}>
                    Expected
                  </Typography>
                  <View style={[styles.legendBand, { backgroundColor: 'rgba(214,169,40,0.35)' }]} />
                  <Typography variant="caption" style={styles.legendText}>
                    Band
                  </Typography>
                  <View style={styles.legendReserve} />
                  <Typography variant="caption" style={styles.legendText}>
                    Reserve
                  </Typography>
                </View>
              </View>

              <Svg width={actualWidth} height={chartH}>
                <Defs>
                  <LinearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor="#D6A928" stopOpacity="0.2" />
                    <Stop offset="100%" stopColor="#D6A928" stopOpacity="0.04" />
                  </LinearGradient>
                </Defs>

                <Line
                  x1={padL}
                  y1={getY(forecast.minimum_reserve)}
                  x2={actualWidth - padR}
                  y2={getY(forecast.minimum_reserve)}
                  stroke="#EF4444"
                  strokeDasharray="4 3"
                  strokeWidth={1.2}
                />

                {bandPath ? <Path d={bandPath} fill="url(#bandGrad)" /> : null}
                {linePath ? (
                  <Path
                    d={linePath}
                    fill="none"
                    stroke="#D6A928"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}

                {periods.map((p, i) => {
                  const selected = p.period_index === selectedPeriod;
                  const pressProps = Platform.OS === 'web'
                    ? { onClick: () => setSelectedPeriod(p.period_index), style: { cursor: 'pointer' } as any }
                    : { onPress: () => setSelectedPeriod(p.period_index) };
                  return (
                    <G key={p.period_index}>
                      <Circle
                        cx={getX(i, periods.length)}
                        cy={getY(p.closing_balance)}
                        r={selected ? 5.5 : 3.5}
                        fill={p.reserve_violated ? '#EF4444' : '#D6A928'}
                        stroke="#0F172A"
                        strokeWidth={1.5}
                        {...pressProps}
                      />
                      <SvgText
                        x={getX(i, periods.length)}
                        y={baseY + 14}
                        fill="rgba(255,255,255,0.5)"
                        fontSize="10"
                        fontWeight={selected ? '700' : '500'}
                        textAnchor="middle"
                      >
                        {p.period_label}
                      </SvgText>
                    </G>
                  );
                })}
              </Svg>

              {activePeriod && <PeriodStrip period={activePeriod} />}
            </View>

            {/* Outlook insights — compact */}
            <View style={styles.sectionHead}>
              <Sparkles color={COLORS.gold} size={16} />
              <Typography variant="cardHeading" style={styles.sectionTitle}>
                Outlook insights
              </Typography>
            </View>

            {visibleInsights.map((insight) => (
              <View key={`${insight.theme}-${insight.headline}`} style={styles.insightCard}>
                <Typography variant="bodyBold" style={{ fontSize: 14 }} numberOfLines={2}>
                  {insight.headline}
                </Typography>
                <Typography
                  variant="caption"
                  color={COLORS.textSecondary}
                  style={{ lineHeight: 18, marginTop: 4 }}
                  numberOfLines={3}
                >
                  {insight.body}
                </Typography>
              </View>
            ))}

            {moreInsightCount > 0 && (
              <TouchableOpacity
                onPress={() => setInsightsExpanded(true)}
                style={styles.expandBtn}
                activeOpacity={0.7}
              >
                <Typography variant="caption" style={styles.expandBtnText}>
                  Show {moreInsightCount} more
                </Typography>
                <ChevronDown color={COLORS.textSecondary} size={14} />
              </TouchableOpacity>
            )}
            {insightsExpanded && insightPool.length > 1 && (
              <TouchableOpacity
                onPress={() => setInsightsExpanded(false)}
                style={styles.expandBtn}
                activeOpacity={0.7}
              >
                <Typography variant="caption" style={styles.expandBtnText}>
                  Show less
                </Typography>
                <ChevronUp color={COLORS.textSecondary} size={14} />
              </TouchableOpacity>
            )}

            {/* Compact What-If */}
            <TouchableOpacity style={styles.ctaRow} onPress={openSimulator} activeOpacity={0.85}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Typography variant="bodyBold" style={{ color: '#fff', fontSize: 14 }}>
                  Explore What-If Simulator
                </Typography>
                <Typography
                  variant="caption"
                  style={{ color: 'rgba(255,255,255,0.6)', marginTop: 2, lineHeight: 16 }}
                  numberOfLines={2}
                >
                  Compare plans and see how your decisions affect future cash.
                </Typography>
              </View>
              <ArrowRight color="#D6A928" size={18} />
            </TouchableOpacity>

            {/* Secondary: expandable breakdown */}
            <TouchableOpacity
              style={styles.accordionHead}
              onPress={() => setDetailsOpen((v) => !v)}
              activeOpacity={0.8}
            >
              <Typography variant="bodyBold" style={{ fontSize: 13 }}>
                Income & obligations
              </Typography>
              {detailsOpen ? (
                <ChevronUp color={COLORS.textSecondary} size={16} />
              ) : (
                <ChevronDown color={COLORS.textSecondary} size={16} />
              )}
            </TouchableOpacity>
            {detailsOpen && (
              <View style={styles.accordionBody}>
                <DetailRow label="Forecast income" value={formatINR(forecast.monthly_income)} />
                <DetailRow label="Essential expenses" value={formatINR(forecast.monthly_essential)} />
                <DetailRow label="Mandatory debt / EMI" value={formatINR(forecast.monthly_debt)} />
                <DetailRow
                  label="After essentials + EMI"
                  value={formatINR(forecast.income_after_mandatory)}
                  emphasize
                />
                <DetailRow label="Discretionary" value={formatINR(forecast.monthly_discretionary)} />
                <DetailRow label="Planned savings" value={formatINR(forecast.monthly_savings)} />
                {primaryRisks[1] && (
                  <View style={{ marginTop: 10 }}>
                    <Typography variant="caption" color={COLORS.textSecondary} style={{ marginBottom: 4 }}>
                      Also watch
                    </Typography>
                    <Typography variant="caption" style={{ lineHeight: 18 }}>
                      {primaryRisks[1].title}: {primaryRisks[1].what}
                    </Typography>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.accordionHead, { marginTop: SPACING.sm }]}
              onPress={() => setMethodOpen((v) => !v)}
              activeOpacity={0.8}
            >
              <Typography variant="bodyBold" style={{ fontSize: 13 }}>
                Method & limitations
              </Typography>
              {methodOpen ? (
                <ChevronUp color={COLORS.textSecondary} size={16} />
              ) : (
                <ChevronDown color={COLORS.textSecondary} size={16} />
              )}
            </TouchableOpacity>
            {methodOpen && (
              <View style={styles.accordionBody}>
                <Typography variant="caption" color={COLORS.textSecondary} style={{ marginBottom: 6 }}>
                  {forecast.source} · {forecast.model_id}
                  {forecast.shortfall_method ? ` · ${forecast.shortfall_method}` : ''}
                </Typography>
                {(forecast.limitations || []).slice(0, 4).map((item) => (
                  <Typography
                    key={item}
                    variant="caption"
                    color={COLORS.textSecondary}
                    style={{ marginBottom: 4, lineHeight: 17 }}
                  >
                    • {item}
                  </Typography>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PeriodStrip({ period }: { period: ForecastPeriod }) {
  return (
    <View style={styles.periodStrip}>
      <Typography variant="caption" style={styles.periodStripTitle}>
        {period.period_label}
        {period.reserve_violated ? ' · below reserve' : ''}
      </Typography>
      <View style={styles.periodStripGrid}>
        <MiniStat label="Open" value={compactINR(period.opening_balance)} />
        <MiniStat label="Close" value={compactINR(period.closing_balance)} />
        <MiniStat label="Income" value={compactINR(period.income)} />
        <MiniStat label="EMI" value={compactINR(period.mandatory_debt)} />
        <MiniStat label="Essentials" value={compactINR(period.essential_expenses)} />
        <MiniStat label="Disc." value={compactINR(period.discretionary_spending)} />
      </View>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Typography variant="caption" style={styles.miniLbl}>
        {label}
      </Typography>
      <Typography variant="caption" style={styles.miniVal} numberOfLines={1}>
        {value}
      </Typography>
    </View>
  );
}

function DetailRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={[styles.detailRow, emphasize && styles.detailEmphasize]}>
      <Typography variant="caption" color={COLORS.textSecondary} style={{ flex: 1 }}>
        {label}
      </Typography>
      <Typography
        variant="financial"
        style={{ fontSize: 13, fontWeight: emphasize ? '700' : '600', color: COLORS.text }}
      >
        {value}
      </Typography>
    </View>
  );
}

const CARD_RADIUS = SIZES.radius;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: SPACING.md,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 11,
  },
  metaLink: {
    color: COLORS.info,
    fontWeight: '700',
    fontSize: 12,
  },
  horizonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.base,
  },
  horizonPill: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  horizonPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  horizonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  horizonLabelActive: {
    color: '#FFFFFF',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.md,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: CARD_RADIUS,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  summaryPrimary: {
    flex: 1,
    minHeight: 88,
    justifyContent: 'center',
  },
  summaryLbl: {
    color: COLORS.textSecondary,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: COLORS.text,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  secondaryCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 64,
    justifyContent: 'center',
  },
  secondaryLbl: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginBottom: 2,
  },
  secondaryVal: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  riskBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  chartCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: SPACING.base,
    overflow: 'hidden',
  },
  chartHeader: {
    marginBottom: 4,
  },
  chartTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendBand: {
    width: 12,
    height: 8,
    borderRadius: 2,
    marginLeft: 4,
  },
  legendReserve: {
    width: 12,
    height: 2,
    backgroundColor: '#EF4444',
    marginLeft: 4,
  },
  legendText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
  },
  periodStrip: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  periodStripTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  periodStripGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniStat: {
    width: '30%',
    flexGrow: 1,
    minWidth: 88,
  },
  miniLbl: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 10,
  },
  miniVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.text,
  },
  insightCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    marginBottom: SPACING.sm,
  },
  expandBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F172A',
    borderRadius: CARD_RADIUS,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: SPACING.sm,
    marginBottom: SPACING.base,
  },
  accordionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accordionBody: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailEmphasize: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 4,
    paddingVertical: 8,
  },
});
