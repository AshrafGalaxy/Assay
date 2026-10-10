import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Typography } from '../Typography';
import { COLORS, FONTS } from '../../constants/theme';

export interface SpendingCategoryData {
  label: string;
  percent: string;
  value: number;
  amount: string;
  color: string;
  lineColor: string;
}

const PALETTE = ['#F59E0B', '#111827', '#10B981', '#F97316', '#94A3B8', '#6366F1', '#EC4899'];

export const DEFAULT_SPENDING_CATEGORIES: SpendingCategoryData[] = [
  { label: 'Food & Dining', percent: '35%', value: 35, amount: '₹11,400', color: '#F59E0B', lineColor: 'rgba(245, 158, 11, 0.45)' },
  { label: 'Shopping', percent: '25%', value: 25, amount: '₹8,200', color: '#111827', lineColor: 'rgba(17, 24, 39, 0.35)' },
  { label: 'Transport', percent: '16%', value: 16, amount: '₹5,150', color: '#10B981', lineColor: 'rgba(16, 185, 129, 0.45)' },
  { label: 'Subscriptions', percent: '14%', value: 14, amount: '₹4,400', color: '#F97316', lineColor: 'rgba(249, 115, 22, 0.45)' },
  { label: 'Others', percent: '10%', value: 10, amount: '₹3,300', color: '#94A3B8', lineColor: 'rgba(148, 163, 184, 0.5)' },
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

type LiveCategory = { name: string; amount: number; percentage: number };

type Props = {
  categories?: LiveCategory[];
};

export function TopSpendingCategoriesChart({ categories }: Props) {
  const cx = 120;
  const cy = 120;
  const r = 72;
  const strokeWidth = 22;

  const data = useMemo(() => {
    if (!categories?.length) return DEFAULT_SPENDING_CATEGORIES;
    return categories.slice(0, 6).map((item, index) => ({
      label: item.name,
      percent: `${Math.round(item.percentage)}%`,
      value: item.percentage,
      amount: `₹${item.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      color: PALETTE[index % PALETTE.length],
      lineColor: PALETTE[index % PALETTE.length],
    }));
  }, [categories]);

  const arcs = useMemo(() => {
    const total = data.reduce((sum, item) => sum + Math.max(item.value, 0), 0) || 1;
    const gap = 3;
    let cursor = -90;
    return data.map((item) => {
      const sweep = (Math.max(item.value, 0) / total) * (360 - gap * data.length);
      const start = cursor + gap / 2;
      const end = start + sweep;
      cursor = end + gap / 2;
      return { ...item, start, end };
    });
  }, [data]);

  return (
    <View style={styles.container}>
      <Svg viewBox="0 0 240 240" style={styles.svg}>
        {arcs.map((item) => (
          <Path
            key={item.label}
            d={getArcPath(cx, cy, r, item.start, item.end)}
            stroke={item.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            fill="none"
          />
        ))}
      </Svg>

      <View style={styles.legend}>
        {data.map((item) => (
          <View key={item.label} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: item.color }]} />
            <Typography variant="caption" style={styles.legendLabel} numberOfLines={1}>
              {item.label}
            </Typography>
            <Typography variant="caption" color={COLORS.textSecondary}>
              {item.percent}
            </Typography>
            <Typography variant="bodyBold" style={styles.legendAmount}>
              {item.amount}
            </Typography>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 16,
  },
  svg: {
    width: 220,
    height: 220,
  },
  legend: {
    width: '100%',
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    color: COLORS.text,
    fontFamily: FONTS.bodySemiBold,
  },
  legendAmount: {
    minWidth: 72,
    textAlign: 'right',
    color: COLORS.text,
  },
});
