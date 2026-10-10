import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { MonthlyBreakdownCard, MonthlyBreakdownData } from '../../components/fi/MonthlyBreakdownCard';
import { fetchCashFlowForecast, CashFlowForecast } from '../../services/finance';
import { ChevronLeft, ChevronDown } from 'lucide-react-native';

const PREVIEW_MONTHS: MonthlyBreakdownData[] = [
  {
    month: 'April 2025',
    openingBalance: 50000,
    income: 45000,
    expenses: 27000,
    debtPayments: 6000,
    closingBalance: 62000,
  },
  {
    month: 'May 2025',
    openingBalance: 62000,
    income: 45000,
    expenses: 27000,
    debtPayments: 6000,
    closingBalance: 74000,
    isTrough: true,
  },
  {
    month: 'June 2025',
    openingBalance: 74000,
    income: 45000,
    expenses: 27000,
    debtPayments: 6000,
    closingBalance: 86000,
  },
  {
    month: 'July 2025',
    openingBalance: 86000,
    income: 45000,
    expenses: 27000,
    debtPayments: 6000,
    closingBalance: 98000,
  },
  {
    month: 'August 2025',
    openingBalance: 98000,
    income: 45000,
    expenses: 27000,
    debtPayments: 6000,
    closingBalance: 110000,
  },
  {
    month: 'September 2025',
    openingBalance: 110000,
    income: 45000,
    expenses: 27000,
    debtPayments: 6000,
    closingBalance: 122000,
  },
];

export default function MonthlyBreakdownScreen() {
  const router = useRouter();
  const [selectedHorizon, setSelectedHorizon] = useState<'3M' | '6M' | '12M'>('6M');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [forecastData, setForecastData] = useState<CashFlowForecast | null>(null);
  const [loading, setLoading] = useState(true);

  const horizonMonths = selectedHorizon === '3M' ? 3 : selectedHorizon === '6M' ? 6 : 12;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchCashFlowForecast(horizonMonths);
      setForecastData(data);
    } catch {
      setForecastData(null);
    } finally {
      setLoading(false);
    }
  }, [horizonMonths]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const monthsToShow: MonthlyBreakdownData[] = useMemo(() => {
    if (forecastData?.periods && forecastData.periods.length > 0) {
      return forecastData.periods.map((p) => ({
        month: p.period_label,
        openingBalance: p.opening_balance,
        income: p.income,
        expenses: p.essential_expenses + p.discretionary_spending,
        debtPayments: p.mandatory_debt,
        closingBalance: p.closing_balance,
        isTrough: p.reserve_violated || p.closing_balance === forecastData.minimum_balance,
      }));
    }
    return selectedHorizon === '3M'
      ? PREVIEW_MONTHS.slice(0, 3)
      : selectedHorizon === '6M'
      ? PREVIEW_MONTHS.slice(0, 6)
      : PREVIEW_MONTHS;
  }, [forecastData, selectedHorizon]);

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
          Monthly Breakdown
        </Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Horizon Dropdown Selector */}
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

        {/* Informative Header Description */}
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.infoCaption}>
          Monthly projected cash accounting for opening balance, expected inflows, bills, and mandatory debt obligations.
        </Typography>

        {/* Expandable Monthly Cards */}
        <View style={styles.list}>
          {monthsToShow.map((m, idx) => (
            <MonthlyBreakdownCard
              key={m.month}
              data={m}
              initiallyExpanded={idx === 0}
            />
          ))}
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
    marginBottom: 12,
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
  infoCaption: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  list: {
    gap: 4,
  },
});
