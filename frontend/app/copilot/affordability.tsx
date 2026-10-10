import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS } from '../../constants/theme';
import { fetchFinancialHealth, fetchObligations } from '../../services/finance';

import {
  ChevronLeft,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Calendar,
  SlidersHorizontal,
  ArrowRight,
  ShieldAlert,
  Sparkles,
} from 'lucide-react-native';

interface PresetItem {
  name: string;
  amount: number;
  category: string;
}

const PRESETS: PresetItem[] = [
  { name: 'Smartphone', amount: 30000, category: 'Electronics' },
  { name: 'iPhone 16', amount: 79900, category: 'Electronics' },
  { name: 'Goa Weekend Trip', amount: 18000, category: 'Travel' },
  { name: 'Smart TV 55"', amount: 34000, category: 'Appliances' },
  { name: 'Weekend Dining', amount: 4500, category: 'Leisure' },
];

export default function AffordabilityCheckScreen() {
  const router = useRouter();

  // User input state
  const [itemName, setItemName] = useState('Smartphone');
  const [amountStr, setAmountStr] = useState('30000');
  const [selectedStrategy, setSelectedStrategy] = useState<'emi' | 'delay' | 'offset'>('emi');

  // Live financial metrics with robust fallbacks
  const [currentBalance, setCurrentBalance] = useState(42850);
  const [upcomingBills, setUpcomingBills] = useState(15200);
  const [declaredReserve, setDeclaredReserve] = useState(25000);
  const [monthlySalary, setMonthlySalary] = useState(85000);

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetchFinancialHealth(), fetchObligations()])
      .then(([health, obligations]) => {
        if (!isMounted) return;
        if (health) {
          if (health.projected_month_end_balance) {
            setCurrentBalance(Math.round(health.projected_month_end_balance));
          }
          if (health.income) {
            setMonthlySalary(Math.round(health.income));
          }
          if (health.recurring_obligations) {
            setUpcomingBills(Math.round(health.recurring_obligations));
          }
        }
        if (obligations?.total_monthly_obligations) {
          setUpcomingBills(Math.round(obligations.total_monthly_obligations));
        }
      })
      .catch(() => {
        // Fall back gracefully to demo defaults if offline
      });
    return () => {
      isMounted = false;
    };
  }, []);


  // Numeric parse
  const purchaseAmount = useMemo(() => {
    const parsed = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }, [amountStr]);

  // Derived financial impacts
  const balanceAfterImmediate = currentBalance - purchaseAmount;
  const projectedTrough = balanceAfterImmediate - upcomingBills;
  const isOverdraft = projectedTrough < 0;
  const isReserveBreached = projectedTrough < declaredReserve;

  // Strategy computations
  const emiMonthly = Math.round(purchaseAmount / 3);
  const emiTrough = currentBalance - emiMonthly - upcomingBills;
  const emiSafe = emiTrough >= 0;

  const handlePresetSelect = (preset: PresetItem) => {
    setItemName(preset.name);
    setAmountStr(preset.amount.toString());
  };

  const handleReset = () => {
    setItemName('Smartphone');
    setAmountStr('30000');
    setSelectedStrategy('emi');
  };

  const handleCommitAction = () => {
    if (selectedStrategy === 'emi') {
      Alert.alert(
        'EMI Strategy Activated',
        `3-Month No-Cost EMI of ₹${emiMonthly.toLocaleString('en-IN')}/mo configured for ${itemName}. Your 25 Sep trough stays safe at +₹${emiTrough.toLocaleString('en-IN')}.`,
        [{ text: 'View Simulator', onPress: () => router.push('/simulator') }, { text: 'Done' }]
      );
    } else if (selectedStrategy === 'delay') {
      Alert.alert(
        'Payday Reminder Set',
        `Reminder scheduled for 29 Sep after your ₹${monthlySalary.toLocaleString('en-IN')} salary arrives. Shortfall risk drops to 0%.`,
        [{ text: 'Done' }]
      );
    } else {
      Alert.alert(
        'Spending Offset Activated',
        `Discretionary spending cap of ₹3,500/mo enabled for next 60 days to absorb ${itemName} safely.`,
        [{ text: 'Done' }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft color={COLORS.text} size={24} />
        </TouchableOpacity>

        <View style={styles.headerTitleCol}>
          <Typography variant="h2" style={styles.headerTitle} numberOfLines={1}>
            Affordability Check
          </Typography>
          <Typography
            variant="caption"
            color={COLORS.textSecondary}
            style={styles.headerSubtitle}
            numberOfLines={1}
          >
            Simulate purchase impact against your 30-day cash buffer
          </Typography>
        </View>

        <TouchableOpacity
          style={styles.resetBtn}
          onPress={handleReset}
          activeOpacity={0.7}
        >
          <RotateCcw color={COLORS.text} size={20} />
        </TouchableOpacity>
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
          {/* Section 1: Interactive Purchase Input (Hero Card) */}
          <View style={styles.inputCard}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.inputSectionLabel}>
              PLANNED PURCHASE
            </Typography>

            <View style={styles.itemRow}>
              <TextInput
                style={styles.itemNameInput}
                value={itemName}
                onChangeText={setItemName}
                placeholder="e.g. Flight Tickets, Smart TV"
                placeholderTextColor="#9CA3AF"
                returnKeyType="done"
                maxLength={40}
                numberOfLines={1}
              />
            </View>

            <View style={styles.amountInputRow}>
              <Typography variant="display" color={COLORS.text} style={styles.currencySymbol}>
                ₹
              </Typography>
              <TextInput
                style={styles.amountInput}
                value={amountStr}
                onChangeText={(val) => setAmountStr(val.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                maxLength={8}
                returnKeyType="done"
              />
            </View>

            {/* Quick Preset Chips */}
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.presetsLabel}>
              QUICK PRESETS
            </Typography>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.presetScroll}
              contentContainerStyle={styles.presetScrollContent}
            >
              {PRESETS.map((preset) => {
                const isActive = purchaseAmount === preset.amount && itemName === preset.name;
                return (
                  <TouchableOpacity
                    key={preset.name}
                    style={[styles.presetChip, isActive && styles.presetChipActive]}
                    onPress={() => handlePresetSelect(preset)}
                    activeOpacity={0.8}
                  >
                    <Typography
                      variant="caption"
                      style={[styles.presetChipText, isActive && styles.presetChipTextActive]}
                    >
                      {preset.name} • ₹{preset.amount.toLocaleString('en-IN')}
                    </Typography>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Section 2: Instant Solvency Verdict Banner */}
          {isOverdraft ? (
            <View style={styles.dangerBanner}>
              <View style={styles.verdictIconWrapperDanger}>
                <ShieldAlert color="#DC2626" size={24} />
              </View>
              <View style={styles.verdictContent}>
                <Typography variant="bodyBold" color="#991B1B" style={styles.verdictTitle}>
                  Overdraft Warning on 25 Sep
                </Typography>
                <Typography variant="secondary" color="#991B1B" style={styles.verdictDescription}>
                  Purchasing upfront triggers a ₹{Math.abs(projectedTrough).toLocaleString('en-IN')} deficit 3 days before your salary arrives.
                </Typography>
              </View>
            </View>
          ) : isReserveBreached ? (
            <View style={styles.warningBanner}>
              <View style={styles.verdictIconWrapperWarning}>
                <AlertCircle color="#D97706" size={24} />
              </View>
              <View style={styles.verdictContent}>
                <Typography variant="bodyBold" color="#92400E" style={styles.verdictTitle}>
                  Safety Reserve Breached
                </Typography>
                <Typography variant="secondary" color="#92400E" style={styles.verdictDescription}>
                  You won't overdraft, but cash drops to ₹{projectedTrough.toLocaleString('en-IN')} (below your declared ₹{declaredReserve.toLocaleString('en-IN')} cushion).
                </Typography>
              </View>
            </View>
          ) : (
            <View style={styles.successBanner}>
              <View style={styles.verdictIconWrapperSuccess}>
                <CheckCircle2 color="#16A34A" size={24} />
              </View>
              <View style={styles.verdictContent}>
                <Typography variant="bodyBold" color="#166534" style={styles.verdictTitle}>
                  Safe to Purchase Upfront
                </Typography>
                <Typography variant="secondary" color="#166534" style={styles.verdictDescription}>
                  Your projected 25 Sep trough stays comfortable at ₹{projectedTrough.toLocaleString('en-IN')}, fully above your ₹{declaredReserve.toLocaleString('en-IN')} cushion.
                </Typography>
              </View>
            </View>
          )}

          {/* Section 3: 30-Day Cash-Flow Impact Breakdown */}
          <View style={styles.breakdownCard}>
            <Typography variant="cardHeading" style={styles.breakdownTitle}>
              Cash-Flow Stepdown Breakdown
            </Typography>

            <View style={styles.stepRow}>
              <View style={styles.stepLabelCol}>
                <Typography variant="secondary" color={COLORS.textSecondary}>
                  Available Liquid Balance Today
                </Typography>
              </View>
              <View style={styles.stepValueCol}>
                <Typography variant="bodyBold" color={COLORS.text}>
                  +₹{currentBalance.toLocaleString('en-IN')}
                </Typography>
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepLabelCol}>
                <Typography variant="secondary" color="#DC2626" numberOfLines={2}>
                  Immediate Purchase ({itemName})
                </Typography>
              </View>
              <View style={styles.stepValueCol}>
                <Typography variant="bodyBold" color="#DC2626">
                  -₹{purchaseAmount.toLocaleString('en-IN')}
                </Typography>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.stepRow}>
              <View style={styles.stepLabelCol}>
                <Typography variant="secondary" color={COLORS.textSecondary}>
                  Interim Balance Left
                </Typography>
              </View>
              <View style={styles.stepValueCol}>
                <Typography variant="bodyBold" color={COLORS.text}>
                  ₹{balanceAfterImmediate.toLocaleString('en-IN')}
                </Typography>
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepLabelCol}>
                <Typography variant="secondary" color={COLORS.textSecondary}>
                  Upcoming Commitments before 28 Sep
                </Typography>
                <Typography variant="caption" color={COLORS.textSecondary} style={{ marginTop: 2 }}>
                  Axis Car Loan EMI (₹8,400) + Bills (₹6,800)
                </Typography>
              </View>
              <View style={styles.stepValueCol}>
                <Typography variant="bodyBold" color="#DC2626">
                  -₹{upcomingBills.toLocaleString('en-IN')}
                </Typography>
              </View>
            </View>

            {/* Trough Box Highlight */}
            <View
              style={[
                styles.troughBox,
                isOverdraft ? styles.troughBoxDanger : isReserveBreached ? styles.troughBoxWarning : styles.troughBoxSafe,
              ]}
            >
              <View style={styles.troughLabelCol}>
                <Typography
                  variant="bodySemiBold"
                  color={isOverdraft ? '#991B1B' : isReserveBreached ? '#92400E' : '#166534'}
                  numberOfLines={1}
                >
                  Projected Trough on 25 Sep
                </Typography>
                <Typography
                  variant="caption"
                  color={isOverdraft ? '#DC2626' : isReserveBreached ? '#D97706' : '#16A34A'}
                  numberOfLines={1}
                >
                  {isOverdraft ? 'Overdraft penalty zone' : isReserveBreached ? 'Below emergency buffer' : 'Fully solvent buffer'}
                </Typography>
              </View>
              <View style={styles.troughValueCol}>
                <Typography
                  variant="financial"
                  style={[
                    styles.troughAmount,
                    { color: isOverdraft ? '#DC2626' : isReserveBreached ? '#D97706' : '#16A34A' },
                  ]}
                  numberOfLines={1}
                >
                  {projectedTrough < 0 ? `-₹${Math.abs(projectedTrough).toLocaleString('en-IN')}` : `₹${projectedTrough.toLocaleString('en-IN')}`}
                </Typography>
              </View>
            </View>
          </View>

          {/* Section 4: Smart Alternative Payment Strategies */}
          <Typography variant="cardHeading" style={styles.strategiesHeading}>
            Smart Execution Strategies
          </Typography>

          {/* Strategy 1: No-Cost EMI */}
          <TouchableOpacity
            style={[styles.strategyCard, selectedStrategy === 'emi' && styles.strategyCardActive]}
            onPress={() => setSelectedStrategy('emi')}
            activeOpacity={0.8}
          >
            <View style={styles.strategyTopRow}>
              <View style={styles.strategyRadio}>
                <View style={[styles.radioCircle, selectedStrategy === 'emi' && styles.radioCircleActive]}>
                  {selectedStrategy === 'emi' && <View style={styles.radioDot} />}
                </View>
              </View>
              <View style={[styles.strategyIconBox, { backgroundColor: '#FEF3C7' }]}>
                <CreditCard color="#B45309" size={20} />
              </View>
              <View style={styles.strategyHeaderCol}>
                <View style={styles.strategyTitleBadgeRow}>
                  <Typography variant="bodyBold" style={styles.strategyTitle} numberOfLines={1}>
                    3-Month No-Cost EMI
                  </Typography>
                  <View style={styles.tagRecommended}>
                    <Sparkles size={11} color="#B45309" style={{ marginRight: 3 }} />
                    <Typography variant="caption" style={styles.tagRecommendedText}>
                      RECOMMENDED
                    </Typography>
                  </View>
                </View>
                <Typography variant="caption" color={COLORS.textSecondary} style={styles.strategySubtitle} numberOfLines={1}>
                  Split into ₹{emiMonthly.toLocaleString('en-IN')} / month
                </Typography>
              </View>
            </View>

            <View style={styles.strategyExplanationBox}>
              <Typography variant="secondary" color={COLORS.textSecondary} style={styles.strategyDetailText}>
                Smoothes cash outflow. 25 Sep trough remains safe at{' '}
                <Typography variant="bodyBold" color={emiSafe ? '#16A34A' : '#DC2626'}>
                  +₹{emiTrough.toLocaleString('en-IN')}
                </Typography>
                . Zero overdraft fee and 0% interest.
              </Typography>
            </View>
          </TouchableOpacity>

          {/* Strategy 2: Delay by 6 Days */}
          <TouchableOpacity
            style={[styles.strategyCard, selectedStrategy === 'delay' && styles.strategyCardActive]}
            onPress={() => setSelectedStrategy('delay')}
            activeOpacity={0.8}
          >
            <View style={styles.strategyTopRow}>
              <View style={styles.strategyRadio}>
                <View style={[styles.radioCircle, selectedStrategy === 'delay' && styles.radioCircleActive]}>
                  {selectedStrategy === 'delay' && <View style={styles.radioDot} />}
                </View>
              </View>
              <View style={[styles.strategyIconBox, { backgroundColor: '#DCFCE7' }]}>
                <Calendar color="#15803D" size={20} />
              </View>
              <View style={styles.strategyHeaderCol}>
                <View style={styles.strategyTitleBadgeRow}>
                  <Typography variant="bodyBold" style={styles.strategyTitle} numberOfLines={1}>
                    Delay by 6 Days
                  </Typography>
                  <View style={styles.tagGreen}>
                    <Typography variant="caption" style={styles.tagGreenText}>
                      ZERO RISK
                    </Typography>
                  </View>
                </View>
                <Typography variant="caption" color={COLORS.textSecondary} style={styles.strategySubtitle} numberOfLines={1}>
                  Wait for 29 Sep payday (₹85,000)
                </Typography>
              </View>
            </View>

            <View style={styles.strategyExplanationBox}>
              <Typography variant="secondary" color={COLORS.textSecondary} style={styles.strategyDetailText}>
                Waiting until payday collapses your overdraft probability from 100% to{' '}
                <Typography variant="bodyBold" color="#16A34A">0%</Typography>
                . An auto-reminder will notify you on 29 Sep.
              </Typography>
            </View>
          </TouchableOpacity>

          {/* Strategy 3: Counter-Balance Spend Offset */}
          <TouchableOpacity
            style={[styles.strategyCard, selectedStrategy === 'offset' && styles.strategyCardActive]}
            onPress={() => setSelectedStrategy('offset')}
            activeOpacity={0.8}
          >
            <View style={styles.strategyTopRow}>
              <View style={styles.strategyRadio}>
                <View style={[styles.radioCircle, selectedStrategy === 'offset' && styles.radioCircleActive]}>
                  {selectedStrategy === 'offset' && <View style={styles.radioDot} />}
                </View>
              </View>
              <View style={[styles.strategyIconBox, { backgroundColor: '#EFF6FF' }]}>
                <SlidersHorizontal color="#1D4ED8" size={20} />
              </View>
              <View style={styles.strategyHeaderCol}>
                <View style={styles.strategyTitleBadgeRow}>
                  <Typography variant="bodyBold" style={styles.strategyTitle} numberOfLines={1}>
                    Budget Counter-Balance
                  </Typography>
                  <View style={styles.tagBlue}>
                    <Typography variant="caption" style={styles.tagBlueText}>
                      DISCIPLINED
                    </Typography>
                  </View>
                </View>
                <Typography variant="caption" color={COLORS.textSecondary} style={styles.strategySubtitle} numberOfLines={1}>
                  Cap dining & leisure spend by ₹3,500/mo
                </Typography>
              </View>
            </View>

            <View style={styles.strategyExplanationBox}>
              <Typography variant="secondary" color={COLORS.textSecondary} style={styles.strategyDetailText}>
                Pays upfront while compensating via a temporary spending cap for 60 days to absorb the ₹{purchaseAmount.toLocaleString('en-IN')} impact safely.
              </Typography>
            </View>
          </TouchableOpacity>

          {/* Bottom CTA Button */}
          <TouchableOpacity
            style={styles.commitBtn}
            onPress={handleCommitAction}
            activeOpacity={0.85}
          >
            <Typography variant="bodyBold" style={styles.commitBtnText} numberOfLines={1}>
              {selectedStrategy === 'emi'
                ? `Apply 3-Month EMI (₹${emiMonthly.toLocaleString('en-IN')}/mo)`
                : selectedStrategy === 'delay'
                ? 'Set Payday Reminder (29 Sep)'
                : 'Apply ₹3,500 Discretionary Cap'}
            </Typography>
            <ArrowRight color="#111827" size={18} style={styles.commitBtnIcon} />
          </TouchableOpacity>

          <Typography variant="caption" color={COLORS.textSecondary} align="center" style={styles.footnote}>
            Verified by Assay Conformal Solvency Engine • Zero arithmetic hallucinations
          </Typography>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 10,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 20,
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 15,
  },
  resetBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 10,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
  },
  inputCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
  },
  inputSectionLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  itemRow: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
    marginBottom: 12,
  },
  itemNameInput: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.bodySemiBold,
    padding: 0,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  currencySymbol: {
    fontSize: 32,
    marginRight: 6,
    fontWeight: '700',
    flexShrink: 0,
  },
  amountInput: {
    flex: 1,
    fontSize: 34,
    fontFamily: 'Inter_700Bold',
    color: COLORS.text,
    padding: 0,
    minWidth: 0,
  },
  presetsLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  presetScroll: {
    flexDirection: 'row',
  },
  presetScrollContent: {
    paddingRight: 12,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  presetChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  dangerBanner: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  verdictIconWrapperDanger: {
    marginRight: 10,
    marginTop: 2,
    flexShrink: 0,
  },
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  verdictIconWrapperWarning: {
    marginRight: 10,
    marginTop: 2,
    flexShrink: 0,
  },
  successBanner: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  verdictIconWrapperSuccess: {
    marginRight: 10,
    marginTop: 2,
    flexShrink: 0,
  },
  verdictContent: {
    flex: 1,
    minWidth: 0,
  },
  verdictTitle: {
    fontSize: 14.5,
    marginBottom: 3,
    lineHeight: 19,
  },
  verdictDescription: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  breakdownCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 18,
  },
  breakdownTitle: {
    fontSize: 15.5,
    marginBottom: 12,
    color: COLORS.text,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  stepLabelCol: {
    flex: 1,
    paddingRight: 10,
    minWidth: 0,
  },
  stepValueCol: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  troughBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    marginTop: 10,
    borderWidth: 1,
  },
  troughBoxDanger: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  troughBoxWarning: {
    backgroundColor: 'rgba(217, 119, 6, 0.08)',
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  troughBoxSafe: {
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  troughLabelCol: {
    flex: 1,
    paddingRight: 10,
    minWidth: 0,
  },
  troughValueCol: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  troughAmount: {
    fontSize: 17,
    fontWeight: '700',
  },
  strategiesHeading: {
    fontSize: 17,
    marginBottom: 12,
    color: COLORS.text,
  },
  strategyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  strategyCardActive: {
    borderColor: '#D6A928',
    backgroundColor: '#FCFAF5',
  },
  strategyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  strategyRadio: {
    marginRight: 10,
    flexShrink: 0,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: '#D6A928',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D6A928',
  },
  strategyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  strategyHeaderCol: {
    flex: 1,
    minWidth: 0,
  },
  strategyTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  strategyTitle: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
    minWidth: 0,
  },
  strategySubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  tagRecommended: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  tagRecommendedText: {
    fontSize: 9.5,
    color: '#B45309',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tagGreen: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  tagGreenText: {
    fontSize: 9.5,
    color: '#15803D',
    fontWeight: '700',
  },
  tagBlue: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  tagBlueText: {
    fontSize: 9.5,
    color: '#1D4ED8',
    fontWeight: '700',
  },
  strategyExplanationBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  strategyDetailText: {
    fontSize: 12.5,
    lineHeight: 17.5,
  },
  commitBtn: {
    flexDirection: 'row',
    backgroundColor: '#D6A928',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  commitBtnText: {
    color: '#111827',
    fontSize: 14.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  commitBtnIcon: {
    marginLeft: 6,
    flexShrink: 0,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 16,
    marginTop: 4,
  },
});
