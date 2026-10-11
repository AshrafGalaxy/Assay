import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { Card } from '../../components/Card';
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { COLORS, SIZES, SPACING } from '../../constants/theme';
import { api, endpoints } from '../../services/api';
import { 
  ChevronLeft, 
  SlidersHorizontal, 
  ChevronRight, 
  Sparkles, 
  Sprout 
} from 'lucide-react-native';

interface DebtBreakdownData {
  total_outstanding_debt: number;
  dti_ratio: number;
  dti_status: string;
  total_monthly_emis: number;
  avg_blended_apr: number;
  loans: Array<{
    id: string;
    name: string;
    bank: string;
    balance: number;
    detail: string;
    schedule: string;
    monthly_emi: number;
    apr: string;
    apr_rate: number;
    is_high_apr: boolean;
    progress: number;
    progress_label: string;
  }>;
  avalanche_recommendation: {
    target_debt_id: string;
    target_name: string;
    payoff_amount: number;
    annual_interest_saved: number;
    recommendation_text: string;
  } | null;
}

interface LoanItemProps {
  name: string;
  bank: string;
  balance: string;
  detail: string;
  schedule: string;
  apr: string;
  isHighApr?: boolean;
  progress: number;
  progressLabel: string;
  onPress?: () => void;
}

function LoanItem({
  name,
  bank,
  balance,
  detail,
  schedule,
  apr,
  isHighApr = false,
  progress,
  progressLabel,
  onPress,
}: LoanItemProps) {
  return (
    <TouchableOpacity 
      style={styles.loanCard} 
      activeOpacity={0.75} 
      onPress={onPress}
    >
      <View style={styles.loanTopRow}>
        <MerchantLogo name={bank} size={44} style={styles.bankLogo} />
        
        <View style={styles.loanInfoCol}>
          <View style={styles.loanHeaderRow}>
            <Typography variant="bodyBold" style={styles.loanTitle} numberOfLines={1}>
              {name}
            </Typography>
            <View style={[styles.aprBadge, isHighApr ? styles.highAprBadge : styles.normalAprBadge]}>
              <Typography 
                variant="caption" 
                style={[styles.aprText, isHighApr ? styles.highAprText : styles.normalAprText]}
              >
                {apr}
              </Typography>
            </View>
            <ChevronRight color={COLORS.textSecondary} size={18} />
          </View>

          <Typography variant="caption" color={COLORS.textSecondary} style={styles.balanceText}>
            Balance: <Typography variant="bodyBold" style={styles.balanceHighlight}>{balance}</Typography>
            {detail ? ` • ${detail}` : ''}
          </Typography>

          <Typography variant="caption" color={COLORS.textSecondary} style={styles.scheduleText}>
            {schedule}
          </Typography>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.progressLabel}>
              {progressLabel}
            </Typography>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DebtAndLiabilitiesScreen() {
  const router = useRouter();
  const [data, setData] = useState<DebtBreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDebtBreakdown = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get(endpoints.planning.debtBreakdown);
      setData(res.data ?? null);
    } catch (err) {
      setData(null);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDebtBreakdown();
  }, [fetchDebtBreakdown]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topHeader}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <ChevronLeft color={COLORS.text} size={24} />
          </TouchableOpacity>
          <Typography variant="h2" style={styles.screenTitle}>Debt & Liabilities</Typography>
          <View style={{ width: 32 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {loading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <Typography variant="secondary" color={COLORS.textSecondary} style={{ textAlign: 'center' }}>
              No debt data yet. Debt is derived from recurring loan and EMI payments in your transactions.
            </Typography>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft color={COLORS.text} size={24} />
        </TouchableOpacity>
        
        <Typography variant="h2" style={styles.screenTitle}>
          Debt & Liabilities
        </Typography>

        <TouchableOpacity 
          style={styles.filterButton}
          activeOpacity={0.7}
          onPress={() => fetchDebtBreakdown(true)}
        >
          <SlidersHorizontal color={COLORS.text} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDebtBreakdown(true)}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Dark Hero Summary Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Typography variant="caption" style={styles.heroLabel}>
              Total Repaid (from transactions)
            </Typography>
            <View style={styles.dtiBadge}>
              <Sprout color="#4ADE80" size={14} style={{ marginRight: 4 }} />
              <Typography variant="caption" style={styles.dtiBadgeText}>
                DTI: {Math.round(data.dti_ratio)}% ({data.dti_status})
              </Typography>
            </View>
          </View>

          <Typography variant="display" style={styles.heroAmount}>
            ₹{Math.round(data.total_outstanding_debt).toLocaleString('en-IN')}
          </Typography>

          <View style={styles.heroDivider} />

          <View style={styles.heroBottomRow}>
            <View style={styles.heroStatCol}>
              <Typography variant="caption" style={styles.heroStatLabel}>
                Total Monthly EMIs
              </Typography>
              <Typography variant="h3" style={styles.heroStatValue}>
                ₹{Math.round(data.total_monthly_emis).toLocaleString('en-IN')}
              </Typography>
            </View>

            <View style={styles.heroStatDivider} />

            <View style={styles.heroStatCol}>
              <Typography variant="caption" style={styles.heroStatLabel}>
                Avg. Blended APR
              </Typography>
              <Typography variant="h3" style={styles.heroStatValue}>
                {data.avg_blended_apr > 0 ? `${data.avg_blended_apr.toFixed(1)}%` : 'n/a'}
              </Typography>
            </View>
          </View>
        </View>

        {/* Section: Active Credit Lines & Loans */}
        <Typography variant="cardHeading" style={styles.sectionHeader}>
          Active Credit Lines & Loans
        </Typography>

        {data.loans.map((loan) => (
          <LoanItem
            key={loan.id}
            name={loan.name}
            bank={loan.bank}
            balance={`₹${Math.round(loan.balance).toLocaleString('en-IN')}`}
            detail={loan.detail}
            schedule={loan.schedule}
            apr={loan.apr}
            isHighApr={loan.is_high_apr}
            progress={loan.progress}
            progressLabel={loan.progress_label}
            onPress={() => router.push('/simulator')}
          />
        ))}

        {/* Avalanche Payoff Recommendation Card */}
        {data.avalanche_recommendation && (
          <View style={styles.recommendationCard}>
            <View style={styles.recommendationHeader}>
              <View style={styles.sparkleBadge}>
                <Sparkles color="#B45309" size={20} />
              </View>
              <Typography variant="bodyBold" style={styles.recommendationTitle}>
                Avalanche Payoff Recommendation
              </Typography>
            </View>

            <Typography variant="secondary" color={COLORS.text} style={styles.recommendationBody}>
              {data.avalanche_recommendation.recommendation_text}
            </Typography>

            <TouchableOpacity 
              style={styles.simulateButton}
              onPress={() => router.push('/simulator')}
              activeOpacity={0.8}
            >
              <Typography variant="bodyBold" style={styles.simulateButtonText}>
                Simulate Lump-Sum Payoff
              </Typography>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  screenTitle: {
    fontSize: 24,
    color: COLORS.text,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroLabel: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  dtiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  dtiBadgeText: {
    color: '#4ADE80',
    fontWeight: '600',
    fontSize: 12,
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '700',
    marginBottom: 20,
  },
  heroDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginBottom: 16,
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroStatCol: {
    flex: 1,
  },
  heroStatDivider: {
    width: 1,
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
  },
  heroStatLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 4,
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 18,
    marginBottom: 14,
    color: COLORS.text,
  },
  loanCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  loanTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bankLogo: {
    marginRight: 12,
    marginTop: 2,
  },
  loanInfoCol: {
    flex: 1,
  },
  loanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  loanTitle: {
    fontSize: 15,
    flex: 1,
    color: COLORS.text,
  },
  aprBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 6,
  },
  normalAprBadge: {
    backgroundColor: '#DCFCE7',
  },
  highAprBadge: {
    backgroundColor: '#FEE2E2',
  },
  aprText: {
    fontSize: 11,
    fontWeight: '600',
  },
  normalAprText: {
    color: '#16A34A',
  },
  highAprText: {
    color: '#DC2626',
  },
  balanceText: {
    fontSize: 13,
    marginBottom: 2,
  },
  balanceHighlight: {
    fontSize: 13,
    color: COLORS.text,
  },
  scheduleText: {
    fontSize: 12,
    marginBottom: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#C89B3C',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    minWidth: 65,
    textAlign: 'right',
  },
  recommendationCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 20,
    marginTop: 10,
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sparkleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recommendationTitle: {
    fontSize: 16,
    color: COLORS.text,
    flex: 1,
  },
  recommendationBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  simulateButton: {
    backgroundColor: '#D6A928',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simulateButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
});
