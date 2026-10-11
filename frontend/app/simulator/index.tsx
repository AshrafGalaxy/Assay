import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS } from '../../constants/theme';
import {
  WhatIfAssumptions,
  WhatIfResponse,
  formatINR,
  runWhatIfSimulation,
} from '../../services/finance';
import {
  ChevronLeft,
  Info,
  Briefcase,
  ShoppingCart,
  FileText,
  ShieldCheck,
  AlertCircle,
  PiggyBank,
  Sparkles,
  X,
} from 'lucide-react-native';

type SegmentTab = 'Income' | 'Expenses' | 'One-time' | 'Savings';

function AmountInput({
  value,
  onChangeValue,
}: {
  value: number;
  onChangeValue: (next: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <TextInput
      style={styles.amountInput}
      keyboardType="number-pad"
      value={focused ? draft : formatINR(value)}
      onFocus={() => {
        setFocused(true);
        setDraft(value > 0 ? String(Math.round(value)) : '');
      }}
      onChangeText={(raw) => {
        const digits = raw.replace(/[^0-9]/g, '');
        setDraft(digits);
        onChangeValue(digits ? parseInt(digits, 10) : 0);
      }}
      onBlur={() => setFocused(false)}
      selectTextOnFocus
      placeholder="₹0"
      placeholderTextColor="#9CA3AF"
    />
  );
}

export default function WhatIfSimulatorScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SegmentTab>('Income');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Core financial values
  const [monthlyIncome, setMonthlyIncome] = useState<number>(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState<number>(0);
  const [monthlyDebt, setMonthlyDebt] = useState<number>(0);
  const [oneTimeExpense, setOneTimeExpense] = useState<number>(0);
  const [voluntarySavings, setVoluntarySavings] = useState<number>(0);

  // Baseline values loaded from backend
  const [baselineIncome, setBaselineIncome] = useState<number>(0);
  const [baselineExpenses, setBaselineExpenses] = useState<number>(0);
  const [baselineDebt, setBaselineDebt] = useState<number>(0);
  const [baselineSavings, setBaselineSavings] = useState<number>(0);
  const seededFromLedger = useRef(false);
  const userEdited = useRef(false);

  // Default baseline assumptions
  const defaultAssumptions: WhatIfAssumptions = useMemo(() => ({
    horizon_months: 6,
    discretionary_reduction_pct: 0,
    extra_debt_payment: 0,
    savings_contribution_delta: 0,
    income_change_pct: 0,
    essential_expense_shock: 0,
    minimum_reserve: null,
    savings_target: null,
  }), []);

  const markEdited = (apply: (next: number) => void) => (next: number) => {
    userEdited.current = true;
    apply(next);
  };

  // Absolute monthly amounts. Percent cuts and one-month shocks left both cash
  // figures on the same path, so a typed change produced a ₹0 difference.
  const buildCurrentAssumptions = useCallback((): WhatIfAssumptions => {
    const unchanged =
      monthlyIncome === baselineIncome &&
      monthlyExpenses === baselineExpenses &&
      monthlyDebt === baselineDebt &&
      voluntarySavings === baselineSavings &&
      oneTimeExpense === 0;
    if (unchanged) return defaultAssumptions;
    return {
      ...defaultAssumptions,
      monthly_income: monthlyIncome,
      monthly_spending: monthlyExpenses,
      monthly_debt: monthlyDebt,
      monthly_savings: voluntarySavings,
      one_time_expense: oneTimeExpense,
    };
  }, [
    defaultAssumptions,
    baselineIncome,
    monthlyIncome,
    baselineExpenses,
    monthlyExpenses,
    monthlyDebt,
    baselineDebt,
    voluntarySavings,
    oneTimeExpense,
    baselineSavings,
  ]);

  const fetchSimulation = useCallback(async (assumptions: WhatIfAssumptions) => {
    try {
      const data = await runWhatIfSimulation(assumptions);
      setResult(data);
      setLoadError(false);

      if (data.baseline_run_rate) {
        const bInc = Math.round(data.baseline_run_rate.income || 0);
        const bEss = Math.round(data.baseline_run_rate.essential || 0);
        const bDisc = Math.round(data.baseline_run_rate.discretionary || 0);
        const bDebt = Math.round(data.baseline_run_rate.emi || 0);
        const bSav = Math.round(data.baseline_run_rate.savings || 0);
        const bExp = bEss + bDisc;

        setBaselineIncome(bInc);
        setBaselineExpenses(bExp);
        setBaselineDebt(bDebt);
        setBaselineSavings(bSav);
        if (!seededFromLedger.current) {
          setMonthlyIncome(bInc);
          setMonthlyExpenses(bExp);
          setMonthlyDebt(bDebt);
          setVoluntarySavings(bSav);
          seededFromLedger.current = true;
        }
      }
    } catch {
      setLoadError(true);
      setResult(null);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchSimulation(defaultAssumptions).finally(() => setLoading(false));
  }, [defaultAssumptions, fetchSimulation]);

  useEffect(() => {
    if (!userEdited.current) return;
    const handle = setTimeout(() => {
      void fetchSimulation(buildCurrentAssumptions());
    }, 400);
    return () => clearTimeout(handle);
  }, [
    monthlyIncome,
    monthlyExpenses,
    monthlyDebt,
    oneTimeExpense,
    voluntarySavings,
    buildCurrentAssumptions,
    fetchSimulation,
  ]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const assumptions = buildCurrentAssumptions();
      await fetchSimulation(assumptions);
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => {
    userEdited.current = false;
    setMonthlyIncome(baselineIncome);
    setMonthlyExpenses(baselineExpenses);
    setMonthlyDebt(baselineDebt);
    setOneTimeExpense(0);
    setVoluntarySavings(baselineSavings);
    void fetchSimulation(defaultAssumptions);
  };

  // Expected Cash is the untouched transaction projection. Revised Expected Cash
  // is the same horizon with the typed monthly amounts.
  const baselineClosing = result?.status_quo?.ending_balance ?? null;
  const revisedClosing = result?.user_plan?.ending_balance ?? null;
  const revisedLow = result?.user_plan?.minimum_balance ?? revisedClosing;
  const netChange = baselineClosing != null && revisedClosing != null ? revisedClosing - baselineClosing : null;
  const reserveThreshold = result?.minimum_reserve ?? null;
  const breachesReserve = revisedLow != null && reserveThreshold != null && revisedLow < reserveThreshold;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      {/* 2. Page Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft color={COLORS.primary} size={26} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => setShowInfoModal(true)}
          activeOpacity={0.7}
        >
          <Info color={COLORS.primary} size={22} />
        </TouchableOpacity>
      </View>

      {loadError && (
        <View style={styles.titleSection}>
          <Typography variant="body" color={COLORS.textSecondary}>
            Couldn't load your plan from your transactions. Check the connection and try again.
          </Typography>
        </View>
      )}

      <View style={styles.titleSection}>
        <Typography variant="h1" color={COLORS.primary} style={styles.pageTitle}>
          Update My Plan
        </Typography>
        <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
          Expected Cash stays on your transactions. Revised Expected Cash follows the amounts you type.
        </Typography>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 3. Assumption Selector (4 horizontal segmented controls) */}
        <View style={styles.segmentedContainer}>
          {(['Income', 'Expenses', 'One-time', 'Savings'] as SegmentTab[]).map((tab) => {
            const isSelected = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.segmentButton,
                  isSelected ? styles.segmentButtonActive : styles.segmentButtonInactive,
                ]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Typography
                  variant="caption"
                  style={[
                    styles.segmentText,
                    isSelected ? styles.segmentTextActive : styles.segmentTextInactive,
                  ]}
                >
                  {tab}
                </Typography>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 4 & 5. Main Adjustment Cards with Signature iPhone-Style Glass Sliders */}
        {activeTab === 'Income' && (
          <View style={styles.cardsStack}>
            {/* Card 1: Monthly Income */}
            <View style={styles.controlCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <Briefcase color={COLORS.gold} size={18} />
                </View>
                <View style={styles.cardHeaderTextCol}>
                  <Typography variant="bodyBold" color={COLORS.primary} style={styles.cardTitle}>
                    Monthly Income
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Type your monthly income.
                  </Typography>
                </View>
              </View>

              <AmountInput value={monthlyIncome} onChangeValue={markEdited(setMonthlyIncome)} />
            </View>

            {/* Card 2: Monthly Expenses */}
            <View style={styles.controlCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <ShoppingCart color={COLORS.gold} size={18} />
                </View>
                <View style={styles.cardHeaderTextCol}>
                  <Typography variant="bodyBold" color={COLORS.primary} style={styles.cardTitle}>
                    Monthly Spending & Bills
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Type your monthly spending and bills.
                  </Typography>
                </View>
              </View>

              <AmountInput value={monthlyExpenses} onChangeValue={markEdited(setMonthlyExpenses)} />
            </View>

            {/* Card 3: Monthly Debt Payments */}
            <View style={styles.controlCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <FileText color={COLORS.gold} size={18} />
                </View>
                <View style={styles.cardHeaderTextCol}>
                  <Typography variant="bodyBold" color={COLORS.primary} style={styles.cardTitle}>
                    Monthly Debt Payments
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Type your monthly debt payments.
                  </Typography>
                </View>
              </View>

              <AmountInput value={monthlyDebt} onChangeValue={markEdited(setMonthlyDebt)} />
            </View>
          </View>
        )}

        {activeTab === 'Expenses' && (
          <View style={styles.cardsStack}>
            <View style={styles.controlCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <ShoppingCart color={COLORS.gold} size={18} />
                </View>
                <View style={styles.cardHeaderTextCol}>
                  <Typography variant="bodyBold" color={COLORS.primary} style={styles.cardTitle}>
                    Monthly Spending & Bills
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Essential and discretionary monthly budget.
                  </Typography>
                </View>
              </View>

              <AmountInput value={monthlyExpenses} onChangeValue={markEdited(setMonthlyExpenses)} />
            </View>

            <View style={styles.controlCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <FileText color={COLORS.gold} size={18} />
                </View>
                <View style={styles.cardHeaderTextCol}>
                  <Typography variant="bodyBold" color={COLORS.primary} style={styles.cardTitle}>
                    Mandatory Debt & EMI
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Contractual loan & credit repayments.
                  </Typography>
                </View>
              </View>

              <AmountInput value={monthlyDebt} onChangeValue={markEdited(setMonthlyDebt)} />
            </View>
          </View>
        )}

        {activeTab === 'One-time' && (
          <View style={styles.cardsStack}>
            <View style={styles.controlCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <AlertCircle color={COLORS.gold} size={18} />
                </View>
                <View style={styles.cardHeaderTextCol}>
                  <Typography variant="bodyBold" color={COLORS.primary} style={styles.cardTitle}>
                    One-Time Planned Shock
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Unforeseen repair, medical fee or milestone purchase.
                  </Typography>
                </View>
              </View>

              <AmountInput value={oneTimeExpense} onChangeValue={markEdited(setOneTimeExpense)} />
            </View>
          </View>
        )}

        {activeTab === 'Savings' && (
          <View style={styles.cardsStack}>
            <View style={styles.controlCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <PiggyBank color={COLORS.gold} size={18} />
                </View>
                <View style={styles.cardHeaderTextCol}>
                  <Typography variant="bodyBold" color={COLORS.primary} style={styles.cardTitle}>
                    Voluntary Monthly Savings
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Regular allocation to your emergency fund or investments.
                  </Typography>
                </View>
              </View>

              <AmountInput value={voluntarySavings} onChangeValue={markEdited(setVoluntarySavings)} />
            </View>
          </View>
        )}

        {/* 6. Immediate Financial Feedback — WITHOUT A GRAPH */}
        <View style={styles.feedbackCard}>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.feedbackHeaderTitle}>
            6-month cash
          </Typography>

          <View style={styles.feedbackGrid}>
            <View style={styles.feedbackRow}>
              <Typography variant="body" color={COLORS.textSecondary}>
                Expected Cash
              </Typography>
              <Typography variant="bodyBold" color={COLORS.primary}>
                {baselineClosing != null ? formatINR(baselineClosing) : '—'}
              </Typography>
            </View>

            <View style={styles.feedbackRow}>
              <Typography variant="body" color={COLORS.textSecondary}>
                Revised Expected Cash
              </Typography>
              <Typography variant="bodyBold" color={COLORS.primary}>
                {revisedClosing != null ? formatINR(revisedClosing) : '—'}
              </Typography>
            </View>

            <View style={styles.divider} />

            <View style={styles.feedbackRow}>
              <Typography variant="bodyBold" color={COLORS.primary}>
                Net hypothetical change
              </Typography>
              <Typography
                variant="bodyBold"
                style={{
                  color: (netChange ?? 0) >= 0 ? COLORS.primary : '#B91C1C',
                }}
              >
                {netChange == null
                  ? '—'
                  : netChange >= 0
                    ? `+${formatINR(netChange)}`
                    : `-${formatINR(Math.abs(netChange))}`}
              </Typography>
            </View>
          </View>

          <View style={styles.reserveNotice}>
            <ShieldCheck color={breachesReserve ? '#B91C1C' : COLORS.gold} size={16} />
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.reserveNoticeText}>
              {reserveThreshold == null || revisedClosing == null
                ? 'Expected Cash appears once your transactions have loaded.'
                : breachesReserve
                  ? `Revised Expected Cash falls below your Safety Buffer of ${formatINR(reserveThreshold)}.`
                  : `Money Above Buffer stays positive against your Safety Buffer of ${formatINR(reserveThreshold)}.`}
            </Typography>
          </View>
        </View>

        {/* 7. Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            disabled={applying}
            activeOpacity={0.85}
          >
            {applying ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Typography variant="bodyBold" style={styles.applyButtonText}>
                Update My Plan
              </Typography>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
            activeOpacity={0.8}
          >
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.resetButtonText}>
              Reset
            </Typography>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Typography variant="bodyBold" color={COLORS.primary}>
                About Update My Plan
              </Typography>
              <TouchableOpacity onPress={() => setShowInfoModal(false)}>
                <X color={COLORS.primary} size={20} />
              </TouchableOpacity>
            </View>
            <Typography variant="body" color={COLORS.textSecondary} style={{ lineHeight: 20, marginTop: 8 }}>
              Update My Plan lets you try changes to Monthly Income, Monthly Spending & Bills, and savings, then see the effect on Expected Cash and your Safety Buffer. Your transactions stay unchanged until you save.
            </Typography>
            <Typography variant="caption" color={COLORS.textSecondary} style={{ marginTop: 12 }}>
              All calculations are deterministic and powered by your ASSAY forecast engine.
            </Typography>
            <TouchableOpacity
              style={[styles.modalConfirmBtn, { marginTop: 16 }]}
              onPress={() => setShowInfoModal(false)}
            >
              <Typography variant="bodyBold" style={{ color: '#FFFFFF' }}>
                Got it
              </Typography>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  infoBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  titleSection: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
  },
  pageTitle: {
    fontFamily: FONTS.heading,
    fontSize: 28,
    color: COLORS.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  // 3. Segmented Control
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0EFEA',
    borderRadius: 24,
    padding: 3,
    marginBottom: 18,
    justifyContent: 'space-between',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: COLORS.primary, // Deep Navy #111827
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      },
    }),
  },
  segmentButtonInactive: {
    backgroundColor: 'transparent',
  },
  segmentText: {
    fontSize: 13,
    fontFamily: FONTS.bodyMedium,
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontFamily: FONTS.bodyBold,
  },
  segmentTextInactive: {
    color: COLORS.primary,
  },
  // Cards Stack
  cardsStack: {
    gap: 14,
    marginBottom: 18,
  },
  controlCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFEA',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FAF4E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardHeaderTextCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
    marginBottom: 1,
  },
  amountInput: {
    fontFamily: FONTS.bodyBold,
    fontSize: 26,
    color: COLORS.primary,
    borderWidth: 1,
    borderColor: '#E7E5E4',
    backgroundColor: '#FAF9F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  // Feedback Card (No Graph)
  feedbackCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFEA',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      },
    }),
  },
  feedbackHeaderTitle: {
    fontSize: 14,
    color: COLORS.primary,
    marginBottom: 12,
  },
  feedbackGrid: {
    gap: 8,
  },
  feedbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#EFEFEA',
    marginVertical: 4,
  },
  reserveNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 8,
  },
  reserveNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
  },
  // Actions
  actionsContainer: {
    gap: 10,
  },
  applyButton: {
    backgroundColor: COLORS.primary, // Deep Navy
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
  },
  resetButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  resetButtonText: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  numericInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
    marginBottom: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalConfirmBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
