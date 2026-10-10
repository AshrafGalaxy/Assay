import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS } from '../../constants/theme';
import { Typography } from '../Typography';
import { useTransactions } from '../../services/transactions';
import { isCurrentCalendarMonth } from '../../utils/date';

export interface SpendingCategoryData {
  label: string;
  percent: string;
  value: number;
  amount: string;
  color: string;
  lineColor: string;
}

export const DEFAULT_SPENDING_CATEGORIES: SpendingCategoryData[] = [
  {
    label: 'Food & Dining',
    percent: '35%',
    value: 35,
    amount: '₹11,400',
    color: '#F59E0B', // Gold / Amber
    lineColor: 'rgba(245, 158, 11, 0.45)',
  },
  {
    label: 'Shopping',
    percent: '25%',
    value: 25,
    amount: '₹8,200',
    color: '#111827', // Deep Navy
    lineColor: 'rgba(17, 24, 39, 0.35)',
  },
  {
    label: 'Transport',
    percent: '16%',
    value: 16,
    amount: '₹5,150',
    color: '#10B981', // Emerald Green
    lineColor: 'rgba(16, 185, 129, 0.45)',
  },
  {
    label: 'Subscriptions',
    percent: '14%',
    value: 14,
    amount: '₹4,400',
    color: '#F97316', // Orange
    lineColor: 'rgba(249, 115, 22, 0.45)',
  },
  {
    label: 'Others',
    percent: '10%',
    value: 10,
    amount: '₹3,300',
    color: '#94A3B8', // Muted Grey
    lineColor: 'rgba(148, 163, 184, 0.5)',
  },
];

const toRad = (deg: number) => (deg * Math.PI) / 180;

const getArcPath = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const s = toRad(startAngle);
  const e = toRad(endAngle);
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
};

export interface TopSpendingCategoriesChartProps {
  customCategories?: SpendingCategoryData[];
}

export function TopSpendingCategoriesChart({ customCategories }: TopSpendingCategoriesChartProps = {}) {
  const { transactions } = useTransactions();

  const categories = useMemo(() => {
    if (customCategories && customCategories.length > 0) {
      return customCategories;
    }

    const baseMap: Record<string, number> = {
      'Food & Dining': 11400,
      'Shopping': 8200,
      'Transport': 5150,
      'Subscriptions': 4400,
      'Others': 3300,
    };

    // Incorporate current month manual debit transactions dynamically
    for (const tx of transactions) {
      if (
        tx.source_type === 'manual' &&
        tx.type === 'debit' &&
        isCurrentCalendarMonth(tx.transaction_date)
      ) {
        const cat = tx.category in baseMap ? tx.category : 'Others';
        baseMap[cat] = (baseMap[cat] || 0) + (Number(tx.amount) || 0);
      }
    }

    const total = Object.values(baseMap).reduce((s, a) => s + a, 0);

    return [
      {
        label: 'Food & Dining',
        percent: `${Math.round((baseMap['Food & Dining'] / total) * 100)}%`,
        value: Math.round((baseMap['Food & Dining'] / total) * 100),
        amount: `₹${baseMap['Food & Dining'].toLocaleString('en-IN')}`,
        color: '#F59E0B',
        lineColor: 'rgba(245, 158, 11, 0.45)',
      },
      {
        label: 'Shopping',
        percent: `${Math.round((baseMap['Shopping'] / total) * 100)}%`,
        value: Math.round((baseMap['Shopping'] / total) * 100),
        amount: `₹${baseMap['Shopping'].toLocaleString('en-IN')}`,
        color: '#111827',
        lineColor: 'rgba(17, 24, 39, 0.35)',
      },
      {
        label: 'Transport',
        percent: `${Math.round((baseMap['Transport'] / total) * 100)}%`,
        value: Math.round((baseMap['Transport'] / total) * 100),
        amount: `₹${baseMap['Transport'].toLocaleString('en-IN')}`,
        color: '#10B981',
        lineColor: 'rgba(16, 185, 129, 0.45)',
      },
      {
        label: 'Subscriptions',
        percent: `${Math.round((baseMap['Subscriptions'] / total) * 100)}%`,
        value: Math.round((baseMap['Subscriptions'] / total) * 100),
        amount: `₹${baseMap['Subscriptions'].toLocaleString('en-IN')}`,
        color: '#F97316',
        lineColor: 'rgba(249, 115, 22, 0.45)',
      },
      {
        label: 'Others',
        percent: `${Math.round((baseMap['Others'] / total) * 100)}%`,
        value: Math.round((baseMap['Others'] / total) * 100),
        amount: `₹${baseMap['Others'].toLocaleString('en-IN')}`,
        color: '#94A3B8',
        lineColor: 'rgba(148, 163, 184, 0.5)',
      },
    ];
  }, [transactions, customCategories]);

  const cx = 170;
  const cy = 170;
  const r = 84;
  const strokeWidth = 24;

  const foodCat = categories.find((c) => c.label === 'Food & Dining') || categories[0];
  const shopCat = categories.find((c) => c.label === 'Shopping') || categories[1];
  const transCat = categories.find((c) => c.label === 'Transport') || categories[2];
  const subCat = categories.find((c) => c.label === 'Subscriptions') || categories[3];
  const otherCat = categories.find((c) => c.label === 'Others') || categories[4];

  return (
    <View style={styles.container}>
      <Svg viewBox="0 0 340 355" style={styles.svg}>
        {/* ── 1. SEGMENT 1: Food & Dining (Gold) ── */}
        <Path
          d={getArcPath(cx, cy, r, -78.5, 44.5)}
          stroke="#F59E0B"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ── 2. SEGMENT 2: Transport (Green) ── */}
        <Path
          d={getArcPath(cx, cy, r, 47.5, 102.1)}
          stroke="#10B981"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ── 3. SEGMENT 3: Subscriptions (Orange) ── */}
        <Path
          d={getArcPath(cx, cy, r, 105.1, 152.5)}
          stroke="#F97316"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ── 4. SEGMENT 4: Others (Grey) ── */}
        <Path
          d={getArcPath(cx, cy, r, 155.5, 188.5)}
          stroke="#94A3B8"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ── 5. SEGMENT 5: Shopping (Dark Navy) ── */}
        <Path
          d={getArcPath(cx, cy, r, 191.5, 278.5)}
          stroke="#111827"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            CALLOUT CONNECTING LINES
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Path
          d="M 115 91 L 64 68 L 64 54"
          stroke="rgba(17, 24, 39, 0.35)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="M 262 142 L 278 84 L 278 58"
          stroke="rgba(245, 158, 11, 0.45)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="M 195 263 L 244 286"
          stroke="rgba(16, 185, 129, 0.45)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="M 116 250 L 136 302"
          stroke="rgba(249, 115, 22, 0.45)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="M 75 183 L 48 245 L 48 266"
          stroke="rgba(148, 163, 184, 0.5)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            EXTERNAL LABELS (PERCENT + CATEGORY)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Upper Left: Shopping */}
        <SvgText
          x={18}
          y={36}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="start"
        >
          {shopCat.percent}
        </SvgText>
        <SvgText
          x={18}
          y={53}
          fontSize={12.5}
          fontWeight="500"
          fontFamily={FONTS.bodyMedium}
          fill={COLORS.textSecondary}
          textAnchor="start"
        >
          Shopping
        </SvgText>

        {/* Upper Right: Food & Dining */}
        <SvgText
          x={322}
          y={36}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="end"
        >
          {foodCat.percent}
        </SvgText>
        <SvgText
          x={322}
          y={53}
          fontSize={12.5}
          fontWeight="500"
          fontFamily={FONTS.bodyMedium}
          fill={COLORS.textSecondary}
          textAnchor="end"
        >
          Food & Dining
        </SvgText>

        {/* Lower Right: Transport */}
        <SvgText
          x={264}
          y={296}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="middle"
        >
          {transCat.percent}
        </SvgText>
        <SvgText
          x={264}
          y={313}
          fontSize={12.5}
          fontWeight="500"
          fontFamily={FONTS.bodyMedium}
          fill={COLORS.textSecondary}
          textAnchor="middle"
        >
          Transport
        </SvgText>

        {/* Bottom Center: Subscriptions */}
        <SvgText
          x={136}
          y={320}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="middle"
        >
          {subCat.percent}
        </SvgText>
        <SvgText
          x={136}
          y={337}
          fontSize={12.5}
          fontWeight="500"
          fontFamily={FONTS.bodyMedium}
          fill={COLORS.textSecondary}
          textAnchor="middle"
        >
          Subscriptions
        </SvgText>

        {/* Lower Left: Others */}
        <SvgText
          x={40}
          y={280}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="middle"
        >
          {otherCat.percent}
        </SvgText>
        <SvgText
          x={40}
          y={297}
          fontSize={12.5}
          fontWeight="500"
          fontFamily={FONTS.bodyMedium}
          fill={COLORS.textSecondary}
          textAnchor="middle"
        >
          Others
        </SvgText>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            DONUT CENTER CONTENT
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <SvgText
          x={cx}
          y={cy - 6}
          fontSize={15}
          fontWeight="500"
          fontFamily={FONTS.bodyMedium}
          fill={COLORS.textSecondary}
          textAnchor="middle"
        >
          Total
        </SvgText>
        <SvgText
          x={cx}
          y={cy + 19}
          fontSize={23}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="middle"
        >
          Spend
        </SvgText>
      </Svg>

      {/* Legend list matching application mockup */}
      <View style={styles.legendContainer}>
        {categories.map((cat) => (
          <View key={cat.label} style={styles.legendRow}>
            <View style={styles.legendLeft}>
              <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
              <Typography variant="bodyMedium" color={COLORS.text} style={styles.legendLabel}>
                {cat.label}
              </Typography>
            </View>
            <View style={styles.legendRight}>
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.legendPercent}>
                {cat.percent}
              </Typography>
              <Typography variant="bodyBold" color={COLORS.text} style={styles.legendAmount}>
                {cat.amount}
              </Typography>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  svg: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 340 / 355,
  },
  legendContainer: {
    width: '100%',
    paddingTop: 16,
    paddingHorizontal: 8,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 14,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendPercent: {
    fontSize: 13,
    color: COLORS.textSecondary,
    minWidth: 32,
    textAlign: 'right',
  },
  legendAmount: {
    fontSize: 14,
    minWidth: 70,
    textAlign: 'right',
  },
});
