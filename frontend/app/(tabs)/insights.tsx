import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
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
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { COLORS, SPACING } from '../../constants/theme';
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

const TIMEFRAMES = ['30 Days', '60 Days', '90 Days'];

interface DayDataPoint {
  day: number;
  label: string;
  balance: number;
  pctX: number;
}

// Full 30-day dataset — underlying data preserved, only presentation changes
const FULL_MONTH_DATA: DayDataPoint[] = [
  { day: 1,  label: '1 Sep',  balance: 42850, pctX: 0.0  },
  { day: 7,  label: '7 Sep',  balance: 37400, pctX: 0.17 },
  { day: 14, label: '14 Sep', balance: 31000, pctX: 0.35 },
  { day: 21, label: '21 Sep', balance: 24000, pctX: 0.52 },
  { day: 22, label: '22 Sep', balance: 15600, pctX: 0.58 },
  { day: 25, label: '25 Sep', balance: 3200,  pctX: 0.70 },
  { day: 28, label: '28 Sep', balance: 88200, pctX: 0.86 },
  { day: 30, label: '30 Sep', balance: 82400, pctX: 1.0  },
];

export default function InsightsScreen() {
  const router = useRouter();
  const [timeframe, setTimeframe] = useState('30 Days');
  const [cardWidth, setCardWidth] = useState<number>(0);

  const screenWidth = Dimensions.get('window').width;
  const fallbackWidth = Math.min(screenWidth - 40, 420);
  const actualWidth = cardWidth > 0 ? cardWidth : fallbackWidth;

  // Compact summary chart — intentionally small and calm
  const chartH    = 130;
  const padL      = 0;
  const padR      = 0;
  const padTop    = 10;
  const padBottom = 10;
  const plotW     = Math.max(actualWidth - padL - padR, 120);
  const plotH     = chartH - padTop - padBottom;
  const baseY     = padTop + plotH;
  const maxVal    = 100000;

  // Compact summary chart — correct coordinate functions using padL/baseY/plotW
  const getX = (d: DayDataPoint) => padL + d.pctX * plotW;
  const getY = (val: number) => {
    const frac = Math.max(0, Math.min(val / maxVal, 1));
    return Math.min(padTop + (1 - frac) * plotH, baseY - 6);
  };

  const troughPoint = FULL_MONTH_DATA.find(d => d.day === 25)!;

  const { linePath, areaPath } = useMemo(() => {
    const pts = FULL_MONTH_DATA.map(d => ({
      x: getX(d), y: getY(d.balance),
      isTrough: d.balance <= 3500,
      isPeak:   d.balance >= 80000,
    }));

    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const dx = p2.x - p1.x;
      let cp1x = p1.x + dx * 0.38, cp1y = p1.y;
      let cp2x = p2.x - dx * 0.38, cp2y = p2.y;
      if (p2.isTrough)      { cp2y = p2.y; cp1y = p1.y + (p2.y - p1.y) * 0.3; }
      else if (p1.isTrough) { cp1y = p1.y; cp2y = p2.y - (p2.y - p1.y) * 0.2; }
      else if (p2.isPeak)   { cp2y = p2.y; cp1y = p1.y + (p2.y - p1.y) * 0.5; }
      else { cp1y = p1.y + (p2.y - p1.y) * 0.25; cp2y = p2.y - (p2.y - p1.y) * 0.25; }
      cp1y = Math.min(cp1y, baseY - 5); cp2y = Math.min(cp2y, baseY - 5);
      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    const fp = pts[0], lp = pts[pts.length - 1];
    const area = `${path} L ${lp.x.toFixed(1)} ${baseY.toFixed(1)} L ${fp.x.toFixed(1)} ${baseY.toFixed(1)} Z`;
    return { linePath: path, areaPath: area };
  }, [actualWidth]);



  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Cash-Flow Forecast"
        subtitle="Predictive Solvency & Buffer Analytics"
        showNotification={false}
        rightAction={
          <TouchableOpacity
            style={styles.calendarBtn}
            onPress={() => {}}
            activeOpacity={0.7}
          >
            <Calendar color={COLORS.text} size={18} strokeWidth={1.8} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Timeframe Pills */}
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

        {/* ── SUMMARY CARD — entire card is tappable, navigates to detail ── */}
        <TouchableOpacity
          style={styles.forecastCard}
          activeOpacity={0.93}
          onPress={() => router.push('/cashflow-detail')}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - cardWidth) > 2) setCardWidth(w);
          }}
        >
          {/* 3-column metric summary */}
          <View style={styles.summaryMetricRow}>
            <View style={styles.summaryMetric}>
              <Typography variant="caption" style={styles.metricLabel}>Current</Typography>
              <Typography variant="financial" style={styles.metricValueNeutral}>₹42,850</Typography>
            </View>
            <View style={[styles.summaryMetric, { alignItems: 'center' }]}>
              <Typography variant="caption" style={styles.metricLabel}>Min Projected</Typography>
              <Typography variant="financial" style={styles.metricValueAlert}>₹3,200</Typography>
            </View>
            <View style={[styles.summaryMetric, { alignItems: 'flex-end' }]}>
              <Typography variant="caption" style={styles.metricLabel}>End of Period</Typography>
              <Typography variant="financial" style={styles.metricValueGood}>₹82,400</Typography>
            </View>
          </View>

          <Typography variant="caption" style={styles.summarySubLabel}>
            Lowest balance on 25 Sep — after ₹8,400 Car EMI
          </Typography>

          {/* Minimal line chart — NO controls, NO annotations, ONE marker */}
          <View style={styles.svgWrapper}>
            <Svg width={actualWidth} height={chartH}>
              <Defs>
                <LinearGradient id="summaryGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%"   stopColor="#D6A928" stopOpacity="0.25" />
                  <Stop offset="80%"  stopColor="#D6A928" stopOpacity="0.05" />
                  <Stop offset="100%" stopColor="#D6A928" stopOpacity="0.0"  />
                </LinearGradient>
              </Defs>

              {/* Subtle base line */}
              <Line x1={0} y1={baseY} x2={actualWidth} y2={baseY}
                stroke="rgba(255,255,255,0.10)" strokeWidth="1" />

              {/* Area + line */}
              {areaPath ? <Path d={areaPath} fill="url(#summaryGrad)" /> : null}
              {linePath ? (
                <Path d={linePath} fill="none" stroke="#D6A928"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : null}

              {/* Single minimum marker — the ONLY annotation */}
              <G>
                <Circle cx={getX(troughPoint)} cy={getY(troughPoint.balance)}
                  r="8" fill="rgba(239,68,68,0.18)" />
                <Circle cx={getX(troughPoint)} cy={getY(troughPoint.balance)}
                  r="4" fill="#EF4444" stroke="#0F172A" strokeWidth="1.5" />
                <SvgText x={getX(troughPoint)} y={getY(troughPoint.balance) - 11}
                  fill="#FCA5A5" fontSize="8" fontWeight="600" textAnchor="middle">
                  ₹3,200
                </SvgText>
              </G>
            </Svg>
          </View>

          {/* Tap affordance */}
          <View style={styles.tapAffordance}>
            <Typography variant="caption" style={styles.tapHint}>
              Balance projected to reach a low of{' '}
              <Typography variant="caption" style={{ color: '#EF4444', fontWeight: '700' }}>₹3,200</Typography>
              {' '}on 25 Sep
            </Typography>
            <View style={styles.tapCTA}>
              <Typography variant="caption" style={styles.tapCTAText}>View detailed forecast</Typography>
              <ChevronRight color="#D6A928" size={14} strokeWidth={2.5} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Solvency Warning Card */}
        <View style={styles.warningCard}>
          <View style={styles.warningIconWrapper}>
            <AlertTriangle color="#D97706" size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Typography variant="body" color="#92400E" style={styles.warningText}>
              <Typography variant="bodyBold" color="#92400E">Solvency Warning: </Typography>
              Account dips to{' '}
              <Typography variant="bodyBold" color="#92400E">₹3,200</Typography>
              {' '}on 25 Sep after your ₹8,400 Car Loan EMI.
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

        {/* Colliding Obligations (Next 10 Days) */}
        <Typography variant="cardHeading" style={styles.sectionHeader}>
          Colliding Obligations (Next 10 Days)
        </Typography>

        <View style={styles.obligationsList}>
          {/* Axis Car Loan EMI */}
          <TouchableOpacity
            style={styles.obligationCard}
            onPress={() => router.push('/debt')}
            activeOpacity={0.75}
          >
            <MerchantLogo name="axis" size={42} style={{ marginRight: 12 }} />
            <View style={styles.obligationDetails}>
              <Typography variant="bodyBold" style={{ fontSize: 15 }}>
                Axis Car Loan EMI
              </Typography>
              <View style={styles.obligationSubRow}>
                <Typography variant="caption" color={COLORS.textSecondary}>
                  Due 22 Sep •
                </Typography>
                <View style={[styles.tagBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Typography variant="caption" color="#B45309" style={{ fontSize: 11, fontWeight: '600' }}>
                    Auto-debit
                  </Typography>
                </View>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Typography variant="financial" style={{ fontSize: 16, color: '#DC2626' }}>
                -₹8,400
              </Typography>
              <ArrowRight color={COLORS.textSecondary} size={16} style={{ marginTop: 2 }} />
            </View>
          </TouchableOpacity>

          {/* Adani Power Bill */}
          <View style={styles.obligationCard}>
            <View style={[styles.obligationIcon, { backgroundColor: '#FEF3C7' }]}>
              <Zap color="#D97706" size={18} />
            </View>
            <View style={styles.obligationDetails}>
              <Typography variant="bodyBold" style={{ fontSize: 15 }}>
                Adani Power Electricity
              </Typography>
              <View style={styles.obligationSubRow}>
                <Typography variant="caption" color={COLORS.textSecondary}>
                  Due 24 Sep •
                </Typography>
                <View style={[styles.tagBadge, { backgroundColor: '#EFF6FF' }]}>
                  <Typography variant="caption" color="#1D4ED8" style={{ fontSize: 11, fontWeight: '600' }}>
                    Bill Payment
                  </Typography>
                </View>
              </View>
            </View>
            <Typography variant="financial" style={{ fontSize: 16, color: '#DC2626' }}>
              -₹2,100
            </Typography>
          </View>

          {/* Monthly Salary Deposit */}
          <View style={styles.obligationCard}>
            <View style={[styles.obligationIcon, { backgroundColor: '#DCFCE7' }]}>
              <ArrowUpRight color="#16A34A" size={20} />
            </View>
            <View style={styles.obligationDetails}>
              <Typography variant="bodyBold" style={{ fontSize: 15 }}>
                Monthly Salary Deposit
              </Typography>
              <View style={styles.obligationSubRow}>
                <Typography variant="caption" color={COLORS.textSecondary}>
                  Expected 28 Sep •
                </Typography>
                <View style={[styles.tagBadge, { backgroundColor: '#DCFCE7' }]}>
                  <Typography variant="caption" color="#15803D" style={{ fontSize: 11, fontWeight: '600' }}>
                    Incoming
                  </Typography>
                </View>
              </View>
            </View>
            <Typography variant="financial" style={{ fontSize: 16, color: '#16A34A' }}>
              +₹85,000
            </Typography>
          </View>
        </View>

        {/* Financial Action & Intelligence Hub */}
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
              Active credit lines, DTI 28%, and avalanche payoff plan.
            </Typography>
          </View>
          <ArrowRight color={COLORS.textSecondary} size={18} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hubCard}
          onPress={() => router.push('/simulator')}
          activeOpacity={0.75}
        >
          <View style={[styles.hubIcon, { backgroundColor: '#FEF3C7' }]}>
            <Zap color="#B45309" size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Typography variant="bodyBold">What-If Simulator</Typography>
            <Typography variant="caption" color={COLORS.textSecondary}>
              Adjust spending and loan levers to forecast 12-month impact.
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

  // ── Summary chart card extras ──
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
  forecastHeader: {
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 14.5,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  cardSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  floorMiniTag: {
    backgroundColor: 'rgba(214, 169, 40, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.45)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    marginLeft: 8,
  },
  floorMiniTagText: {
    color: '#F59E0B',
    fontSize: 10.5,
    fontWeight: '700',
  },
  segmentedTrackPrimary: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 11,
    padding: 2.5,
    marginBottom: 6,
    height: 30,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(214, 169, 40, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.55)',
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  segmentTextActive: {
    color: '#D6A928',
    fontWeight: '700',
  },
  segmentedTrackSecondary: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    padding: 2,
    marginBottom: 6,
    height: 27,
  },
  segmentSubBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentSubBtnActiveGold: {
    backgroundColor: 'rgba(214, 169, 40, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.45)',
  },
  segmentSubBtnActiveRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  segmentSubBtnActiveGreen: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  segmentSubText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  segmentSubTextActiveGold: {
    color: '#D6A928',
    fontWeight: '700',
  },
  segmentSubTextActiveRed: {
    color: '#F87171',
    fontWeight: '700',
  },
  segmentSubTextActiveGreen: {
    color: '#4ADE80',
    fontWeight: '700',
  },
  activeScrubBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(214, 169, 40, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    marginBottom: 4,
  },
  scrubIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D6A928',
    marginRight: 8,
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
