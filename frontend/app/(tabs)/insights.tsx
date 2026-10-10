import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { COLORS } from '../../constants/theme';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Zap,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../services/api';
import {
  DailyCashFlowResponse,
  DailyCashPoint,
  ObligationItem,
  fetchDailyCashFlow,
  fetchObligations,
  formatINR,
  formatSignedINR,
} from '../../services/finance';

const TIMEFRAMES = ['30 Days', '60 Days', '90 Days'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

function forecastDaysFor(timeframe: Timeframe): number {
  if (timeframe === '60 Days') return 30;
  if (timeframe === '90 Days') return 60;
  return 0;
}

function compactINR(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${Math.round(abs / 1000)}k`;
  return formatINR(amount);
}

function buildLinePaths(
  series: DailyCashPoint[],
  getX: (d: DailyCashPoint) => number,
  getY: (val: number) => number,
  baseY: number,
) {
  if (series.length < 2) return { linePath: '', areaPath: '' };
  const pts = series.map((d) => ({ x: getX(d), y: getY(d.balance) }));
  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    path += ` C ${(p1.x + dx * 0.38).toFixed(1)} ${p1.y.toFixed(1)}, ${(p2.x - dx * 0.38).toFixed(1)} ${p2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  const fp = pts[0];
  const lp = pts[pts.length - 1];
  return {
    linePath: path,
    areaPath: `${path} L ${lp.x.toFixed(1)} ${baseY.toFixed(1)} L ${fp.x.toFixed(1)} ${baseY.toFixed(1)} Z`,
  };
}

export default function InsightsScreen() {
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<Timeframe>('30 Days');
  const [cardWidth, setCardWidth] = useState(0);
  const [payload, setPayload] = useState<DailyCashFlowResponse | null>(null);
  const [obligations, setObligations] = useState<ObligationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (tf: Timeframe) => {
    try {
      setError(null);
      const [daily, oblig] = await Promise.all([
        fetchDailyCashFlow({ includeForecastDays: forecastDaysFor(tf) }),
        fetchObligations(),
      ]);
      setPayload(daily);
      setObligations((oblig.items || []).slice(0, 5));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load cash-flow';
      setError(`${message} (API: ${API_BASE_URL})`);
      setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(timeframe);
  }, [load, timeframe]);

  const series = payload?.points || [];
  const screenWidth = Dimensions.get('window').width;
  const fallbackWidth = Math.min(screenWidth - 40, 420);
  const actualWidth = cardWidth > 0 ? cardWidth : fallbackWidth;

  const chartH = 130;
  const padL = 0;
  const padR = 0;
  const padTop = 10;
  const padBottom = 10;
  const plotW = Math.max(actualWidth - padL - padR, 120);
  const plotH = chartH - padTop - padBottom;
  const baseY = padTop + plotH;

  const maxVal = useMemo(() => {
    if (!series.length) return 100000;
    const peak = Math.max(...series.map((p) => p.balance), payload?.minimum_reserve || 0, 1);
    return Math.ceil(peak / 10000) * 10000;
  }, [series, payload?.minimum_reserve]);

  const getX = (d: DailyCashPoint) => padL + (d.pct_x ?? 0) * plotW;
  const getY = (val: number) => {
    const frac = Math.max(0, Math.min(val / maxVal, 1));
    return Math.min(padTop + (1 - frac) * plotH, baseY - 6);
  };

  const troughPoint = useMemo(() => {
    if (!series.length) return null;
    return series.reduce((min, p) => (p.balance < min.balance ? p : min), series[0]);
  }, [series]);

  const { linePath, areaPath } = useMemo(
    () => buildLinePaths(series, getX, getY, baseY),
    [series, actualWidth, maxVal],
  );

  const opening = payload?.opening_balance ?? series[0]?.balance;
  const ending = payload?.closing_balance;
  const minBal = payload?.minimum_balance ?? troughPoint?.balance;
  const troughEvent = troughPoint?.event
    ? `${troughPoint.event}${troughPoint.event_amount != null ? ` (${formatSignedINR(troughPoint.event_amount, (troughPoint.event_amount || 0) >= 0)})` : ''}`
    : null;
  const belowReserve =
    troughPoint != null &&
    payload != null &&
    troughPoint.balance < (payload.minimum_reserve || 0);

  const eventObligations = useMemo(() => {
    return series
      .filter((p) => p.event && p.event_type !== 'income' && !p.is_forecast)
      .slice(0, 3);
  }, [series]);

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Cash-Flow Forecast"
        subtitle={
          payload?.month
            ? `Synthetic ledger · ${payload.month}${payload.forecast_source ? ` + ${payload.forecast_source}` : ''}`
            : 'Predictive Solvency & Buffer Analytics'
        }
        showNotification={false}
        rightAction={
          <TouchableOpacity style={styles.calendarBtn} onPress={() => {}} activeOpacity={0.7}>
            <Calendar color={COLORS.text} size={18} strokeWidth={1.8} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(timeframe);
            }}
          />
        }
      >
        <View style={styles.timeframeRow}>
          {TIMEFRAMES.map((tf) => {
            const isActive = timeframe === tf;
            return (
              <TouchableOpacity
                key={tf}
                style={[styles.tfPill, isActive && styles.tfPillActive]}
                onPress={() => setTimeframe(tf)}
                activeOpacity={0.75}
              >
                <Typography
                  variant="caption"
                  style={[styles.tfText, isActive && styles.tfTextActive]}
                >
                  {tf}
                </Typography>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Typography variant="caption" color={COLORS.textSecondary}>
              Loading generator daily path…
            </Typography>
          </View>
        )}

        {error && (
          <Typography variant="caption" color={COLORS.error} style={{ marginBottom: 12 }}>
            {error}
          </Typography>
        )}

        <TouchableOpacity
          style={styles.forecastCard}
          activeOpacity={0.93}
          onPress={() => router.push('/cashflow-detail')}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - cardWidth) > 2) setCardWidth(w);
          }}
        >
          <View style={styles.summaryMetricRow}>
            <View style={styles.summaryMetric}>
              <Typography variant="caption" style={styles.metricLabel}>Opening</Typography>
              <Typography variant="financial" style={styles.metricValueNeutral}>
                {opening != null ? formatINR(opening) : '—'}
              </Typography>
            </View>
            <View style={[styles.summaryMetric, { alignItems: 'center' }]}>
              <Typography variant="caption" style={styles.metricLabel}>Min balance</Typography>
              <Typography variant="financial" style={styles.metricValueAlert}>
                {minBal != null ? formatINR(minBal) : '—'}
              </Typography>
            </View>
            <View style={[styles.summaryMetric, { alignItems: 'flex-end' }]}>
              <Typography variant="caption" style={styles.metricLabel}>End of period</Typography>
              <Typography variant="financial" style={styles.metricValueGood}>
                {ending != null ? formatINR(ending) : '—'}
              </Typography>
            </View>
          </View>

          <Typography variant="caption" style={styles.summarySubLabel}>
            {troughPoint
              ? `Lowest on ${troughPoint.label}${troughEvent ? ` — ${troughEvent}` : ''}`
              : 'Daily balances reconstructed from synthetic transactions'}
          </Typography>

          <View style={styles.svgWrapper}>
            <Svg width={actualWidth} height={chartH}>
              <Defs>
                <LinearGradient id="summaryGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#D6A928" stopOpacity="0.25" />
                  <Stop offset="80%" stopColor="#D6A928" stopOpacity="0.05" />
                  <Stop offset="100%" stopColor="#D6A928" stopOpacity="0.0" />
                </LinearGradient>
              </Defs>

              <Line
                x1={0}
                y1={baseY}
                x2={actualWidth}
                y2={baseY}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth="1"
              />

              {areaPath ? <Path d={areaPath} fill="url(#summaryGrad)" /> : null}
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  stroke="#D6A928"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {troughPoint && (
                <G>
                  <Circle
                    cx={getX(troughPoint)}
                    cy={getY(troughPoint.balance)}
                    r="8"
                    fill="rgba(239,68,68,0.18)"
                  />
                  <Circle
                    cx={getX(troughPoint)}
                    cy={getY(troughPoint.balance)}
                    r="4"
                    fill="#EF4444"
                    stroke="#0F172A"
                    strokeWidth="1.5"
                  />
                  <SvgText
                    x={getX(troughPoint)}
                    y={getY(troughPoint.balance) - 11}
                    fill="#FCA5A5"
                    fontSize="8"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {compactINR(troughPoint.balance)}
                  </SvgText>
                </G>
              )}
            </Svg>
          </View>

          <View style={styles.tapAffordance}>
            <Typography variant="caption" style={styles.tapHint}>
              {troughPoint ? (
                <>
                  Balance reaches a low of{' '}
                  <Typography variant="caption" style={{ color: '#EF4444', fontWeight: '700' }}>
                    {formatINR(troughPoint.balance)}
                  </Typography>
                  {' '}on {troughPoint.label}
                </>
              ) : (
                'Pull to refresh once the API is reachable'
              )}
            </Typography>
            <View style={styles.tapCTA}>
              <Typography variant="caption" style={styles.tapCTAText}>View detailed forecast</Typography>
              <ChevronRight color="#D6A928" size={14} strokeWidth={2.5} />
            </View>
          </View>
        </TouchableOpacity>

        {belowReserve && troughPoint && payload && (
          <View style={styles.warningCard}>
            <View style={styles.warningIconWrapper}>
              <AlertTriangle color="#D97706" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Typography variant="body" color="#92400E" style={styles.warningText}>
                <Typography variant="bodyBold" color="#92400E">Reserve pressure: </Typography>
                Account dips to{' '}
                <Typography variant="bodyBold" color="#92400E">
                  {formatINR(troughPoint.balance)}
                </Typography>
                {' '}on {troughPoint.label}, below reserve of {formatINR(payload.minimum_reserve)}.
              </Typography>
              <TouchableOpacity
                style={styles.warningActionBtn}
                onPress={() => router.push('/cashflow-detail')}
                activeOpacity={0.8}
              >
                <Typography variant="caption" style={styles.warningActionText}>
                  See detailed forecast & what-if options →
                </Typography>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Typography variant="cardHeading" style={styles.sectionHeader}>
          Ledger events this month
        </Typography>

        <View style={styles.obligationsList}>
          {eventObligations.map((pt) => {
            const isIn = pt.event_type === 'income';
            return (
              <TouchableOpacity
                key={`ev-${pt.day}-${pt.event}`}
                style={styles.obligationCard}
                onPress={() => router.push('/cashflow-detail')}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.obligationIcon,
                    { backgroundColor: isIn ? '#DCFCE7' : pt.event_type === 'emi' ? '#FEE2E2' : '#FEF3C7' },
                  ]}
                >
                  {isIn ? (
                    <ArrowUpRight color="#16A34A" size={20} />
                  ) : (
                    <Zap color={pt.event_type === 'emi' ? '#DC2626' : '#D97706'} size={18} />
                  )}
                </View>
                <View style={styles.obligationDetails}>
                  <Typography variant="bodyBold" style={{ fontSize: 15 }}>
                    {pt.event}
                  </Typography>
                  <View style={styles.obligationSubRow}>
                    <Typography variant="caption" color={COLORS.textSecondary}>
                      {pt.label} •
                    </Typography>
                    <View
                      style={[
                        styles.tagBadge,
                        { backgroundColor: isIn ? '#DCFCE7' : '#FEF3C7' },
                      ]}
                    >
                      <Typography
                        variant="caption"
                        color={isIn ? '#15803D' : '#B45309'}
                        style={{ fontSize: 11, fontWeight: '600' }}
                      >
                        {pt.event_category || pt.event_type || 'Event'}
                      </Typography>
                    </View>
                  </View>
                </View>
                <Typography
                  variant="financial"
                  style={{ fontSize: 16, color: isIn ? '#16A34A' : '#DC2626' }}
                >
                  {pt.event_amount != null
                    ? formatSignedINR(pt.event_amount, (pt.event_amount || 0) >= 0)
                    : '—'}
                </Typography>
              </TouchableOpacity>
            );
          })}

          {!eventObligations.length &&
            obligations.map((item) => (
              <View key={item.id} style={styles.obligationCard}>
                <View style={[styles.obligationIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Zap color="#D97706" size={18} />
                </View>
                <View style={styles.obligationDetails}>
                  <Typography variant="bodyBold" style={{ fontSize: 15 }}>
                    {item.name}
                  </Typography>
                  <View style={styles.obligationSubRow}>
                    <Typography variant="caption" color={COLORS.textSecondary}>
                      Due day {item.due_day} •
                    </Typography>
                    <View style={[styles.tagBadge, { backgroundColor: '#FEF3C7' }]}>
                      <Typography
                        variant="caption"
                        color="#B45309"
                        style={{ fontSize: 11, fontWeight: '600' }}
                      >
                        {item.category || item.frequency}
                      </Typography>
                    </View>
                  </View>
                </View>
                <Typography variant="financial" style={{ fontSize: 16, color: '#DC2626' }}>
                  -{formatINR(item.amount)}
                </Typography>
              </View>
            ))}

          {!loading && !eventObligations.length && !obligations.length && (
            <Typography variant="caption" color={COLORS.textSecondary} style={{ textAlign: 'center', paddingVertical: 8 }}>
              No ledger events for this month
            </Typography>
          )}
        </View>

        <Typography variant="cardHeading" style={{ marginTop: 24, marginBottom: 12 }}>
          Financial Intelligence Hub
        </Typography>

        <TouchableOpacity
          style={styles.hubCard}
          onPress={() => router.push('/debt')}
          activeOpacity={0.75}
        >
          <View style={[styles.hubIcon, { backgroundColor: '#EFF6FF' }]}>
            <TrendingDown color="#2563EB" size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Typography variant="bodyBold">Debt & Liabilities</Typography>
            <Typography variant="caption" color={COLORS.textSecondary}>
              Active credit lines and payoff planning.
            </Typography>
          </View>
          <ArrowRight color={COLORS.textSecondary} size={18} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCard}
          onPress={() => router.push({ pathname: '/simulator', params: { horizon: '6' } })}
          activeOpacity={0.75}
        >
          <View style={[styles.hubIcon, { backgroundColor: '#FEF3C7' }]}>
            <Zap color="#B45309" size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Typography variant="bodyBold">What-If Simulator</Typography>
            <Typography variant="caption" color={COLORS.textSecondary}>
              Adjust spending and loan levers against generator run-rates.
            </Typography>
          </View>
          <ArrowRight color={COLORS.textSecondary} size={18} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCard}
          onPress={() => router.push('/copilot/affordability')}
          activeOpacity={0.75}
        >
          <View style={[styles.hubIcon, { backgroundColor: '#FEE2E2' }]}>
            <AlertTriangle color="#DC2626" size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Typography variant="bodyBold">Affordability Check</Typography>
            <Typography variant="caption" color={COLORS.textSecondary}>
              Cash shortfall warning and No-Cost EMI options.
            </Typography>
          </View>
          <ArrowRight color={COLORS.textSecondary} size={18} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCard}
          onPress={() => router.push('/copilot/analysis')}
          activeOpacity={0.75}
        >
          <View style={[styles.hubIcon, { backgroundColor: '#F0FDF4' }]}>
            <TrendingUp color="#16A34A" size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Typography variant="bodyBold">Copilot Audited Intelligence</Typography>
            <Typography variant="caption" color={COLORS.textSecondary}>
              Observed facts, predictive risk, and actionable spending caps.
            </Typography>
          </View>
          <ArrowRight color={COLORS.textSecondary} size={18} />
        </TouchableOpacity>

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  summaryMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryMetric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 9.5,
    color: 'rgba(255,255,255,0.42)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  metricValueNeutral: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  metricValueAlert: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '700',
  },
  metricValueGood: {
    fontSize: 16,
    color: '#4ADE80',
    fontWeight: '700',
  },
  summarySubLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    marginBottom: 6,
    lineHeight: 16,
  },
  tapAffordance: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    marginTop: 2,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 5,
  },
  tapCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tapCTAText: {
    color: '#D6A928',
    fontWeight: '700',
    fontSize: 12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  calendarBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeframeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tfPill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tfPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  tfText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tfTextActive: {
    color: '#FFFFFF',
  },
  forecastCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  svgWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  warningIconWrapper: {
    marginRight: 12,
    marginTop: 2,
  },
  warningText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  warningActionBtn: {
    marginTop: 8,
  },
  warningActionText: {
    color: '#B45309',
    fontWeight: '700',
    fontSize: 12.5,
  },
  sectionHeader: {
    fontSize: 18,
    marginBottom: 12,
    color: COLORS.text,
  },
  obligationsList: {
    gap: 10,
    marginBottom: 12,
  },
  obligationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  obligationIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  obligationDetails: {
    flex: 1,
  },
  obligationSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 10,
  },
  hubIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
});
