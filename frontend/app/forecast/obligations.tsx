import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { ObligationRow, ObligationItem } from '../../components/fi/ObligationRow';
import {
  fetchUpcomingObligations,
  UpcomingObligationItem,
} from '../../services/finance';
import { ChevronLeft } from 'lucide-react-native';

const OBLIGATIONS_6M: ObligationItem[] = [
  {
    id: '1',
    name: 'Rent Payment',
    dueDate: '1 Apr 2025',
    amount: 18000,
    type: 'rent',
    recurrence: 'Auto-debit',
  },
  {
    id: '2',
    name: 'Car EMI',
    dueDate: '5 Apr 2025',
    amount: 6000,
    type: 'emi',
    recurrence: 'HDFC Auto Loan',
  },
  {
    id: '3',
    name: 'Credit Card Payment',
    dueDate: '10 Apr 2025',
    amount: 2000,
    type: 'credit_card',
    recurrence: 'Min Due • Axis Bank',
  },
  {
    id: '4',
    name: 'Insurance Premium',
    dueDate: '25 Apr 2025',
    amount: 12000,
    type: 'insurance',
    recurrence: 'Annual • HDFC ERGO',
  },
  {
    id: '5',
    name: 'Rent Payment',
    dueDate: '1 May 2025',
    amount: 18000,
    type: 'rent',
    recurrence: 'Auto-debit',
  },
  {
    id: '6',
    name: 'Loan EMI',
    dueDate: '5 May 2025',
    amount: 6000,
    type: 'emi',
    recurrence: 'HDFC Auto Loan',
  },
  {
    id: '7',
    name: 'Credit Card Payment',
    dueDate: '10 May 2025',
    amount: 2000,
    type: 'credit_card',
    recurrence: 'Min Due • Axis Bank',
  },
  {
    id: '8',
    name: 'Annual Subscription',
    dueDate: '20 May 2025',
    amount: 4000,
    type: 'subscription',
    recurrence: 'Annual • Cloud Services',
  },
];

const OBLIGATIONS_12M: ObligationItem[] = [
  ...OBLIGATIONS_6M,
  {
    id: '9',
    name: 'Rent Payment',
    dueDate: '1 Jun 2025',
    amount: 18000,
    type: 'rent',
    recurrence: 'Auto-debit',
  },
  {
    id: '10',
    name: 'Loan EMI',
    dueDate: '5 Jun 2025',
    amount: 6000,
    type: 'emi',
    recurrence: 'HDFC Auto Loan',
  },
  {
    id: '11',
    name: 'Life Insurance',
    dueDate: '15 Jul 2025',
    amount: 15000,
    type: 'insurance',
    recurrence: 'Term Plan',
  },
];

export default function UpcomingObligationsScreen() {
  const router = useRouter();
  const [filterPeriod, setFilterPeriod] = useState<'6M' | '12M'>('6M');
  const [apiData, setApiData] = useState<{
    horizon_months: number;
    total_commitments: number;
    count: number;
    obligations: UpcomingObligationItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchUpcomingObligations(filterPeriod === '6M' ? 6 : 12);
      setApiData(res);
    } catch {
      setApiData(null);
    } finally {
      setLoading(false);
    }
  }, [filterPeriod]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeList: ObligationItem[] = useMemo(() => {
    if (apiData?.obligations && apiData.obligations.length > 0) {
      return apiData.obligations.map((ob) => ({
        id: ob.id,
        name: ob.name,
        dueDate: ob.due_date,
        amount: ob.amount,
        type: (ob.type as 'rent' | 'emi' | 'credit_card' | 'insurance' | 'subscription') || 'emi',
        recurrence: ob.recurrence,
      }));
    }
    return filterPeriod === '6M' ? OBLIGATIONS_6M : OBLIGATIONS_12M;
  }, [apiData, filterPeriod]);

  const totalAmount =
    apiData?.total_commitments ?? activeList.reduce((sum, item) => sum + item.amount, 0);
  const paymentCount = apiData?.count ?? activeList.length;

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
          Upcoming Obligations
        </Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Filter Pills */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterPill, filterPeriod === '6M' && styles.filterPillActive]}
            onPress={() => setFilterPeriod('6M')}
            activeOpacity={0.75}
          >
            <Typography
              variant="bodyMedium"
              color={filterPeriod === '6M' ? COLORS.white : COLORS.textSecondary}
              style={styles.filterPillText}
            >
              Next 6 Months
            </Typography>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, filterPeriod === '12M' && styles.filterPillActive]}
            onPress={() => setFilterPeriod('12M')}
            activeOpacity={0.75}
          >
            <Typography
              variant="bodyMedium"
              color={filterPeriod === '12M' ? COLORS.white : COLORS.textSecondary}
              style={styles.filterPillText}
            >
              Next 12 Months
            </Typography>
          </TouchableOpacity>
        </View>

        {/* Commitment Summary Card */}
        <View style={styles.summaryCard}>
          <View>
            <Typography variant="caption" color={COLORS.textSecondary}>
              Total Contractual Commitments
            </Typography>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.totalAmount}>
              ₹{totalAmount.toLocaleString('en-IN')}
            </Typography>
          </View>
          <View style={styles.badge}>
            <Typography variant="caption" color={COLORS.primary} style={styles.badgeText}>
              {paymentCount} Payments
            </Typography>
          </View>
        </View>

        {/* Obligations List */}
        <View style={styles.listContainer}>
          {activeList.map((item) => (
            <ObligationRow key={item.id} item={item} />
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
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: 13.5,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  totalAmount: {
    fontSize: 20,
    fontFamily: FONTS.bodyBold,
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: FONTS.bodyMedium,
  },
  listContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
