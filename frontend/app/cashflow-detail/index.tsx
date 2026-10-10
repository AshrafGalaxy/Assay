import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { ForecastSummaryCard } from '../../components/fi/ForecastSummaryCard';
import { FinancialMetric } from '../../components/fi/FinancialMetric';
import { FeatureCard } from '../../components/fi/FeatureCard';
import {
  fetchCashFlowForecast,
  CashFlowForecast,
  formatINR,
} from '../../services/finance';
import {
  ChevronLeft,
  ChevronDown,
  Info,
  ArrowUp,
  ArrowDown,
  BarChart3,
  ListFilter,
  BarChart2,
  CalendarCheck,
  Settings,
  ChevronRight,
} from 'lucide-react-native';

const HORIZON_OPTIONS = [
  { key: '1M', label: 'Next 1 Month', months: 1 },
  { key: '3M', label: 'Next 3 Months', months: 3 },
  { key: '6M', label: 'Next 6 Months', months: 6 },
  { key: '12M', label: 'Next 12 Months', months: 12 },
] as const;

export default function CashFlowForecastMainScreen() {
  const router = useRouter();
  const [selectedHorizon, setSelectedHorizon] = useState<'1M' | '3M' | '6M' | '12M'>('6M');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  const [forecastData, setForecastData] = useState<CashFlowForecast | null>(null);
  const [loading, setLoading] = useState(true);

  const horizonMonths = selectedHorizon === '1M' ? 1 : selectedHorizon === '3M' ? 3 : selectedHorizon === '6M' ? 6 : 12;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchCashFlowForecast(horizonMonths);
      setForecastData(data);
    } catch {
      // In case backend is offline or loading, preview defaults will ensure UI stability
      setForecastData(null);
    } finally {
      setLoading(false);
    }
  }, [horizonMonths]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  // Fallback / Preview Chart Points matching Mockup Screen 3
  // Mockup shows: Now, Apr, May, Jun, Jul, Aug, Sep with smooth curve and reserve at 15k
  const previewPoints = useMemo(() => {
    return [
      { label: 'Now', balance: 50000, low: 46000, high: 54000 },
      { label: 'Apr', balance: 48000, low: 42000, high: 55000 },
      { label: 'May', balance: 28500, low: 22000, high: 36000, isTrough: true },
      { label: 'Jun', balance: 45000, low: 37000, high: 54000 },
      { label: 'Jul', balance: 65000, low: 55000, high: 78000 },
      { label: 'Aug', balance: 85000, low: 72000, high: 99000 },
      { label: 'Sep', balance: 110000, low: 95000, high: 128000 },
    ];
  }, []);

  const chartPoints = useMemo(() => {
    if (forecastData?.periods && forecastData.periods.length > 0) {
      const pts = [
        {
          label: 'Now',
          balance: forecastData.opening_balance || 50000,
          low: (forecastData.opening_balance || 50000) * 0.95,
          high: (forecastData.opening_balance || 50000) * 1.05,
          isTrough: false,
        },
        ...forecastData.periods.map((p) => ({
          label: p.period_label.slice(0, 3),
          balance: p.closing_balance,
          low: p.balance_low ?? p.closing_balance * 0.85,
          high: p.balance_high ?? p.closing_balance * 1.15,
          isTrough: p.reserve_violated || false,
        })),
      ];
      return pts;
    }
    return previewPoints;
  }, [forecastData, previewPoints]);

  // Lowest projected balance & Minimum reserve
  const minReserve = forecastData?.minimum_reserve ?? 15000;
  const lowestBalance = useMemo(() => {
    if (forecastData?.minimum_balance != null) return forecastData.minimum_balance;
    return 28500;
  }, [forecastData]);

  const troughPeriod = useMemo(() => {
    if (!forecastData?.periods || forecastData.periods.length === 0) return null;
    return forecastData.periods.reduce(
      (min, p) => (p.closing_balance < min.closing_balance ? p : min),
      forecastData.periods[0]
    );
  }, [forecastData]);

  // Expected income, expenses, and surplus
  const expectedIncome = forecastData?.projected_income ?? 270000;
  const expectedExpenses = forecastData?.projected_expenses ?? 198000;
  const projectedSurplus = Math.max(0, expectedIncome - expectedExpenses);

  // Chart rendering geometry
  const screenWidth = Dimensions.get('window').width;
  const cardW = screenWidth - SIZES.padding * 2;
  const chartH = 200;
  const padL = 46;
  const padR = 20;
  const padTop = 20;
  const padBottom = 30;
  const plotW = Math.max(cardW - padL - padR, 180);
  const plotH = chartH - padTop - padBottom;
  const baseY = padTop + plotH;

  const maxVal = useMemo(() => {
    const highestVal = Math.max(
      ...chartPoints.map((p) => Math.max(p.balance, p.high)),
      minReserve,
      120000
    );
    return Math.ceil(highestVal / 25000) * 25000;
  }, [chartPoints, minReserve]);

  const getY = (val: number) =>
    Math.min(padTop + (1 - Math.max(0, Math.min(val / maxVal, 1))) * plotH, baseY);
  const getX = (index: number) =>
    padL + (index / Math.max(chartPoints.length - 1, 1)) * plotW;

  const { linePath, areaPath, rangePath } = useMemo(() => {
    if (chartPoints.length < 2) return { linePath: '', areaPath: '', rangePath: '' };

    const pts = chartPoints.map((pt, idx) => ({
      x: getX(idx),
      y: getY(pt.balance),
      yLow: getY(pt.low),
      yHigh: getY(pt.high),
    }));

    // Smooth bezier curve for expected balance
    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = p2.x - p1.x;
      const cp1x = p1.x + dx * 0.35;
      const cp2x = p2.x - dx * 0.35;
      path += ` C ${cp1x.toFixed(1)} ${p1.y.toFixed(1)}, ${cp2x.toFixed(1)} ${p2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    const firstPt = pts[0];
    const lastPt = pts[pts.length - 1];
    const aPath = `${path} L ${lastPt.x.toFixed(1)} ${baseY.toFixed(1)} L ${firstPt.x.toFixed(1)} ${baseY.toFixed(1)} Z`;

    // Upper and lower range envelope
    let upperPath = `M ${pts[0].x.toFixed(1)} ${pts[0].yHigh.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = p2.x - p1.x;
      upperPath += ` C ${(p1.x + dx * 0.35).toFixed(1)} ${p1.yHigh.toFixed(1)}, ${(p2.x - dx * 0.35).toFixed(1)} ${p2.yHigh.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.yHigh.toFixed(1)}`;
    }

    let lowerPath = `L ${lastPt.x.toFixed(1)} ${lastPt.yLow.toFixed(1)}`;
    for (let i = pts.length - 1; i > 0; i--) {
      const p1 = pts[i];
      const p2 = pts[i - 1];
      const dx = p2.x - p1.x;
      lowerPath += ` C ${(p1.x + dx * 0.35).toFixed(1)} ${p1.yLow.toFixed(1)}, ${(p2.x - dx * 0.35).toFixed(1)} ${p2.yLow.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.yLow.toFixed(1)}`;
    }
    const rPath = `${upperPath} ${lowerPath} Z`;

    return { linePath: path, areaPath: aPath, rangePath: rPath };
  }, [chartPoints, plotW, plotH]);

  const activePoint = selectedPointIndex != null ? chartPoints[selectedPointIndex] : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Back navigation and page title with (i) Info icon */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft color={COLORS.primary} size={24} />
        </TouchableOpacity>

        <Typography variant="h2" color={COLORS.primary} style={styles.headerTitle}>
          Cash Flow Forecast
        </Typography>

        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => setInfoModalVisible(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Info color={COLORS.primary} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 2. Forecast Period Selector Pill Dropdown */}
        <View style={styles.periodSelectorWrap}>
          <TouchableOpacity
            style={styles.periodPill}
            onPress={() => setDropdownOpen(!dropdownOpen)}
            activeOpacity={0.75}
          >
            <Typography variant="bodyMedium" color={COLORS.primary} style={styles.periodPillText}>
              {HORIZON_OPTIONS.find((h) => h.key === selectedHorizon)?.label}
            </Typography>
            <ChevronDown size={16} color={COLORS.primary} />
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={styles.dropdownMenu}>
              {HORIZON_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.dropdownItem,
                    selectedHorizon === opt.key && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    setSelectedHorizon(opt.key);
                    setDropdownOpen(false);
                  }}
                >
                  <Typography
                    variant="caption"
                    color={selectedHorizon === opt.key ? COLORS.white : COLORS.primary}
                    style={styles.dropdownItemText}
                  >
                    {opt.label}
                  </Typography>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* 3. Compact Financial Outlook Summary Card */}
        <ForecastSummaryCard
          message={
            lowestBalance >= minReserve
              ? 'Your projected balance stays above your minimum reserve.'
              : 'Projected balance breaches minimum reserve in upcoming month.'
          }
        />

        {/* 4. Lowest Projected Balance & Minimum Reserve Row */}
        <View style={styles.twoMetricsCard}>
          <View style={styles.metricColumn}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.metricLabel}>
              Lowest projected balance
            </Typography>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.metricBigAmount}>
              ₹{lowestBalance.toLocaleString('en-IN')}
            </Typography>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.metricSub}>
              {troughPeriod ? `in ${troughPeriod.period_label}` : 'in May 2025'}
            </Typography>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricColumn}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.metricLabel}>
              Minimum reserve
            </Typography>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.metricBigAmount}>
              ₹{minReserve.toLocaleString('en-IN')}
            </Typography>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.metricSub}>
              Your setting
            </Typography>
          </View>
        </View>

        {/* 5. Projected Cash Balance Chart */}
        <View style={styles.chartCard}>
          <Typography variant="cardHeading" color={COLORS.primary} style={styles.chartTitle}>
            Projected Cash Balance
          </Typography>

          {/* SVG Chart */}
          <View style={styles.svgWrapper}>
            <Svg height={chartH} width={cardW - 32}>
              <Defs>
                <LinearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={COLORS.gold} stopOpacity="0.18" />
                  <Stop offset="1" stopColor={COLORS.gold} stopOpacity="0.03" />
                </LinearGradient>
              </Defs>

              {/* Y Axis Grid and Labels */}
              {[maxVal, Math.round(maxVal * 0.67), Math.round(maxVal * 0.33), 0].map((val) => {
                const y = getY(val);
                const label =
                  val >= 100000
                    ? `₹${(val / 100000).toFixed(1).replace('.0', '')}L`
                    : val >= 1000
                    ? `₹${Math.round(val / 1000)}K`
                    : '₹0';
                return (
                  <G key={`y-${val}`}>
                    <Line
                      x1={padL}
                      y1={y}
                      x2={cardW - 32 - padR}
                      y2={y}
                      stroke="#F0F0EE"
                      strokeWidth={1}
                    />
                    <SvgText
                      x={padL - 8}
                      y={y + 4}
                      fill={COLORS.textSecondary}
                      fontSize={10}
                      fontFamily={FONTS.body}
                      textAnchor="end"
                    >
                      {label}
                    </SvgText>
                  </G>
                );
              })}

              {/* Minimum Reserve Dashed Horizontal Line */}
              <Line
                x1={padL}
                y1={getY(minReserve)}
                x2={cardW - 32 - padR}
                y2={getY(minReserve)}
                stroke={COLORS.gold}
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />

              {/* Range Shaded Envelope */}
              {rangePath ? <Path d={rangePath} fill="url(#rangeGrad)" /> : null}

              {/* Expected Balance Primary Curve */}
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  stroke={COLORS.primary}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              ) : null}

              {/* Chart Points / Dots */}
              {chartPoints.map((pt, idx) => {
                const cx = getX(idx);
                const cy = getY(pt.balance);
                const isSelected = selectedPointIndex === idx;
                return (
                  <G key={`pt-${idx}`}>
                    <Circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 6 : 4}
                      fill={isSelected ? COLORS.gold : COLORS.primary}
                      stroke={COLORS.white}
                      strokeWidth={2}
                      onPress={() => setSelectedPointIndex(idx)}
                    />
                    {/* X-axis label */}
                    <SvgText
                      x={cx}
                      y={baseY + 16}
                      fill={COLORS.textSecondary}
                      fontSize={10}
                      fontFamily={FONTS.body}
                      textAnchor="middle"
                    >
                      {pt.label}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          </View>

          {/* Point Tooltip on tap */}
          {activePoint && (
            <View style={styles.tooltipBox}>
              <Typography variant="caption" color={COLORS.primary} style={{ fontWeight: 'bold' }}>
                {activePoint.label}: ₹{activePoint.balance.toLocaleString('en-IN')}
              </Typography>
              <Typography variant="caption" color={COLORS.textSecondary}>
                Range: ₹{Math.round(activePoint.low).toLocaleString('en-IN')} – ₹{Math.round(activePoint.high).toLocaleString('en-IN')}
              </Typography>
            </View>
          )}

          {/* Chart Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { backgroundColor: COLORS.primary }]} />
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.legendText}>
                Expected balance
              </Typography>
            </View>

            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { backgroundColor: '#EADBB4' }]} />
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.legendText}>
                Expected range
              </Typography>
            </View>

            <View style={styles.legendItem}>
              <View style={[styles.legendDash, { borderColor: COLORS.gold }]} />
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.legendText}>
                Minimum reserve
              </Typography>
            </View>
          </View>
        </View>

        {/* 6. Expected Income, Expected Expenses, and Projected Surplus Summary */}
        <View style={styles.summaryMetricsCard}>
          <View style={styles.summaryCol}>
            <View style={styles.summaryLabelRow}>
              <ArrowUp size={14} color={COLORS.primary} />
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.summaryLabel}>
                Expected Income
              </Typography>
            </View>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.summaryAmount}>
              ₹{expectedIncome.toLocaleString('en-IN')}
            </Typography>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCol}>
            <View style={styles.summaryLabelRow}>
              <ArrowDown size={14} color={COLORS.primary} />
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.summaryLabel}>
                Expected Expenses
              </Typography>
            </View>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.summaryAmount}>
              ₹{expectedExpenses.toLocaleString('en-IN')}
            </Typography>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCol}>
            <View style={styles.summaryLabelRow}>
              <BarChart3 size={14} color={COLORS.gold} />
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.summaryLabel}>
                Projected Surplus
              </Typography>
            </View>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.summaryAmount}>
              ₹{projectedSurplus.toLocaleString('en-IN')}
            </Typography>
          </View>
        </View>

        {/* 7. Clear Forecast Safety or Uncertainty Explanation */}
        <View style={styles.safetyNoteCard}>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.safetyNoteText}>
            {forecastData?.limitations?.[0] ||
              `Projection based on confirmed income, regular expenses, and known obligations over ${horizonMonths} months.`}
          </Typography>
        </View>

        {/* 8. Separate Forecast Details Section containing EXACTLY four options */}
        <View style={styles.detailsSection}>
          <Typography variant="cardHeading" color={COLORS.primary} style={styles.detailsHeading}>
            Forecast Details
          </Typography>

          <FeatureCard
            title="Monthly Breakdown"
            description="View month-wise details"
            icon={<ListFilter size={20} color={COLORS.gold} />}
            onPress={() => router.push('/forecast/monthly-breakdown')}
          />

          <FeatureCard
            title="Scenario Analysis"
            description="Best, expected and worst case"
            icon={<BarChart2 size={20} color={COLORS.gold} />}
            onPress={() => router.push('/forecast/scenarios')}
          />

          <FeatureCard
            title="Upcoming Obligations"
            description="View known future payments"
            icon={<CalendarCheck size={20} color={COLORS.gold} />}
            onPress={() => router.push('/forecast/obligations')}
          />

          <FeatureCard
            title="Forecast Settings"
            description="Adjust inputs and preferences"
            icon={<Settings size={20} color={COLORS.gold} />}
            onPress={() => router.push('/forecast/settings')}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Info Modal */}
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setInfoModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Typography variant="h3" color={COLORS.primary} style={styles.modalTitle}>
              Cash Flow Forecast
            </Typography>
            <Typography variant="body" color={COLORS.textSecondary} style={styles.modalBody}>
              This model calculates period-by-period balances using historical recurring transactions, contractual debt obligations, and seasonal patterns to project future liquidity and safety buffer headroom.
            </Typography>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setInfoModalVisible(false)}
            >
              <Typography variant="bodyBold" color={COLORS.white}>
                Understood
              </Typography>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  infoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 6,
  },
  periodSelectorWrap: {
    alignItems: 'flex-end',
    marginBottom: 12,
    zIndex: 20,
  },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  periodPillText: {
    fontSize: 13,
    fontFamily: FONTS.bodyMedium,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 36,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    minWidth: 150,
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  dropdownItemActive: {
    backgroundColor: COLORS.primary,
  },
  dropdownItemText: {
    fontSize: 13,
  },
  twoMetricsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  metricColumn: {
    flex: 1,
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#F0F0EE',
    marginHorizontal: 14,
  },
  metricLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  metricBigAmount: {
    fontSize: 18,
    fontFamily: FONTS.bodyBold,
    marginBottom: 2,
  },
  metricSub: {
    fontSize: 11,
  },
  chartCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 14.5,
    marginBottom: 8,
  },
  svgWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipBox: {
    backgroundColor: '#FCFAF4',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFE5CC',
    marginTop: 8,
    alignItems: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F3',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendDash: {
    width: 12,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendText: {
    fontSize: 11,
  },
  summaryMetricsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#F0F0EE',
    marginHorizontal: 4,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 10.5,
    textAlign: 'center',
  },
  summaryAmount: {
    fontSize: 14.5,
    fontFamily: FONTS.bodyBold,
  },
  safetyNoteCard: {
    backgroundColor: '#F8F8F6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  safetyNoteText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  detailsSection: {
    marginTop: 4,
  },
  detailsHeading: {
    fontSize: 16,
    fontFamily: FONTS.heading,
    marginBottom: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: FONTS.heading,
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalCloseBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});
