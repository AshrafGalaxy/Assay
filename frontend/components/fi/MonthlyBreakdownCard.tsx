import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Typography } from '../Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface MonthlyBreakdownData {
  month: string;
  openingBalance: number;
  income: number;
  expenses: number;
  debtPayments?: number;
  closingBalance: number;
  isTrough?: boolean;
}

export interface MonthlyBreakdownCardProps {
  data: MonthlyBreakdownData;
  initiallyExpanded?: boolean;
}

export function MonthlyBreakdownCard({ data, initiallyExpanded = false }: MonthlyBreakdownCardProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const formatAmount = (val: number, prefix: string = '') => {
    return `${prefix}₹${Math.abs(val).toLocaleString('en-IN')}`;
  };

  return (
    <View style={[styles.card, data.isTrough && styles.cardHighlight]}>
      <TouchableOpacity style={styles.headerRow} onPress={toggle} activeOpacity={0.75}>
        <View style={styles.titleWrap}>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.monthTitle}>
            {data.month}
          </Typography>
          {data.isTrough && (
            <View style={styles.troughBadge}>
              <Typography variant="caption" color={COLORS.gold} style={styles.troughText}>
                Lowest Point
              </Typography>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {expanded ? (
            <ChevronUp size={18} color={COLORS.textSecondary} />
          ) : (
            <ChevronDown size={18} color={COLORS.textSecondary} />
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.summaryList}>
        <View style={styles.dataRow}>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.label}>
            Opening Balance
          </Typography>
          <Typography variant="bodyMedium" color={COLORS.primary} style={styles.amount}>
            {formatAmount(data.openingBalance)}
          </Typography>
        </View>

        <View style={styles.dataRow}>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.label}>
            Monthly Income
          </Typography>
          <Typography variant="bodyMedium" color={COLORS.primary} style={styles.incomeAmount}>
            {formatAmount(data.income, '+')}
          </Typography>
        </View>

        <View style={styles.dataRow}>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.label}>
            Monthly Spending & Bills
          </Typography>
          <Typography variant="bodyMedium" color={COLORS.primary} style={styles.expenseAmount}>
            {formatAmount(data.expenses, '-')}
          </Typography>
        </View>

        {expanded && data.debtPayments != null && (
          <View style={styles.dataRow}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.label}>
              Debt / Obligations
            </Typography>
            <Typography variant="bodyMedium" color={COLORS.primary} style={styles.expenseAmount}>
              {formatAmount(data.debtPayments, '-')}
            </Typography>
          </View>
        )}

        <View style={[styles.dataRow, styles.closingRow]}>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.closingLabel}>
            Expected Cash
          </Typography>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.closingAmount}>
            {formatAmount(data.closingBalance)}
          </Typography>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  cardHighlight: {
    borderColor: COLORS.gold,
    borderWidth: 1.5,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1EF',
    marginBottom: 10,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthTitle: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
  },
  troughBadge: {
    backgroundColor: '#FAF5E8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EBDCB4',
  },
  troughText: {
    fontSize: 10,
    fontFamily: FONTS.bodyMedium,
    color: '#8F6C10',
  },
  headerRight: {
    padding: 2,
  },
  summaryList: {
    gap: 8,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
  },
  amount: {
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
  },
  incomeAmount: {
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.primary,
  },
  expenseAmount: {
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.textSecondary,
  },
  closingRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F1EF',
    paddingTop: 8,
    marginTop: 2,
  },
  closingLabel: {
    fontSize: 14,
    fontFamily: FONTS.bodyBold,
  },
  closingAmount: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
  },
});
