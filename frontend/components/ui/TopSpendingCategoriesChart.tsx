import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS } from '../../constants/theme';
import { Typography } from '../Typography';
import { fetchSpendingBreakdown, formatINR, SpendingCategory } from '../../services/finance';
import { CATEGORY_COLORS } from '../../services/transactions';

export interface SpendingCategoryData {
  label: string;
  percent: string;
  value: number;
  amount: string;
  color: string;
  lineColor: string;
}

const MAX_SEGMENTS = 5;
const FALLBACK_COLOR = '#94A3B8';

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

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Collapse API categories into at most MAX_SEGMENTS rows (tail aggregated into "Others"). */
function toChartCategories(apiCategories: SpendingCategory[]): SpendingCategoryData[] {
  const sorted = [...apiCategories]
    .filter((c) => Number(c.amount) > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((sum, c) => sum + Number(c.amount), 0);
  if (total <= 0) return [];

  const head = sorted.slice(0, MAX_SEGMENTS - 1);
  const tail = sorted.slice(MAX_SEGMENTS - 1);
  const rows: Array<{ label: string; amount: number }> = head.map((c) => ({
    label: c.name,
    amount: Number(c.amount),
  }));
  if (tail.length === 1) {
    rows.push({ label: tail[0].name, amount: Number(tail[0].amount) });
  } else if (tail.length > 1) {
    rows.push({ label: 'Others', amount: tail.reduce((sum, c) => sum + Number(c.amount), 0) });
  }

  return rows.map((row) => {
    const pct = (row.amount / total) * 100;
    const color = CATEGORY_COLORS[row.label] || FALLBACK_COLOR;
    return {
      label: row.label,
      percent: `${Math.round(pct)}%`,
      value: pct,
      amount: formatINR(row.amount),
      color,
      lineColor: hexToRgba(color, 0.45),
    };
  });
}

export interface TopSpendingCategoriesChartProps {
  customCategories?: SpendingCategoryData[];
}

export function TopSpendingCategoriesChart({ customCategories }: TopSpendingCategoriesChartProps = {}) {
  const hasCustom = Boolean(customCategories && customCategories.length > 0);
  const [apiCategories, setApiCategories] = useState<SpendingCategory[] | null>(null);
  const [loading, setLoading] = useState(!hasCustom);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (hasCustom) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchSpendingBreakdown()
      .then((cats) => {
        if (!cancelled) setApiCategories(cats);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasCustom]);

  const categories = useMemo<SpendingCategoryData[]>(() => {
    if (customCategories && customCategories.length > 0) return customCategories;
    return toChartCategories(apiCategories || []);
  }, [apiCategories, customCategories]);

  const cx = 170;
  const cy = 170;
  const r = 84;
  const strokeWidth = 24;
  const gapDeg = 3;
  const labelRadius = r + strokeWidth / 2 + 30;

  const segments = useMemo(() => {
    const totalValue = categories.reduce((sum, c) => sum + c.value, 0);
    if (totalValue <= 0) return [];
    const usable = 360 - gapDeg * categories.length;
    let cursor = -90;
    return categories.map((cat) => {
      const sweep = (cat.value / totalValue) * usable;
      const start = cursor;
      const end = cursor + sweep;
      cursor = end + gapDeg;
      const mid = (start + end) / 2;
      const outerX = cx + (r + strokeWidth / 2) * Math.cos(toRad(mid));
      const outerY = cy + (r + strokeWidth / 2) * Math.sin(toRad(mid));
      const labelX = cx + labelRadius * Math.cos(toRad(mid));
      const labelY = cy + labelRadius * Math.sin(toRad(mid));
      const anchor: 'start' | 'end' | 'middle' =
        Math.abs(Math.cos(toRad(mid))) < 0.25 ? 'middle' : Math.cos(toRad(mid)) > 0 ? 'start' : 'end';
      return { cat, start, end: Math.max(end, start + 0.1), outerX, outerY, labelX, labelY, anchor };
    });
  }, [categories]);

  const totalAmount = useMemo(() => {
    if (customCategories && customCategories.length > 0) return null;
    const total = (apiCategories || []).reduce((sum, c) => sum + Number(c.amount), 0);
    return total > 0 ? formatINR(total) : null;
  }, [apiCategories, customCategories]);

  if (loading) {
    return (
      <View style={styles.stateBox}>
        <ActivityIndicator color={COLORS.primary} />
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.stateText}>
          Loading spending breakdown…
        </Typography>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stateBox}>
        <Typography variant="bodyMedium" color={COLORS.text} align="center">
          Spending data unavailable
        </Typography>
        <Typography variant="caption" color={COLORS.textSecondary} align="center" style={styles.stateText}>
          Could not reach the Assay backend. Pull to refresh once it is running.
        </Typography>
      </View>
    );
  }

  if (categories.length === 0) {
    return (
      <View style={styles.stateBox}>
        <Typography variant="bodyMedium" color={COLORS.text} align="center">
          No spending data yet
        </Typography>
        <Typography variant="caption" color={COLORS.textSecondary} align="center" style={styles.stateText}>
          Connect an account or add transactions to see your top categories.
        </Typography>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Svg viewBox="0 0 340 355" style={styles.svg}>
        {/* Donut segments, proportional to API amounts */}
        {segments.map(({ cat, start, end }) => (
          <Path
            key={`seg-${cat.label}`}
            d={getArcPath(cx, cy, r, start, end)}
            stroke={cat.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            fill="none"
          />
        ))}

        {/* Callout lines + external labels (percent + category) */}
        {segments.map(({ cat, outerX, outerY, labelX, labelY, anchor }) => {
          const textX = anchor === 'start' ? labelX + 4 : anchor === 'end' ? labelX - 4 : labelX;
          return (
            <React.Fragment key={`label-${cat.label}`}>
              <Path
                d={`M ${outerX} ${outerY} L ${labelX} ${labelY}`}
                stroke={cat.lineColor}
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <SvgText
                x={textX}
                y={labelY - 2}
                fontSize={16}
                fontWeight="700"
                fontFamily={FONTS.bodyBold}
                fill={COLORS.primary}
                textAnchor={anchor}
              >
                {cat.percent}
              </SvgText>
              <SvgText
                x={textX}
                y={labelY + 13}
                fontSize={11.5}
                fontWeight="500"
                fontFamily={FONTS.bodyMedium}
                fill={COLORS.textSecondary}
                textAnchor={anchor}
              >
                {cat.label}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Donut center content */}
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
          fontSize={totalAmount ? 20 : 23}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="middle"
        >
          {totalAmount ?? 'Spend'}
        </SvgText>
      </Svg>

      {/* Legend list */}
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
  stateBox: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  stateText: {
    textAlign: 'center',
    maxWidth: 260,
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
