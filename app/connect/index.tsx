import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Calendar,
  Layers,
  Sparkles,
  TrendingUp,
  LineChart,
  Lightbulb,
  X,
  FileCheck2,
  RefreshCw,
} from 'lucide-react-native';
import { Typography } from '../../components/Typography';
import { Button } from '../../components/Button';
import { AASandboxBadge } from '../../components/aa/AASandboxBadge';
import { BankCardItem } from '../../components/aa/BankCardItem';
import { FetchingStepItem, StepStatus } from '../../components/aa/FetchingStepItem';
import { COLORS, SIZES, SPACING, FONTS } from '../../constants/theme';
import { SANDBOX_ACCOUNTS, SandboxAccount } from '../../types/aa';

type FlowStep = 1 | 2 | 3 | 4 | 5;

export default function AccountAggregatorFlow() {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<FlowStep>(1);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(['acc-hdfc-4821']);

  // Screen 4 pipeline state
  const [fetchStage, setFetchStage] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(10);

  // Toggle account selection
  const handleToggleAccount = (id: string) => {
    setSelectedAccountIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  };

  // Step 4 automated progression simulation
  useEffect(() => {
    if (currentStep === 4) {
      setFetchStage(1); // Consent verified
      setProgressPercent(25);

      const t1 = setTimeout(() => {
        setFetchStage(2); // Account connected
        setProgressPercent(50);
      }, 700);

      const t2 = setTimeout(() => {
        setFetchStage(3); // Fetching transactions
        setProgressPercent(75);
      }, 1500);

      const t3 = setTimeout(() => {
        setFetchStage(4); // Analyzing financial activity
        setProgressPercent(100);
      }, 2300);

      const t4 = setTimeout(() => {
        setCurrentStep(5); // Transition to success
      }, 3100);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
  }, [currentStep]);

  const selectedAccountsCount = selectedAccountIds.length;
  const totalImportedTransactions = selectedAccountsCount * 171;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Navigation & Step Indicator */}
        <View style={styles.topNav}>
          <TouchableOpacity
            onPress={() => {
              if (currentStep > 1 && currentStep < 4) {
                setCurrentStep((prev) => (prev - 1) as FlowStep);
              } else {
                router.back();
              }
            }}
            style={styles.backButton}
            activeOpacity={0.7}
            accessibilityLabel="Back"
          >
            {currentStep === 5 ? (
              <X size={20} color={COLORS.primary} strokeWidth={2} />
            ) : (
              <ArrowLeft size={20} color={COLORS.primary} strokeWidth={2} />
            )}
          </TouchableOpacity>

          <View style={styles.stepPill}>
            <Text style={styles.stepPillText}>
              STEP {currentStep} OF 5
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/(tabs)')}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <X size={18} color={COLORS.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Global Sandbox Demo Flag */}
        <AASandboxBadge label="RBI ACCOUNT AGGREGATOR • SANDBOX DEMO" />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SCREEN 1 — CONNECT ACCOUNT
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {currentStep === 1 && (
          <View style={styles.stepContainer}>
            <View style={styles.headerSection}>
              <Typography variant="pageTitle" style={styles.pageTitle}>
                Connect your accounts
              </Typography>
              <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
                Securely bring your financial information into ASSAY.
              </Typography>
            </View>

            {/* Explanation Card */}
            <View style={styles.explanationCard}>
              <View style={styles.explanationHeader}>
                <FileCheck2 size={20} color={COLORS.gold} strokeWidth={2} />
                <Typography variant="bodySemiBold" color={COLORS.primary}>
                  Consent-Based Architecture
                </Typography>
              </View>
              <Typography variant="body" color={COLORS.primary} style={styles.explanationText}>
                ASSAY uses consent-based financial data access to understand your spending, income and cash flow.
              </Typography>
            </View>

            {/* Three Key Benefits */}
            <View style={styles.benefitsCard}>
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.benefitsTitle}>
                WHAT YOU UNLOCK
              </Typography>

              <View style={styles.benefitRow}>
                <View style={styles.benefitIconCircle}>
                  <LineChart size={18} color={COLORS.primary} strokeWidth={2} />
                </View>
                <View style={styles.benefitTextCol}>
                  <Typography variant="bodySemiBold" color={COLORS.primary}>
                    Spending analysis
                  </Typography>
                  <Typography variant="secondary" color={COLORS.textSecondary}>
                    Deep transaction categorization and leak detection across all accounts.
                  </Typography>
                </View>
              </View>

              <View style={styles.benefitDivider} />

              <View style={styles.benefitRow}>
                <View style={styles.benefitIconCircle}>
                  <TrendingUp size={18} color={COLORS.primary} strokeWidth={2} />
                </View>
                <View style={styles.benefitTextCol}>
                  <Typography variant="bodySemiBold" color={COLORS.primary}>
                    Cash-flow forecasting
                  </Typography>
                  <Typography variant="secondary" color={COLORS.textSecondary}>
                    Predictive balance trajectory accounting for recurring commitments.
                  </Typography>
                </View>
              </View>

              <View style={styles.benefitDivider} />

              <View style={styles.benefitRow}>
                <View style={styles.benefitIconCircle}>
                  <Lightbulb size={18} color={COLORS.gold} strokeWidth={2} />
                </View>
                <View style={styles.benefitTextCol}>
                  <Typography variant="bodySemiBold" color={COLORS.primary}>
                    Personalized recommendations
                  </Typography>
                  <Typography variant="secondary" color={COLORS.textSecondary}>
                    Targeted insights to optimize liquidity and eliminate unnecessary spend.
                  </Typography>
                </View>
              </View>
            </View>

            {/* Privacy Note */}
            <View style={styles.privacyNoteRow}>
              <ShieldCheck size={16} color={COLORS.success} strokeWidth={2} />
              <Typography variant="secondary" color={COLORS.textSecondary} style={styles.privacyNoteText}>
                You control what information is shared.
              </Typography>
            </View>

            {/* CTA */}
            <Button
              title="Continue"
              variant="primary"
              size="lg"
              onPress={() => setCurrentStep(2)}
              style={styles.mainCta}
            />
          </View>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SCREEN 2 — CONSENT
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {currentStep === 2 && (
          <View style={styles.stepContainer}>
            <View style={styles.headerSection}>
              <Typography variant="pageTitle" style={styles.pageTitle}>
                Review access
              </Typography>
              <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
                Review the consent parameters requested by ASSAY before continuing.
              </Typography>
            </View>

            {/* Consent Details Card */}
            <View style={styles.consentCard}>
              {/* Financial Information */}
              <View style={styles.consentSection}>
                <Typography variant="caption" color={COLORS.textSecondary} style={styles.sectionHeading}>
                  FINANCIAL INFORMATION REQUESTED
                </Typography>
                <View style={styles.checkItem}>
                  <CheckCircle2 size={18} color={COLORS.success} strokeWidth={2.2} />
                  <Typography variant="bodyMedium" color={COLORS.primary} style={styles.checkText}>
                    Account balance
                  </Typography>
                </View>
                <View style={styles.checkItem}>
                  <CheckCircle2 size={18} color={COLORS.success} strokeWidth={2.2} />
                  <Typography variant="bodyMedium" color={COLORS.primary} style={styles.checkText}>
                    Transaction history
                  </Typography>
                </View>
              </View>

              <View style={styles.consentDivider} />

              {/* Date Range */}
              <View style={styles.consentSection}>
                <Typography variant="caption" color={COLORS.textSecondary} style={styles.sectionHeading}>
                  DATE RANGE
                </Typography>
                <View style={styles.dateRangeBox}>
                  <Calendar size={18} color={COLORS.primary} strokeWidth={1.8} />
                  <Typography variant="bodySemiBold" color={COLORS.primary} style={{ marginLeft: 10 }}>
                    01 Aug 2026 — 18 Sep 2026
                  </Typography>
                </View>
              </View>

              <View style={styles.consentDivider} />

              {/* Purpose */}
              <View style={styles.consentSection}>
                <Typography variant="caption" color={COLORS.textSecondary} style={styles.sectionHeading}>
                  PURPOSE OF ACCESS
                </Typography>
                <View style={styles.purposeBox}>
                  <Typography variant="bodyBold" color={COLORS.primary}>
                    "Personal Financial Management"
                  </Typography>
                  <Typography variant="secondary" color={COLORS.textSecondary} style={{ marginTop: 4 }}>
                    To provide cash-flow analytics, subscription detection, and financial copilot intelligence.
                  </Typography>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionButtons}>
              <Button
                title="Approve & Continue"
                variant="primary"
                size="lg"
                onPress={() => setCurrentStep(3)}
                style={styles.mainCta}
              />
              <Button
                title="Cancel"
                variant="secondary"
                size="md"
                onPress={() => router.back()}
                style={styles.secondaryCta}
              />
            </View>
          </View>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SCREEN 3 — ACCOUNT SELECTION
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {currentStep === 3 && (
          <View style={styles.stepContainer}>
            <View style={styles.headerSection}>
              <Typography variant="pageTitle" style={styles.pageTitle}>
                Select accounts
              </Typography>
              <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
                Choose which sandbox accounts to link with your ASSAY profile.
              </Typography>
            </View>

            {/* Bank Cards List */}
            <View style={styles.bankList}>
              {SANDBOX_ACCOUNTS.map((account) => (
                <BankCardItem
                  key={account.id}
                  account={account}
                  isSelected={selectedAccountIds.includes(account.id)}
                  onToggle={handleToggleAccount}
                />
              ))}
            </View>

            {/* Selection Summary Pill */}
            <View style={styles.selectionSummary}>
              <Typography variant="caption" color={COLORS.textSecondary}>
                Selected: <Typography variant="caption" color={COLORS.primary} style={{ fontFamily: FONTS.bodyBold }}>{selectedAccountsCount} of {SANDBOX_ACCOUNTS.length} accounts</Typography>
              </Typography>
              <TouchableOpacity
                onPress={() => {
                  if (selectedAccountIds.length === SANDBOX_ACCOUNTS.length) {
                    setSelectedAccountIds(['acc-hdfc-4821']);
                  } else {
                    setSelectedAccountIds(SANDBOX_ACCOUNTS.map((a) => a.id));
                  }
                }}
              >
                <Typography variant="caption" color={COLORS.gold} style={{ fontFamily: FONTS.bodySemiBold }}>
                  {selectedAccountIds.length === SANDBOX_ACCOUNTS.length ? 'Reset Selection' : 'Select All'}
                </Typography>
              </TouchableOpacity>
            </View>

            {/* CTA */}
            <Button
              title={`Connect Selected (${selectedAccountsCount} ${selectedAccountsCount === 1 ? 'Account' : 'Accounts'})`}
              variant="primary"
              size="lg"
              onPress={() => setCurrentStep(4)}
              style={styles.mainCta}
            />
          </View>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SCREEN 4 — FETCHING
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {currentStep === 4 && (
          <View style={styles.stepContainer}>
            <View style={styles.headerSection}>
              <Typography variant="pageTitle" style={styles.pageTitle}>
                Importing financial data
              </Typography>
              <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
                Establishing encrypted connection with Account Aggregator...
              </Typography>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
            </View>

            {/* Checklist Pipeline */}
            <View style={styles.fetchingCard}>
              <FetchingStepItem
                label="Consent verified"
                status={fetchStage >= 1 ? 'completed' : 'active'}
                detail="RBI Sandbox token #AA-2026-9812 validated."
              />
              <FetchingStepItem
                label="Account connected"
                status={fetchStage >= 2 ? 'completed' : fetchStage === 1 ? 'active' : 'pending'}
                detail={`${selectedAccountsCount} bank entity handshake confirmed.`}
              />
              <FetchingStepItem
                label="Fetching transactions..."
                status={fetchStage >= 3 ? 'completed' : fetchStage === 2 ? 'active' : 'pending'}
                detail="Parsing normalized statements (01 Aug — 18 Sep 2026)."
              />
              <FetchingStepItem
                label="Analyzing financial activity..."
                status={fetchStage >= 4 ? 'completed' : fetchStage === 3 ? 'active' : 'pending'}
                detail="Classifying observed spend & recurring cash flows."
                isLast
              />
            </View>

            <View style={styles.fetchingNote}>
              <RefreshCw size={14} color={COLORS.textMuted} />
              <Typography variant="caption" color={COLORS.textMuted}>
                Encrypted with AES-256 GCM in compliance with Account Aggregator specs.
              </Typography>
            </View>
          </View>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SCREEN 5 — SUCCESS
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {currentStep === 5 && (
          <View style={styles.stepContainer}>
            <View style={styles.successIconCircle}>
              <CheckCircle2 size={40} color={COLORS.success} strokeWidth={2} />
            </View>

            <View style={styles.headerSectionCenter}>
              <Typography variant="pageTitle" align="center" style={styles.pageTitle}>
                Your financial picture is ready.
              </Typography>
              <Typography variant="body" color={COLORS.textSecondary} align="center" style={styles.subtitleCenter}>
                ASSAY has synthesized your accounts into structured, explainable financial health indicators.
              </Typography>
            </View>

            {/* Metric Summary Card */}
            <View style={styles.metricCard}>
              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Typography variant="display" color={COLORS.primary} style={styles.metricNumber}>
                    {selectedAccountsCount}
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary} style={styles.metricLabel}>
                    {selectedAccountsCount === 1 ? 'account connected' : 'accounts connected'}
                  </Typography>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricItem}>
                  <Typography variant="display" color={COLORS.primary} style={styles.metricNumber}>
                    {totalImportedTransactions}
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary} style={styles.metricLabel}>
                    transactions imported
                  </Typography>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricItem}>
                  <Typography variant="display" color={COLORS.primary} style={styles.metricNumber}>
                    6
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary} style={styles.metricLabel}>
                    months analyzed
                  </Typography>
                </View>
              </View>
            </View>

            {/* Observed vs Actionable Highlights */}
            <View style={styles.highlightsContainer}>
              <View style={styles.highlightBadgeCard}>
                <View style={styles.highlightHeader}>
                  <View style={styles.observedPill}>
                    <Text style={styles.observedText}>OBSERVED</Text>
                  </View>
                  <Typography variant="bodySemiBold" color={COLORS.primary}>
                    ₹1,66,930 Total Reserves
                  </Typography>
                </View>
                <Typography variant="secondary" color={COLORS.textSecondary}>
                  Liquid bank balance synchronized across all linked accounts.
                </Typography>
              </View>

              <View style={styles.highlightBadgeCard}>
                <View style={styles.highlightHeader}>
                  <View style={styles.recommendedPill}>
                    <Text style={styles.recommendedText}>RECOMMENDED</Text>
                  </View>
                  <Typography variant="bodySemiBold" color={COLORS.primary}>
                    3 Recurring Leaks Detected
                  </Typography>
                </View>
                <Typography variant="secondary" color={COLORS.textSecondary}>
                  Assay identified ₹2,450/mo in unused subscriptions ready for review.
                </Typography>
              </View>
            </View>

            {/* CTA */}
            <Button
              title="View Financial Health"
              variant="primary"
              size="lg"
              onPress={() => router.replace('/(tabs)')}
              style={styles.mainCta}
            />
          </View>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SCREEN TESTER TOOLBAR (Reviewer Helper)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={styles.demoSection}>
          <Text style={styles.demoTitle}>JUMP TO STEP (SANDBOX TESTING)</Text>
          <View style={styles.demoPillsRow}>
            {[1, 2, 3, 4, 5].map((step) => (
              <TouchableOpacity
                key={step}
                style={[
                  styles.demoPill,
                  currentStep === step && styles.demoPillActive,
                ]}
                onPress={() => setCurrentStep(step as FlowStep)}
              >
                <Text
                  style={[
                    styles.demoPillText,
                    currentStep === step && styles.demoPillTextActive,
                  ]}
                >
                  Step {step}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 12,
    paddingBottom: 40,
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    height: 44,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.05)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepPillText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 11,
    color: COLORS.primary,
    letterSpacing: 0.8,
  },
  stepContainer: {
    marginTop: 8,
  },
  headerSection: {
    marginBottom: SPACING.xl,
  },
  headerSectionCenter: {
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 34,
    lineHeight: 42,
    color: COLORS.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
  subtitleCenter: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
    maxWidth: 320,
  },
  explanationCard: {
    backgroundColor: '#FCFAF5',
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.3)',
    padding: 18,
    marginBottom: SPACING.xl,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 14.5,
    lineHeight: 21,
  },
  benefitsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  benefitsTitle: {
    letterSpacing: 1,
    marginBottom: 16,
    fontFamily: FONTS.bodySemiBold,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  benefitIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(17, 24, 39, 0.04)',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  benefitTextCol: {
    flex: 1,
    gap: 2,
  },
  benefitDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
    marginLeft: 50,
  },
  privacyNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: SPACING.xl,
  },
  privacyNoteText: {
    fontFamily: FONTS.bodyMedium,
  },
  mainCta: {
    height: 52,
    borderRadius: SIZES.radius,
    marginBottom: 10,
  },
  secondaryCta: {
    height: 48,
    borderRadius: SIZES.radius,
  },
  actionButtons: {
    gap: 10,
    marginTop: 8,
  },
  consentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  consentSection: {
    paddingVertical: 4,
  },
  sectionHeading: {
    letterSpacing: 0.8,
    marginBottom: 12,
    fontFamily: FONTS.bodySemiBold,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  checkText: {
    fontSize: 15,
  },
  consentDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  dateRangeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.smallRadius,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  purposeBox: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.smallRadius,
    padding: 14,
  },
  bankList: {
    marginBottom: 8,
  },
  selectionSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: SPACING.xl,
  },
  progressContainer: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  fetchingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  fetchingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  successIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  metricCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 20,
    paddingHorizontal: 14,
    marginBottom: SPACING.xl,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricNumber: {
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 2,
  },
  metricLabel: {
    textAlign: 'center',
    lineHeight: 16,
  },
  metricDivider: {
    width: 1,
    height: 38,
    backgroundColor: COLORS.border,
  },
  highlightsContainer: {
    gap: 12,
    marginBottom: SPACING.xxl,
  },
  highlightBadgeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 6,
  },
  highlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  observedPill: {
    backgroundColor: 'rgba(17, 24, 39, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  observedText: {
    fontFamily: FONTS.bodyBold,
    fontSize: 9.5,
    color: COLORS.primary,
    letterSpacing: 0.6,
  },
  recommendedPill: {
    backgroundColor: 'rgba(214, 169, 40, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recommendedText: {
    fontFamily: FONTS.bodyBold,
    fontSize: 9.5,
    color: '#927014',
    letterSpacing: 0.6,
  },
  demoSection: {
    marginTop: SPACING.xxxl,
    paddingTop: SPACING.base,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  demoTitle: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 10.5,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: 'center',
  },
  demoPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  demoPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.05)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  demoPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  demoPillText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  demoPillTextActive: {
    color: COLORS.white,
    fontFamily: FONTS.bodySemiBold,
  },
});
