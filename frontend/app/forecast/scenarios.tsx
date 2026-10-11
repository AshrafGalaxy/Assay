import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { ScenarioCard, ScenarioType } from '../../components/fi/ScenarioCard';
import {
  fetchForecastScenarios,
  ForecastScenariosResponse,
  formatINR,
} from '../../services/finance';
import { ChevronLeft, ChevronDown, Info } from 'lucide-react-native';

type ScenarioViewModel = {
  type: ScenarioType;
  title: string;
  description: string;
  projectedOutcome: string;
  outcomeLabel: string;
  assumptions: string;
  endingBalance: number;
};

export default function ScenarioAnalysisScreen() {
  const router = useRouter();
  const [selectedHorizon, setSelectedHorizon] = useState<'3M' | '6M' | '12M'>('6M');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('expected');
  const [scenarioData, setScenarioData] = useState<ForecastScenariosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const horizonMonths = selectedHorizon === '3M' ? 3 : selectedHorizon === '6M' ? 6 : 12;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const data = await fetchForecastScenarios(horizonMonths);
      setScenarioData(data);
    } catch {
      setScenarioData(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [horizonMonths]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Scenario cards are built only from the API response.
  const scenarios = useMemo<ScenarioViewModel[]>(() => {
    if (!scenarioData?.scenarios) return [];
    return scenarioData.scenarios
      .filter((sc): sc is typeof sc & { type: ScenarioType } =>
        sc.type === 'best' || sc.type === 'expected' || sc.type === 'worst',
      )
      .map((sc) => ({
        type: sc.type,
        title: sc.title,
        description: sc.description,
        projectedOutcome: formatINR(Math.round(sc.ending_balance)),
        outcomeLabel: `Expected Cash in ${scenarioData.horizon_months} months`,
        assumptions: sc.assumptions_summary,
        endingBalance: sc.ending_balance,
      }));
  }, [scenarioData]);

  const bestVal = scenarios.find((s) => s.type === 'best')?.endingBalance ?? null;
  const expectedVal = scenarios.find((s) => s.type === 'expected')?.endingBalance ?? null;
  const worstVal = scenarios.find((s) => s.type === 'worst')?.endingBalance ?? null;
  const minReserve = scenarioData?.minimum_reserve ?? null;
  const probRisk = scenarioData?.probability_of_running_out_of_cash ?? null;
  const chart =
    bestVal != null && expectedVal != null && worstVal != null && minReserve != null
      ? { best: bestVal, expected: expectedVal, worst: worstVal, reserve: minReserve }
      : null;
  const hasScenarioData = chart != null;

  // Bar scale derived from the plotted values only (chart geometry).
  const maxVal = chart ? Math.max(1, chart.best, chart.expected, chart.worst, chart.reserve) : 1;
  const getBarWidth = (val: number) =>
    Math.max(20, Math.min(220, (Math.max(0, val) / maxVal) * 220));

  const formatShort = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(2).replace(/\.?0+$/, '')}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1).replace(/\.?0+$/, '')}K`;
    return `₹${Math.round(val)}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
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
          Forecast Scenarios
        </Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Horizon Dropdown */}
        <View style={styles.selectorContainer}>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setDropdownOpen(!dropdownOpen)}
            activeOpacity={0.75}
          >
            <Typography variant="bodyMedium" color={COLORS.primary} style={styles.dropdownText}>
              Next {selectedHorizon === '3M' ? '3 Months' : selectedHorizon === '6M' ? '6 Months' : '12 Months'}
            </Typography>
            <ChevronDown size={16} color={COLORS.primary} />
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={styles.dropdownMenu}>
              {(['3M', '6M', '12M'] as const).map((h) => (
                <TouchableOpacity
                  key={h}
                  style={[styles.dropdownItem, selectedHorizon === h && styles.dropdownItemActive]}
                  onPress={() => {
                    setSelectedHorizon(h);
                    setDropdownOpen(false);
                  }}
                >
                  <Typography
                    variant="caption"
                    color={selectedHorizon === h ? COLORS.white : COLORS.primary}
                    style={styles.dropdownItemText}
                  >
                    Next {h === '3M' ? '3 Months' : h === '6M' ? '6 Months' : '12 Months'}
                  </Typography>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {loading && (
          <View style={styles.stateCard}>
            <ActivityIndicator color={COLORS.primary} />
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.stateText}>
              Loading scenarios…
            </Typography>
          </View>
        )}

        {!loading && loadError && (
          <View style={styles.stateCard}>
            <Typography variant="bodyBold" color={COLORS.primary}>
              Scenarios unavailable
            </Typography>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.stateText}>
              We couldn't load scenario analysis. Check your connection and try again.
            </Typography>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void loadData()} activeOpacity={0.8}>
              <Typography variant="bodyBold" color={COLORS.white}>Retry</Typography>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !loadError && scenarioData && !hasScenarioData && (
          <View style={styles.stateCard}>
            <Typography variant="bodyBold" color={COLORS.primary}>
              No scenarios yet
            </Typography>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.stateText}>
              The forecast engine did not return best/expected/worst scenarios for this horizon. Add transactions to build a projection.
            </Typography>
          </View>
        )}

        {!loading && !loadError && scenarioData && hasScenarioData && (
          <>
        {/* Scenario Comparison Chart */}
        <View style={styles.chartCard}>
          <Typography variant="cardHeading" color={COLORS.primary} style={styles.chartTitle}>
            Expected Cash by Scenario
          </Typography>

          <Svg height={130} width="100%" viewBox="0 0 320 130">
            {/* Best Case Bar */}
            <SvgText x={10} y={26} fill={COLORS.textSecondary} fontSize={11} fontFamily={FONTS.body}>
              Best
            </SvgText>
            <Rect x={70} y={15} width={getBarWidth(chart!.best)} height={16} rx={4} fill={COLORS.gold} />
            <SvgText
              x={Math.min(270, 75 + getBarWidth(chart!.best))}
              y={27}
              fill={COLORS.primary}
              fontSize={10}
              fontWeight="bold"
            >
              {formatShort(chart!.best)}
            </SvgText>

            {/* Expected Case Bar */}
            <SvgText x={10} y={61} fill={COLORS.textSecondary} fontSize={11} fontFamily={FONTS.body}>
              Expected
            </SvgText>
            <Rect x={70} y={50} width={getBarWidth(chart!.expected)} height={16} rx={4} fill={COLORS.primary} />
            <SvgText
              x={Math.min(270, 75 + getBarWidth(chart!.expected))}
              y={62}
              fill={COLORS.primary}
              fontSize={10}
              fontWeight="bold"
            >
              {formatShort(chart!.expected)}
            </SvgText>

            {/* Worst Case Bar */}
            <SvgText x={10} y={96} fill={COLORS.textSecondary} fontSize={11} fontFamily={FONTS.body}>
              Worst
            </SvgText>
            <Rect x={70} y={85} width={getBarWidth(chart!.worst)} height={16} rx={4} fill="#8A92A6" />
            <SvgText
              x={Math.min(270, 75 + getBarWidth(chart!.worst))}
              y={97}
              fill={COLORS.primary}
              fontSize={10}
              fontWeight="bold"
            >
              {formatShort(chart!.worst)}
            </SvgText>

            {/* Minimum Reserve Benchmark Line */}
            {(() => {
              const resX = 70 + Math.min(220, (chart!.reserve / maxVal) * 220);
              return (
                <>
                  <Line
                    x1={resX}
                    y1={5}
                    x2={resX}
                    y2={110}
                    stroke={COLORS.gold}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                  <SvgText x={Math.min(240, resX + 4)} y={120} fill={COLORS.gold} fontSize={9}>
                    Safety Buffer ({formatShort(chart!.reserve)})
                  </SvgText>
                </>
              );
            })()}
          </Svg>
        </View>

        {/* The 3 Scenario Cards */}
        <View style={styles.cardsList}>
          {scenarios.map((sc) => (
            <ScenarioCard
              key={sc.type}
              type={sc.type}
              title={sc.title}
              description={sc.description}
              projectedOutcome={sc.projectedOutcome}
              outcomeLabel={sc.outcomeLabel}
              assumptions={sc.assumptions}
              isSelected={activeScenario === sc.type}
              onPress={() => setActiveScenario(sc.type)}
            />
          ))}
        </View>

        {/* Shortfall Risk / Probability Card */}
        <View style={styles.probabilityCard}>
          <View style={styles.probHeader}>
            <View style={styles.probTitleRow}>
              <Typography variant="bodyBold" color={COLORS.primary} style={styles.probTitle}>
                Risk of Running Short
              </Typography>
              <Info size={14} color={COLORS.textSecondary} style={{ marginLeft: 4 }} />
            </View>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.probPercent}>
              {scenarioData.probability_of_running_out_of_cash}%
            </Typography>
          </View>

          {/* Clean Progress Track */}
          <View style={styles.track}>
            <View style={[styles.progress, { width: `${Math.max(2, Math.min(100, scenarioData.probability_of_running_out_of_cash))}%` }]} />
          </View>

          <Typography variant="caption" color={COLORS.textSecondary} style={styles.probNote}>
            {scenarioData?.calculation_basis
              ? `${scenarioData.calculation_basis} over ${horizonMonths} months with your Safety Buffer of ₹${chart!.reserve.toLocaleString('en-IN')}.`
              : `Projected over ${horizonMonths} months with your Safety Buffer of ₹${chart!.reserve.toLocaleString('en-IN')}.`}
          </Typography>
        </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  stateText: {
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingTop: 8,
    paddingBottom: 12,
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
  scrollContent: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 8,
  },
  selectorContainer: {
    alignItems: 'center',
    marginBottom: 10,
    zIndex: 10,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownText: {
    fontSize: 13.5,
    fontFamily: FONTS.bodyMedium,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 40,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    minWidth: 160,
    zIndex: 20,
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
  previewBadge: {
    alignItems: 'center',
    marginBottom: 14,
  },
  previewText: {
    fontSize: 11.5,
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
    fontSize: 14,
    marginBottom: 8,
  },
  cardsList: {
    gap: 4,
    marginBottom: 16,
  },
  probabilityCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  probHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  probTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  probTitle: {
    fontSize: 13.5,
  },
  probPercent: {
    fontSize: 16,
    fontFamily: FONTS.bodyBold,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EAEAE8',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progress: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 4,
  },
  probNote: {
    fontSize: 11.5,
    lineHeight: 16,
  },
});
