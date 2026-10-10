import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  GestureResponderEvent,
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
import { COLORS } from '../../constants/theme';
import { API_BASE_URL } from '../../services/api';
import {
  DailyCashFlowResponse,
  DailyCashPoint,
  fetchDailyCashFlow,
  formatINR,
} from '../../services/finance';
import {
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  ArrowRight,
} from 'lucide-react-native';

const EVENT_FILTERS = ['All', 'Income', 'Bills', 'EMIs'] as const;
type EventFilter = (typeof EVENT_FILTERS)[number];

function filterMatch(filter: EventFilter, type?: string): boolean {
  if (filter === 'All') return true;
  if (filter === 'Income') return type === 'income';
  if (filter === 'Bills') return type === 'bill' || type === 'subscription';
  if (filter === 'EMIs') return type === 'emi';
  return false;
}

function formatEventAmount(amount?: number): string {
  if (amount == null) return '';
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatINR(amount)}`;
}

export default function CashFlowDetailScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<EventFilter>('All');
  const [cardWidth, setCardWidth] = useState(0);
  const [selectedPoint, setSelectedPoint] = useState<DailyCashPoint | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [payload, setPayload] = useState<DailyCashFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      setError(null);
      // Observed month from generator; optional 14-day provider forecast tagged separately.
      const data = await fetchDailyCashFlow({ includeForecastDays: 14 });
      setPayload(data);
      setSelectedPoint(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load daily cash flow';
      setError(`${message} (API: ${API_BASE_URL})`);
      setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const series = payload?.points || [];
  const screenWidth = Dimensions.get('window').width;
  const actualWidth = cardWidth > 0 ? cardWidth : screenWidth - 40;

  const chartH = 240;
  const padL = 44;
  const padR = 12;
  const padTop = 24;
  const padBottom = 28;
  const plotW = Math.max(actualWidth - padL - padR, 160);
  const plotH = chartH - padTop - padBottom;
  const baseY = padTop + plotH;

  const maxVal = useMemo(() => {
    if (!series.length) return 100000;
    const peak = Math.max(...series.map((p) => p.balance), payload?.minimum_reserve || 0, 1);
    return Math.ceil(peak / 10000) * 10000;
  }, [series, payload?.minimum_reserve]);

  const getX = (d: DailyCashPoint) => padL + (d.pct_x ?? 0) * plotW;
  const getY = (val: number) =>
    Math.min(padTop + (1 - Math.max(0, Math.min(val / maxVal, 1))) * plotH, baseY - 6);

  const troughPoint = useMemo(() => {
    if (!series.length) return null;
    return series.reduce((min, p) => (p.balance < min.balance ? p : min), series[0]);
  }, [series]);

  const { linePath, areaPath } = useMemo(() => {
    if (series.length < 2) return { linePath: '', areaPath: '' };
    const pts = series.map((d) => ({
      x: getX(d),
      y: getY(d.balance),
      isTrough: troughPoint ? d.day === troughPoint.day : false,
    }));
    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = p2.x - p1.x;
      const cp1x = p1.x + dx * 0.35;
      const cp2x = p2.x - dx * 0.35;
      path += ` C ${cp1x.toFixed(1)} ${p1.y.toFixed(1)}, ${cp2x.toFixed(1)} ${p2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    const fp = pts[0];
    const lp = pts[pts.length - 1];
    return {
      linePath: path,
      areaPath: `${path} L ${lp.x.toFixed(1)} ${baseY.toFixed(1)} L ${fp.x.toFixed(1)} ${baseY.toFixed(1)} Z`,
    };
  }, [series, actualWidth, maxVal, troughPoint]);

  const yTicks = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const val = Math.round((maxVal * (steps - i)) / steps);
      const label =
        val >= 1000 ? `₹${Math.round(val / 1000)}k` : `₹${val}`;
      return { val, label };
    });
  }, [maxVal]);

  const handleTouch = (evt: GestureResponderEvent) => {
    if (!series.length) return;
    const tx = evt.nativeEvent.locationX;
    let closest = series[0];
    let minD = Infinity;
    series.forEach((pt) => {
      const d = Math.abs(getX(pt) - tx);
      if (d < minD) {
        minD = d;
        closest = pt;
      }
    });
    setSelectedPoint((prev) => (prev?.day === closest.day ? null : closest));
  };

  const toggleAssumptions = () => {
    setAssumptionsOpen((prev) => !prev);
    Animated.timing(rotateAnim, {
      toValue: assumptionsOpen ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const filteredEvents = series.filter(
    (d) => d.event && filterMatch(activeFilter, d.event_type),
  );

  const reserve = payload?.minimum_reserve || 0;
  const belowReserve =
    troughPoint != null && troughPoint.balance < reserve;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Typography variant="pageTitle" style={styles.headerTitle}>
            Cash Flow Forecast
          </Typography>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.headerSub}>
            {payload?.month
              ? `Generator ledger for ${payload.month}${payload.forecast_source ? ` + ${payload.forecast_source}` : ''}`
              : 'Daily balances from your synthetic ledger'}
          </Typography>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {loading && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Typography variant="caption" color={COLORS.textSecondary}>
              Loading daily path from synthetic data…
            </Typography>
          </View>
        )}

        {error && (
          <Typography variant="caption" color={COLORS.error} style={{ marginBottom: 12 }}>
            {error}
          </Typography>
        )}

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Typography variant="caption" style={styles.metricLbl}>Opening</Typography>
            <Typography variant="financial" style={[styles.metricVal, { color: COLORS.text }]}>
              {payload ? formatINR(payload.opening_balance) : '—'}
            </Typography>
          </View>
          <View style={[styles.metricCard, { alignItems: 'center' }]}>
            <Typography variant="caption" style={styles.metricLbl}>Min balance</Typography>
            <Typography variant="financial" style={[styles.metricVal, { color: '#DC2626' }]}>
              {payload ? formatINR(payload.minimum_balance) : '—'}
            </Typography>
          </View>
          <View style={[styles.metricCard, { alignItems: 'flex-end' }]}>
            <Typography variant="caption" style={styles.metricLbl}>End balance</Typography>
            <Typography variant="financial" style={[styles.metricVal, { color: '#16A34A' }]}>
              {payload ? formatINR(payload.closing_balance) : '—'}
            </Typography>
          </View>
        </View>

        <View
          style={styles.chartCard}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - cardWidth) > 2) setCardWidth(w);
          }}
        >
          <View onTouchStart={handleTouch} onTouchMove={handleTouch}>
            <Svg width={actualWidth} height={chartH}>
              <Defs>
                <LinearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#D6A928" stopOpacity="0.35" />
                  <Stop offset="70%" stopColor="#D6A928" stopOpacity="0.07" />
                  <Stop offset="100%" stopColor="#D6A928" stopOpacity="0.0" />
                </LinearGradient>
              </Defs>
              {yTicks.map(({ val, label }) => {
                const yp = getY(val);
                const isZ = val === 0;
                return (
                  <G key={`y${val}`}>
                    <Line
                      x1={padL}
                      y1={yp}
                      x2={actualWidth - padR}
                      y2={yp}
                      stroke={isZ ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}
                      strokeDasharray={isZ ? undefined : '3 3'}
                      strokeWidth={isZ ? 1.2 : 1}
                    />
                    <SvgText
                      x={padL - 5}
                      y={yp + 3.5}
                      fill="rgba(255,255,255,0.38)"
                      fontSize="8"
                      fontWeight="500"
                      textAnchor="end"
                    >
                      {label}
                    </SvgText>
                  </G>
                );
              })}
              {reserve > 0 && (
                <Line
                  x1={padL}
                  y1={getY(reserve)}
                  x2={actualWidth - padR}
                  y2={getY(reserve)}
                  stroke="#DC2626"
                  strokeDasharray="4 4"
                  strokeWidth={1.2}
                />
              )}
              {areaPath ? <Path d={areaPath} fill="url(#dg)" /> : null}
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  stroke="#D6A928"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {series
                .filter((pt) => pt.event)
                .map((pt) => (
                  <Circle
                    key={`ev-${pt.day}`}
                    cx={getX(pt)}
                    cy={getY(pt.balance)}
                    r="4"
                    fill={pt.event_type === 'income' ? '#16A34A' : '#F59E0B'}
                    stroke="#0F172A"
                    strokeWidth="1.5"
                  />
                ))}
              {selectedPoint && (
                <G>
                  <Line
                    x1={getX(selectedPoint)}
                    y1={padTop}
                    x2={getX(selectedPoint)}
                    y2={baseY}
                    stroke="#D6A928"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <Circle
                    cx={getX(selectedPoint)}
                    cy={getY(selectedPoint.balance)}
                    r="6"
                    fill="#D6A928"
                    stroke="#0F172A"
                    strokeWidth="2"
                  />
                </G>
              )}
            </Svg>
          </View>
        </View>

        {selectedPoint && (
          <View style={styles.tooltipCard}>
            <View style={styles.tooltipRow}>
              <Typography variant="bodyBold" style={{ fontSize: 14 }}>
                {selectedPoint.label}
                {selectedPoint.is_forecast ? ' · forecast' : ' · observed'}
              </Typography>
              <TouchableOpacity onPress={() => setSelectedPoint(null)}>
                <Typography variant="caption" style={{ color: COLORS.textSecondary, fontSize: 16, paddingHorizontal: 4 }}>
                  ×
                </Typography>
              </TouchableOpacity>
            </View>
            <Typography variant="caption" color={COLORS.textSecondary} style={{ marginBottom: 4 }}>
              Closing balance
            </Typography>
            <Typography variant="financial" style={{ fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 6 }}>
              {formatINR(selectedPoint.balance)}
            </Typography>
            {selectedPoint.event && (
              <View style={styles.tooltipEvent}>
                <Typography variant="caption" color={COLORS.textSecondary}>
                  {selectedPoint.event}
                </Typography>
                <Typography
                  variant="caption"
                  style={{
                    fontWeight: '700',
                    fontSize: 14,
                    color: selectedPoint.event_type === 'income' ? '#16A34A' : '#DC2626',
                  }}
                >
                  {formatEventAmount(selectedPoint.event_amount)}
                </Typography>
              </View>
            )}
          </View>
        )}

        <View style={styles.filterSection}>
          <Typography variant="cardHeading" style={{ fontSize: 17, marginBottom: 10, color: COLORS.text }}>
            Ledger events
          </Typography>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {EVENT_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
                onPress={() => setActiveFilter(f)}
                activeOpacity={0.75}
              >
                <Typography
                  variant="caption"
                  style={[
                    { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
                    activeFilter === f && { color: '#FFFFFF' },
                  ]}
                >
                  {f}
                </Typography>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ marginBottom: 20, gap: 10 }}>
          {filteredEvents.map((pt) => {
            const isIn = pt.event_type === 'income';
            const dotColor = isIn ? '#16A34A' : pt.event_type === 'emi' ? '#EF4444' : '#D97706';
            return (
              <View key={`ev${pt.day}-${pt.event}`} style={styles.eventRow}>
                <View style={[styles.eventDot, { backgroundColor: dotColor }]} />
                <View style={{ flex: 1 }}>
                  <Typography variant="body" style={{ fontSize: 13.5, fontWeight: '600' }}>
                    {pt.event}
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    {pt.label}
                    {pt.is_forecast ? ' · forecast' : ''}
                  </Typography>
                </View>
                <Typography
                  variant="financial"
                  style={{ fontSize: 15, color: isIn ? '#16A34A' : '#DC2626', fontWeight: '700' }}
                >
                  {formatEventAmount(pt.event_amount)}
                </Typography>
              </View>
            );
          })}
          {!loading && filteredEvents.length === 0 && (
            <Typography variant="caption" color={COLORS.textSecondary} style={{ textAlign: 'center', paddingVertical: 12 }}>
              No events for this filter
            </Typography>
          )}
        </View>

        {belowReserve && troughPoint && (
          <View style={styles.warnCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <AlertTriangle color="#D97706" size={20} />
              <Typography variant="bodyBold" color="#92400E" style={{ marginLeft: 8, fontSize: 15 }}>
                Reserve pressure
              </Typography>
            </View>
            <Typography variant="body" color="#92400E" style={{ fontSize: 13.5, lineHeight: 20, marginBottom: 8 }}>
              Balance reaches {formatINR(troughPoint.balance)} on {troughPoint.label}, below your
              minimum reserve of {formatINR(reserve)}.
            </Typography>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() =>
                router.push({
                  pathname: '/simulator',
                  params: { horizon: '6' },
                })
              }
              activeOpacity={0.8}
            >
              <Typography variant="caption" style={{ color: '#B45309', fontWeight: '700', fontSize: 12.5 }}>
                Open What-If Simulator
              </Typography>
              <ArrowRight color="#B45309" size={14} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.assumptionHeader} onPress={toggleAssumptions} activeOpacity={0.8}>
          <Typography variant="bodyBold" style={{ fontSize: 14 }}>
            How is this calculated?
          </Typography>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <ChevronDown color={COLORS.textSecondary} size={18} />
          </Animated.View>
        </TouchableOpacity>

        {assumptionsOpen && (
          <View style={styles.assumptionBody}>
            <Typography
              variant="caption"
              color={COLORS.textSecondary}
              style={{ fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' }}
            >
              Data sources
            </Typography>
            {(
              payload?.limitations || [
                'Daily balances reconstructed from synthetic generator transactions.',
              ]
            ).map((item) => (
              <View key={item} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.textSecondary, marginTop: 5 }} />
                <Typography variant="caption" color={COLORS.textSecondary} style={{ flex: 1 }}>
                  {item}
                </Typography>
              </View>
            ))}
            {payload?.model_id && (
              <Typography variant="caption" color={COLORS.textSecondary} style={{ marginTop: 6 }}>
                Active forecast model: {payload.model_id}
              </Typography>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 26, color: COLORS.text },
  headerSub: { marginTop: 2 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  metricsRow: { flexDirection: 'row', marginBottom: 14 },
  metricCard: { flex: 1 },
  metricLbl: { color: COLORS.textSecondary, marginBottom: 4 },
  metricVal: { fontSize: 18, fontWeight: '700' },
  chartCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
  },
  tooltipCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  tooltipRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  tooltipEvent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  filterSection: { marginBottom: 12 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterPillActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
  },
  eventDot: { width: 8, height: 8, borderRadius: 4 },
  warnCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  assumptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  assumptionBody: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 14,
    marginTop: -2,
  },
});
