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

const DEFAULT_SCENARIOS = [
  {
    type: 'best' as const,
    title: 'Best Case',
    description: 'Higher income and lower expenses than expected. Closing balance in 6 months.',
    projectedOutcome: '₹1,48,000',
    outcomeLabel: 'Closing balance in 6 months',
    assumptions: 'Income +10%, flexible spending -15%, zero emergency costs.',
    endingBalance: 148000,
  },
  {
    type: 'expected' as const,
    title: 'Expected Case',
    description: 'Based on most likely income and expense patterns. Closing balance in 6 months.',
    projectedOutcome: '₹1,22,000',
    outcomeLabel: 'Closing balance in 6 months',
    assumptions: 'Confirmed salary schedule and median historical spend.',
    endingBalance: 122000,
  },
  {
    type: 'worst' as const,
    title: 'Worst Case',
    description: 'Lower income, higher expenses and one unexpected cost. Closing balance in 6 months.',
    projectedOutcome: '₹28,500',
    outcomeLabel: 'Closing balance in 6 months',
    assumptions: 'Income -10%, spending +10%, one emergency cost of ₹15,000.',
    endingBalance: 28500,
  },
];

export default function ScenarioAnalysisScreen() {
  const router = useRouter();
  const [selectedHorizon, setSelectedHorizon] = useState<'3M' | '6M' | '12M'>('6M');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('expected');
  const [scenarioData, setScenarioData] = useState<ForecastScenariosResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const horizonMonths = selectedHorizon === '3M' ? 3 : selectedHorizon === '6M' ? 6 : 12;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchForecastScenarios(horizonMonths);
      setScenarioData(data);
    } catch {
      setScenarioData(null);
    } finally {
      setLoading(false);
    }
  }, [horizonMonths]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const scenarios = useMemo(() => {
    if (scenarioData?.scenarios && scenarioData.scenarios.length >= 3) {
      return scenarioData.scenarios.map((sc) => ({
        type: sc.type,
        title: sc.title,
        description: sc.description,
        projectedOutcome: `₹${Math.round(sc.ending_balance).toLocaleString('en-IN')}`,
        outcomeLabel: `Closing balance in ${horizonMonths} months`,
        assumptions: sc.assumptions_summary,
        endingBalance: sc.ending_balance,
      }));
    }
    return DEFAULT_SCENARIOS;
  }, [scenarioData, horizonMonths]);

  const bestVal = scenarios.find((s) => s.type === 'best')?.endingBalance || 148000;
  const expectedVal = scenarios.find((s) => s.type === 'expected')?.endingBalance || 122000;
  const worstVal = scenarios.find((s) => s.type === 'worst')?.endingBalance || 28500;
  const minReserve = scenarioData?.minimum_reserve ?? 15000;
  const probRisk = scenarioData?.probability_of_running_out_of_cash ?? 8;

  const maxVal = Math.max(bestVal, expectedVal, worstVal, minReserve, 100000);
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

        {/* Preview State Badge */}
        <View style={styles.previewBadge}>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.previewText}>
            Simulated Path Distribution • Scenario Preview
          </Typography>
        </View>

        {/* Scenario Comparison Chart */}
        <View style={styles.chartCard}>
          <Typography variant="cardHeading" color={COLORS.primary} style={styles.chartTitle}>
            Projected Ending Cash by Scenario
          </Typography>

          <Svg height={130} width="100%" viewBox="0 0 320 130">
            {/* Best Case Bar */}
            <SvgText x={10} y={26} fill={COLORS.textSecondary} fontSize={11} fontFamily={FONTS.body}>
              Best
            </SvgText>
            <Rect x={70} y={15} width={getBarWidth(bestVal)} height={16} rx={4} fill={COLORS.gold} />
            <SvgText
              x={Math.min(270, 75 + getBarWidth(bestVal))}
              y={27}
              fill={COLORS.primary}
              fontSize={10}
              fontWeight="bold"
            >
              {formatShort(bestVal)}
            </SvgText>

            {/* Expected Case Bar */}
            <SvgText x={10} y={61} fill={COLORS.textSecondary} fontSize={11} fontFamily={FONTS.body}>
              Expected
            </SvgText>
            <Rect x={70} y={50} width={getBarWidth(expectedVal)} height={16} rx={4} fill={COLORS.primary} />
            <SvgText
              x={Math.min(270, 75 + getBarWidth(expectedVal))}
              y={62}
              fill={COLORS.primary}
              fontSize={10}
              fontWeight="bold"
            >
              {formatShort(expectedVal)}
            </SvgText>

            {/* Worst Case Bar */}
            <SvgText x={10} y={96} fill={COLORS.textSecondary} fontSize={11} fontFamily={FONTS.body}>
              Worst
            </SvgText>
            <Rect x={70} y={85} width={getBarWidth(worstVal)} height={16} rx={4} fill="#8A92A6" />
            <SvgText
              x={Math.min(270, 75 + getBarWidth(worstVal))}
              y={97}
              fill={COLORS.primary}
              fontSize={10}
              fontWeight="bold"
            >
              {formatShort(worstVal)}
            </SvgText>

            {/* Minimum Reserve Benchmark Line */}
            {(() => {
              const resX = 70 + Math.min(220, (minReserve / maxVal) * 220);
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
                    Reserve ({formatShort(minReserve)})
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
                Probability of running out of cash
              </Typography>
              <Info size={14} color={COLORS.textSecondary} style={{ marginLeft: 4 }} />
            </View>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.probPercent}>
              {probRisk}%
            </Typography>
          </View>

          {/* Clean Progress Track */}
          <View style={styles.track}>
            <View style={[styles.progress, { width: `${Math.max(2, Math.min(100, probRisk))}%` }]} />
          </View>

          <Typography variant="caption" color={COLORS.textSecondary} style={styles.probNote}>
            Calculated across N=500 simulated stress-test paths over {horizonMonths} months with your current ₹{minReserve.toLocaleString('en-IN')} minimum reserve.
          </Typography>
        </View>

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
