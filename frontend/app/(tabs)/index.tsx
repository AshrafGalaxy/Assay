import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { TopSpendingCategoriesChart } from '../../components/ui/TopSpendingCategoriesChart';
import { COLORS, SIZES, SPACING, FONTS } from '../../constants/theme';
import { useAAState } from '../../services/aaState';
import {
  fetchCashFlowForecast,
  fetchUpcomingObligations,
  formatINR,
  type CashFlowForecast,
  type UpcomingObligationItem,
} from '../../services/finance';
import {
  ScanLine,
  Image as ImageIcon,
  Users,
  PieChart,
  Sparkles,
  Calendar,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronRight,
} from 'lucide-react-native';

export default function Dashboard() {
  const router = useRouter();
  const aaState = useAAState();
  const [hasUnreadNotification, setHasUnreadNotification] = React.useState(true);
  const [showBalance, setShowBalance] = React.useState(true);

  const [forecast, setForecast] = React.useState<CashFlowForecast | null>(null);
  const [obligations, setObligations] = React.useState<UpcomingObligationItem[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    fetchCashFlowForecast(6, {
      include_income: true,
      include_essential: true,
      include_discretionary: true,
      include_debt: true,
      include_obligations: true,
    })
      .then((data) => {
        if (!cancelled) setForecast(data);
      })
      .catch(() => {
        if (!cancelled) setForecast(null);
      });
    fetchUpcomingObligations(6)
      .then((data) => {
        if (!cancelled) setObligations(data.obligations ?? []);
      })
      .catch(() => {
        if (!cancelled) setObligations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeAccounts = aaState.connected_accounts.filter(
    (a) => a.status !== 'disconnected'
  );
  const hasConnectedAccounts = aaState.aa_connected && activeAccounts.length > 0;

  // Calculate Total Bank Balance from all active linked accounts
  const totalBankBalance = activeAccounts.reduce(
    (sum, acc) => sum + (Number(acc.balance) || 0),
    0
  );

  // Same monthly rates as Cash Flow Forecast: trailing run-rate from transactions,
  // not a sum of the first page of the transaction list.
  const monthlyIncome = forecast?.monthly_income ?? null;
  const monthlySpending =
    forecast != null
      ? forecast.monthly_essential +
        forecast.monthly_discretionary +
        forecast.monthly_debt +
        forecast.monthly_savings
      : null;
  const moneyLeft =
    monthlyIncome != null && monthlySpending != null ? monthlyIncome - monthlySpending : null;
  const upcomingObligations = obligations.filter(
    (item, index, all) => all.findIndex((other) => other.name === item.name) === index,
  ).slice(0, 2);

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`;
  const formatSigned = (val: number) => `${val < 0 ? '−' : ''}${formatINR(val)}`;

  const handleNotificationPress = () => {
    setHasUnreadNotification(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Unified Header */}
      <ScreenHeader
        greeting="Good Morning,"
        userName="Ashish"
        showNotification
        hasUnreadNotification={hasUnreadNotification}
        onNotificationPress={handleNotificationPress}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Subtle limited insights banner if user chose Set Up Later or disconnected */}
        {!hasConnectedAccounts && (
          <View style={styles.limitedBanner}>
            <View style={styles.limitedBannerLeft}>
              <View style={styles.limitedIconWrap}>
                <AlertCircle size={18} color="#D97706" />
              </View>
              <View style={styles.limitedTextWrap}>
                <Typography variant="bodySemiBold" color={COLORS.primary} style={{ fontSize: 13.5 }}>
                  Financial insights are limited
                </Typography>
                <Typography variant="caption" color={COLORS.textSecondary}>
                  Connect your bank account to automate cash-flow analysis.
                </Typography>
              </View>
            </View>
            <TouchableOpacity
              style={styles.connectPill}
              onPress={() => router.push('/connect')}
              activeOpacity={0.8}
            >
              <Text style={styles.connectPillText}>Connect</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            HERO CARD: TOTAL BANK BALANCE (Screen 8)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Card variant="hero" style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Typography variant="secondary" color={COLORS.textSecondary} style={styles.heroLabel}>
                {hasConnectedAccounts ? 'Total Bank Balance' : 'Total spent this month'}
              </Typography>
              {hasConnectedAccounts && (
                <TouchableOpacity
                  onPress={() => setShowBalance(!showBalance)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showBalance ? (
                    <Eye size={16} color="rgba(255, 255, 255, 0.7)" />
                  ) : (
                    <EyeOff size={16} color="rgba(255, 255, 255, 0.7)" />
                  )}
                </TouchableOpacity>
              )}
            </View>

            {hasConnectedAccounts && (
              <TouchableOpacity
                style={styles.bankStatusPill}
                onPress={() => router.push('/settings/connected-accounts')}
                activeOpacity={0.8}
              >
                <View style={styles.statusDot} />
                <Text style={styles.bankStatusText}>
                  {activeAccounts.length > 1
                    ? `${activeAccounts.map((a) => a.bankName.replace(' Bank', '')).join(' & ')} • Synced`
                    : `${activeAccounts[0]?.bankName || 'HDFC Bank'} • Synced`}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.amountRow}>
            <Typography variant="h1" color={COLORS.white} style={styles.heroAmount}>
              {hasConnectedAccounts
                ? showBalance
                  ? formatCurrency(totalBankBalance)
                  : '••••••'
                : '—'}
            </Typography>
          </View>

          {/* Key Monthly Cash Flow Metrics: Cash In, Cash Out, Remaining This Month */}
          <View style={styles.heroMetricsGrid}>
            <View style={styles.heroMetricCol}>
              <View style={styles.metricLabelContainer}>
                <Typography variant="caption" style={styles.metricLabel} numberOfLines={2}>
                  Monthly Income
                </Typography>
              </View>
              <Typography variant="bodyBold" color={COLORS.white} style={styles.metricValue} numberOfLines={1}>
                {monthlyIncome != null ? formatINR(monthlyIncome) : '—'}
              </Typography>
            </View>

            <View style={[styles.heroMetricCol, styles.heroMetricColCenter]}>
              <View style={styles.metricLabelContainer}>
                <Typography variant="caption" style={styles.metricLabel} numberOfLines={2}>
                  Monthly Spending & Bills
                </Typography>
              </View>
              <Typography variant="bodyBold" color={COLORS.white} style={styles.metricValue} numberOfLines={1}>
                {monthlySpending != null ? formatINR(monthlySpending) : '—'}
              </Typography>
            </View>

            <View style={[styles.heroMetricCol, styles.heroMetricColRight]}>
              <View style={[styles.metricLabelContainer, styles.metricLabelContainerRight]}>
                <Typography variant="caption" style={[styles.metricLabel, styles.metricLabelRight]} numberOfLines={2}>
                  Money Left Each Month
                </Typography>
              </View>
              <Typography variant="bodyBold" color={COLORS.gold} style={[styles.metricValue, styles.metricValueRight]} numberOfLines={1}>
                {moneyLeft != null ? formatSigned(moneyLeft) : '—'}
              </Typography>
            </View>
          </View>
          <Typography variant="caption" style={styles.heroAverageNote}>
            6-month average from your transactions, not one salary payment.
          </Typography>
        </Card>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <ActionItem
            icon={<ScanLine color={COLORS.primary} size={22} strokeWidth={1.8} />}
            title="Scan Receipt"
            onPress={() => router.push('/upload')}
          />
          <ActionItem
            icon={<ImageIcon color={COLORS.primary} size={22} strokeWidth={1.8} />}
            title="Upload UPI"
            onPress={() => router.push('/upload')}
          />
          <ActionItem
            icon={<Users color={COLORS.primary} size={22} strokeWidth={1.8} />}
            title="Split Bill"
            onPress={() => router.push('/split')}
          />
          <ActionItem
            icon={<PieChart color={COLORS.primary} size={22} strokeWidth={1.8} />}
            title="Insights"
            onPress={() => router.push('/(tabs)/insights')}
          />
        </View>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            FINANCIAL INTELLIGENCE ENTRY POINT (Mockup Screen 1)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={styles.fiSectionWrap}>
          <Typography variant="cardHeading" style={styles.fiSectionTitle}>
            Financial Intelligence
          </Typography>
          <TouchableOpacity
            style={styles.fiCard}
            onPress={() => router.push('/(tabs)/insights')}
            activeOpacity={0.8}
          >
            <View style={styles.fiIconBox}>
              <Sparkles size={20} color={COLORS.gold} />
            </View>
            <View style={styles.fiContent}>
              <Typography variant="bodyBold" color={COLORS.primary} style={styles.fiCardTitle}>
                Financial Intelligence
              </Typography>
              <Typography variant="caption" color={COLORS.textSecondary}>
                Plan smarter with AI insights
              </Typography>
            </View>
            <ChevronRight size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            UPCOMING OBLIGATIONS & CASH FLOW
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {aaState.aa_connected && (
          <Card style={styles.obligationCard}>
            <View style={styles.obligationHeadingBlock}>
              <Typography variant="cardHeading" style={styles.obligationTitle}>
                Upcoming Obligations
              </Typography>
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.obligationSubtitle}>
                {upcomingObligations.length > 0
                  ? `Next due ${upcomingObligations[0].due_date}`
                  : 'None found in your transactions'}
              </Typography>
            </View>

            <View style={styles.obligationList}>
              {upcomingObligations.length === 0 ? (
                <Typography variant="caption" color={COLORS.textSecondary}>
                  Recurring bills show here once they appear in your transactions.
                </Typography>
              ) : (
                upcomingObligations.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View style={styles.obligationDivider} /> : null}
                    <View style={styles.obligationRow}>
                      <View style={styles.calendarIconWrapper}>
                        <Calendar size={18} color={COLORS.primary} strokeWidth={1.8} />
                      </View>
                      <View style={styles.obligationInfo}>
                        <Typography variant="bodySemiBold" color={COLORS.primary} style={styles.obligationBillName} numberOfLines={1}>
                          {item.name}
                        </Typography>
                        <Typography variant="caption" color={COLORS.textSecondary} style={styles.obligationMeta} numberOfLines={1}>
                          {`Due ${item.due_date}${item.recurrence ? ` • ${item.recurrence}` : ''}`}
                        </Typography>
                      </View>
                      <View style={styles.obligationAmountWrapper}>
                        <Typography variant="bodyBold" color={COLORS.primary} style={styles.obligationAmount} numberOfLines={1}>
                          {formatINR(item.amount)}
                        </Typography>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </Card>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SPENDING BREAKDOWN
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Card style={styles.sectionCard}>
          <Typography variant="h3" style={styles.sectionTitle}>
            Top Spending Categories
          </Typography>

          <TopSpendingCategoriesChart />
        </Card>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            MONEY LEAKS
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Card style={styles.sectionCard}>
          <View style={styles.leakHeader}>
            <Typography variant="h3">Money Leaks</Typography>
            <View style={styles.leakTotalBadge}>
              <Typography variant="caption" color={COLORS.error}>
                ₹1,450 Total
              </Typography>
            </View>
          </View>

          <View style={styles.leakList}>
            <LeakItem title="Tea & Coffee" amount="₹450" count="9 micro-transactions" />
            <LeakItem title="Snacks" amount="₹600" count="12 transactions" />
            <LeakItem title="Auto & Quick Cabs" amount="₹250" count="4 short rides" />
            <LeakItem title="Impulse Buys" amount="₹150" count="3 small orders" />
          </View>

          <View style={styles.leakFooterBox}>
            <Typography variant="caption" color={COLORS.textSecondary} align="center">
              Small purchases under ₹100 often go unnoticed.
            </Typography>
          </View>
        </Card>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            FINANCIAL COPILOT INSIGHT: POSITIVE CASH FLOW TRAJECTORY
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Card style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <View style={styles.insightTag}>
              <Sparkles size={13} color={COLORS.gold} />
              <Text style={styles.insightTagText}>ASSAY CLARITY</Text>
            </View>
            <Typography variant="caption" color={COLORS.textSecondary}>
              Automated Analysis
            </Typography>
          </View>

          <Typography variant="bodyBold" color={COLORS.primary} style={styles.insightHeadline}>
            {aaState.aa_connected
              ? "Positive Cash Flow Trajectory"
              : "Basic spend tracking active"}
          </Typography>
          <Typography variant="secondary" color={COLORS.textSecondary} style={styles.insightDetail}>
            {aaState.aa_connected
              ? "Your liquid reserves comfortably cover projected month-end commitments of ₹14,200. ₹52,550 surplus is eligible for compounding."
              : "Upload recent receipts or link your account via Settings to unlock full cash flow forecasting."}
          </Typography>
        </Card>

        {/* Bottom padding for tab bar and floating action elements */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const ActionItem = ({ icon, title, onPress }: { icon: React.ReactNode; title: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.actionIconWrapper}>{icon}</View>
    <Typography variant="caption" align="center" style={styles.actionTitle}>
      {title}
    </Typography>
  </TouchableOpacity>
);


const LeakItem = ({ title, amount, count }: { title: string; amount: string; count: string }) => (
  <View style={styles.leakItemRow}>
    <View>
      <Typography variant="bodyMedium">{title}</Typography>
      <Typography variant="caption" color={COLORS.textSecondary}>{count}</Typography>
    </View>
    <Typography variant="financial" color={COLORS.error}>
      {amount}
    </Typography>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 8,
  },
  limitedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: SIZES.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  limitedBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  limitedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  limitedTextWrap: {
    flex: 1,
    gap: 1,
  },
  connectPill: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  connectPillText: {
    color: COLORS.white,
    fontFamily: FONTS.bodySemiBold,
    fontSize: 12,
  },
  heroCard: {
    marginBottom: SPACING.xl,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroLabel: {
    fontSize: 13,
  },
  bankStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  bankStatusText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontFamily: FONTS.bodyMedium,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  heroAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    lineHeight: 42,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 163, 74, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
  },
  trendText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  heroAverageNote: {
    color: 'rgba(255, 255, 255, 0.62)',
    marginTop: 12,
    lineHeight: 16,
  },
  heroMetricsGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 18,
    paddingBottom: 4,
    marginTop: 2,
  },
  heroMetricCol: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  heroMetricColCenter: {
    paddingHorizontal: 6,
    alignItems: 'flex-start',
  },
  heroMetricColRight: {
    flex: 1.18,
    alignItems: 'flex-end',
  },
  metricLabelContainer: {
    minHeight: 28,
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  metricLabelContainerRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: FONTS.bodyMedium,
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 14,
  },
  metricLabelRight: {
    textAlign: 'right',
  },
  metricValue: {
    fontSize: 16.5,
    lineHeight: 22,
    fontFamily: FONTS.bodyBold,
  },
  metricValueRight: {
    textAlign: 'right',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xl,
  },
  actionItem: {
    alignItems: 'center',
    width: 74,
  },
  actionIconWrapper: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionTitle: {
    lineHeight: 16,
    fontSize: 12,
  },
  insightCard: {
    backgroundColor: '#FCFAF5',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.3)',
    borderRadius: SIZES.cardRadius,
    padding: 20,
    marginBottom: SPACING.xl,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  insightTagText: {
    fontFamily: FONTS.bodyBold,
    fontSize: 10,
    color: '#927014',
    letterSpacing: 0.8,
  },
  insightHeadline: {
    fontSize: 16,
    marginBottom: 4,
  },
  insightDetail: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  sectionCard: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    marginBottom: SPACING.base,
  },
  obligationCard: {
    paddingHorizontal: 22,
    paddingVertical: 22,
    marginBottom: SPACING.xl,
  },
  obligationHeadingBlock: {
    marginBottom: 20,
  },
  obligationTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: FONTS.bodySemiBold,
    color: COLORS.primary,
  },
  obligationSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  obligationList: {
    gap: 0,
  },
  obligationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 80,
    paddingVertical: 12,
  },
  calendarIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  obligationInfo: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: 14,
    marginRight: 12,
  },
  obligationBillName: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONTS.bodySemiBold,
    color: COLORS.primary,
  },
  obligationMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  obligationAmountWrapper: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  obligationAmount: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
    textAlign: 'right',
  },
  obligationDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    opacity: 0.8,
  },
  leakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.base,
  },
  leakTotalBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  leakList: {
    gap: 12,
    marginBottom: 16,
  },
  leakItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  leakFooterBox: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  fiSectionWrap: {
    marginBottom: 16,
  },
  fiSectionTitle: {
    fontSize: 16,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
    marginBottom: 8,
  },
  fiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fiIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  fiContent: {
    flex: 1,
  },
  fiCardTitle: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
    marginBottom: 2,
  },
});
