import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS } from '../../constants/theme';
import { GlassSlider } from '../../components/ui/GlassSlider';
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

export default function WhatIfSimulatorScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SegmentTab>('Income');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Core financial values
  const [monthlyIncome, setMonthlyIncome] = useState<number>(45000);
  const [monthlyExpenses, setMonthlyExpenses] = useState<number>(28000);
  const [monthlyDebt, setMonthlyDebt] = useState<number>(8000);
  const [oneTimeExpense, setOneTimeExpense] = useState<number>(0);
  const [voluntarySavings, setVoluntarySavings] = useState<number>(5000);

  // Baseline values loaded from backend
  const [baselineIncome, setBaselineIncome] = useState<number>(45000);
  const [baselineExpenses, setBaselineExpenses] = useState<number>(28000);
  const [baselineDebt, setBaselineDebt] = useState<number>(8000);

  // Numeric edit modal state
  const [editField, setEditField] = useState<{
    key: string;
    label: string;
    currentValue: number;
    min: number;
    max: number;
  } | null>(null);
  const [editInputText, setEditInputText] = useState('');

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

  // Derive assumptions from state
  const buildCurrentAssumptions = useCallback((): WhatIfAssumptions => {
    const incomePct = baselineIncome > 0
      ? ((monthlyIncome - baselineIncome) / baselineIncome) * 100
      : 0;

    const expenseDelta = baselineExpenses - monthlyExpenses;
    const discPct = baselineExpenses > 0 && expenseDelta > 0
      ? (expenseDelta / baselineExpenses) * 100
      : 0;
    const expenseShock = expenseDelta < 0 ? Math.abs(expenseDelta) : 0;

    const extraDebt = Math.max(0, monthlyDebt - baselineDebt);
    const savingsDelta = voluntarySavings - 5000;

    return {
      horizon_months: 6,
      income_change_pct: Number(incomePct.toFixed(1)),
      discretionary_reduction_pct: Math.min(100, Math.max(0, Number(discPct.toFixed(1)))),
      essential_expense_shock: expenseShock + oneTimeExpense,
      extra_debt_payment: extraDebt,
      savings_contribution_delta: savingsDelta,
      minimum_reserve: null,
      savings_target: null,
    };
  }, [
    baselineIncome,
    monthlyIncome,
    baselineExpenses,
    monthlyExpenses,
    monthlyDebt,
    baselineDebt,
    voluntarySavings,
    oneTimeExpense,
  ]);

  const fetchSimulation = useCallback(async (assumptions: WhatIfAssumptions) => {
    try {
      const data = await runWhatIfSimulation(assumptions);
      setResult(data);

      if (data.baseline_run_rate) {
        const bInc = Math.round(data.baseline_run_rate.income || 45000);
        const bEss = Math.round(data.baseline_run_rate.essential || 20000);
        const bDisc = Math.round(data.baseline_run_rate.discretionary || 8000);
        const bDebt = Math.round(data.baseline_run_rate.emi || 8000);
        const bExp = bEss + bDisc;

        setBaselineIncome(bInc);
        setBaselineExpenses(bExp);
        setBaselineDebt(bDebt);
      }
    } catch {
      // Retain fallback simulation state if network is unavailable
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchSimulation(defaultAssumptions).finally(() => setLoading(false));
  }, [defaultAssumptions, fetchSimulation]);

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
    setMonthlyIncome(baselineIncome);
    setMonthlyExpenses(baselineExpenses);
    setMonthlyDebt(baselineDebt);
    setOneTimeExpense(0);
    setVoluntarySavings(5000);
    void fetchSimulation(defaultAssumptions);
  };

  const openNumberEdit = (key: string, label: string, currentValue: number, min: number, max: number) => {
    setEditField({ key, label, currentValue, min, max });
    setEditInputText(String(currentValue));
  };

  const commitNumberEdit = () => {
    if (!editField) return;
    const cleanNum = parseInt(editInputText.replace(/[^0-9]/g, ''), 10);
    if (isNaN(cleanNum)) {
      setEditField(null);
      return;
    }
    const clamped = Math.min(Math.max(cleanNum, editField.min), editField.max);

    if (editField.key === 'income') setMonthlyIncome(clamped);
    else if (editField.key === 'expenses') setMonthlyExpenses(clamped);
    else if (editField.key === 'debt') setMonthlyDebt(clamped);
    else if (editField.key === 'onetime') setOneTimeExpense(clamped);
    else if (editField.key === 'savings') setVoluntarySavings(clamped);

    setEditField(null);
  };

  // Compact financial feedback metrics
  const baselineClosing = result?.baseline?.ending_balance ?? 68000;
  const planA = result?.plans?.find((p) => p.id === 'plan_a') || result?.plans?.[0];
  const revisedClosing = planA?.ending_balance ?? (
    baselineClosing + (monthlyIncome - baselineIncome) - (monthlyExpenses - baselineExpenses) - (monthlyDebt - baselineDebt) - oneTimeExpense
  );
  const netChange = revisedClosing - baselineClosing;
  const reserveThreshold = result?.minimum_reserve ?? 15000;
  const breachesReserve = revisedClosing < reserveThreshold;

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

      <View style={styles.titleSection}>
        <Typography variant="h1" color={COLORS.primary} style={styles.pageTitle}>
          What-If Simulator
        </Typography>
        <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
          Adjust key inputs and see how your future cash position changes.
        </Typography>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
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
                    Adjust your expected monthly income.
                  </Typography>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => openNumberEdit('income', 'Monthly Income', monthlyIncome, 0, 100000)}
                activeOpacity={0.8}
                style={styles.amountTouch}
              >
                <Typography variant="h2" color={COLORS.primary} style={styles.amountText}>
                  {formatINR(monthlyIncome)}
                </Typography>
              </TouchableOpacity>

              <GlassSlider
                value={monthlyIncome}
                min={0}
                max={100000}
                step={1000}
                onValueChange={setMonthlyIncome}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
                minLabel="₹0"
                maxLabel="₹1,00,000"
              />
            </View>

            {/* Card 2: Monthly Expenses */}
            <View style={styles.controlCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <ShoppingCart color={COLORS.gold} size={18} />
                </View>
                <View style={styles.cardHeaderTextCol}>
                  <Typography variant="bodyBold" color={COLORS.primary} style={styles.cardTitle}>
                    Monthly Expenses
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Adjust your expected monthly expenses.
                  </Typography>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => openNumberEdit('expenses', 'Monthly Expenses', monthlyExpenses, 0, 100000)}
                activeOpacity={0.8}
                style={styles.amountTouch}
              >
                <Typography variant="h2" color={COLORS.primary} style={styles.amountText}>
                  {formatINR(monthlyExpenses)}
                </Typography>
              </TouchableOpacity>

              <GlassSlider
                value={monthlyExpenses}
                min={0}
                max={100000}
                step={1000}
                onValueChange={setMonthlyExpenses}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
                minLabel="₹0"
                maxLabel="₹1,00,000"
              />
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
                    Adjust your total EMI and loan payments.
                  </Typography>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => openNumberEdit('debt', 'Monthly Debt Payments', monthlyDebt, 0, 100000)}
                activeOpacity={0.8}
                style={styles.amountTouch}
              >
                <Typography variant="h2" color={COLORS.primary} style={styles.amountText}>
                  {formatINR(monthlyDebt)}
                </Typography>
              </TouchableOpacity>

              <GlassSlider
                value={monthlyDebt}
                min={0}
                max={100000}
                step={1000}
                onValueChange={setMonthlyDebt}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
                minLabel="₹0"
                maxLabel="₹1,00,000"
              />
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
                    Monthly Living Expenses
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Essential and discretionary monthly budget.
                  </Typography>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => openNumberEdit('expenses', 'Monthly Living Expenses', monthlyExpenses, 0, 100000)}
                activeOpacity={0.8}
                style={styles.amountTouch}
              >
                <Typography variant="h2" color={COLORS.primary} style={styles.amountText}>
                  {formatINR(monthlyExpenses)}
                </Typography>
              </TouchableOpacity>

              <GlassSlider
                value={monthlyExpenses}
                min={0}
                max={100000}
                step={1000}
                onValueChange={setMonthlyExpenses}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
                minLabel="₹0"
                maxLabel="₹1,00,000"
              />
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

              <TouchableOpacity
                onPress={() => openNumberEdit('debt', 'Mandatory Debt & EMI', monthlyDebt, 0, 100000)}
                activeOpacity={0.8}
                style={styles.amountTouch}
              >
                <Typography variant="h2" color={COLORS.primary} style={styles.amountText}>
                  {formatINR(monthlyDebt)}
                </Typography>
              </TouchableOpacity>

              <GlassSlider
                value={monthlyDebt}
                min={0}
                max={100000}
                step={1000}
                onValueChange={setMonthlyDebt}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
                minLabel="₹0"
                maxLabel="₹1,00,000"
              />
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

              <TouchableOpacity
                onPress={() => openNumberEdit('onetime', 'One-Time Planned Shock', oneTimeExpense, 0, 100000)}
                activeOpacity={0.8}
                style={styles.amountTouch}
              >
                <Typography variant="h2" color={COLORS.primary} style={styles.amountText}>
                  {formatINR(oneTimeExpense)}
                </Typography>
              </TouchableOpacity>

              <GlassSlider
                value={oneTimeExpense}
                min={0}
                max={100000}
                step={1000}
                onValueChange={setOneTimeExpense}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
                minLabel="₹0"
                maxLabel="₹1,00,000"
              />
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

              <TouchableOpacity
                onPress={() => openNumberEdit('savings', 'Voluntary Monthly Savings', voluntarySavings, 0, 50000)}
                activeOpacity={0.8}
                style={styles.amountTouch}
              >
                <Typography variant="h2" color={COLORS.primary} style={styles.amountText}>
                  {formatINR(voluntarySavings)}
                </Typography>
              </TouchableOpacity>

              <GlassSlider
                value={voluntarySavings}
                min={0}
                max={50000}
                step={1000}
                onValueChange={setVoluntarySavings}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
                minLabel="₹0"
                maxLabel="₹50,000"
              />
            </View>
          </View>
        )}

        {/* 6. Immediate Financial Feedback — WITHOUT A GRAPH */}
        <View style={styles.feedbackCard}>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.feedbackHeaderTitle}>
            Projected Impact Comparison
          </Typography>

          <View style={styles.feedbackGrid}>
            <View style={styles.feedbackRow}>
              <Typography variant="body" color={COLORS.textSecondary}>
                Current projected balance
              </Typography>
              <Typography variant="bodyBold" color={COLORS.primary}>
                {formatINR(baselineClosing)}
              </Typography>
            </View>

            <View style={styles.feedbackRow}>
              <Typography variant="body" color={COLORS.textSecondary}>
                Revised projected balance
              </Typography>
              <Typography variant="bodyBold" color={COLORS.primary}>
                {formatINR(revisedClosing)}
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
                  color: netChange >= 0 ? COLORS.primary : '#B91C1C',
                }}
              >
                {netChange >= 0 ? `+${formatINR(netChange)}` : `-${formatINR(Math.abs(netChange))}`}
              </Typography>
            </View>
          </View>

          <View style={styles.reserveNotice}>
            <ShieldCheck color={breachesReserve ? '#B91C1C' : COLORS.gold} size={16} />
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.reserveNoticeText}>
              {breachesReserve
                ? `Revised trajectory falls below your ${formatINR(reserveThreshold)} safety reserve.`
                : `Maintains your configured safety reserve of ${formatINR(reserveThreshold)}.`}
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
                Apply Changes
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

      {/* Numeric Direct Entry Modal */}
      <Modal
        visible={!!editField}
        transparent
        animationType="fade"
        onRequestClose={() => setEditField(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Typography variant="bodyBold" color={COLORS.primary}>
                {editField?.label ?? 'Edit Amount'}
              </Typography>
              <TouchableOpacity onPress={() => setEditField(null)}>
                <X color={COLORS.primary} size={20} />
              </TouchableOpacity>
            </View>

            <Typography variant="caption" color={COLORS.textSecondary} style={{ marginBottom: 12 }}>
              Enter an exact amount between {formatINR(editField?.min ?? 0)} and {formatINR(editField?.max ?? 100000)}
            </Typography>

            <TextInput
              style={styles.numericInput}
              keyboardType="number-pad"
              value={editInputText}
              onChangeText={setEditInputText}
              autoFocus
              selectTextOnFocus
              placeholder="0"
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditField(null)}
              >
                <Typography variant="body" color={COLORS.textSecondary}>
                  Cancel
                </Typography>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={commitNumberEdit}
              >
                <Typography variant="bodyBold" style={{ color: '#FFFFFF' }}>
                  Set Value
                </Typography>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
                About What-If Simulator
              </Typography>
              <TouchableOpacity onPress={() => setShowInfoModal(false)}>
                <X color={COLORS.primary} size={20} />
              </TouchableOpacity>
            </View>
            <Typography variant="body" color={COLORS.textSecondary} style={{ lineHeight: 20, marginTop: 8 }}>
              The What-If Simulator lets you evaluate hypothetical changes in income, living expenses, debt payments, and savings without modifying your actual bank balances or transaction ledger.
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
  amountTouch: {
    paddingVertical: 2,
    marginBottom: 6,
  },
  amountText: {
    fontFamily: FONTS.bodyBold,
    fontSize: 26,
    color: COLORS.primary,
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
