import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS } from '../../constants/theme';

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

// SVG Arc path generator
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

export function TopSpendingCategoriesChart() {
  const cx = 170;
  const cy = 170;
  const r = 84;
  const strokeWidth = 24;

  // Angular ranges in degrees (0° = 3 o'clock, 90° = 6 o'clock, 180° = 9 o'clock, 270°/-90° = 12 o'clock)
  // Segments layout with clean, uniform gaps (3°) and crisp flat (butt) ends:
  // 1. Food & Dining (35% = 126°): -80° to 46°   => -78.5° to 44.5°
  // 2. Transport (16% = 57.6°):    46° to 103.6° => 47.5° to 102.1°
  // 3. Subscriptions (14% = 50.4°):103.6° to 154° => 105.1° to 152.5°
  // 4. Others (10% = 36°):         154° to 190°  => 155.5° to 188.5°
  // 5. Shopping (25% = 90°):       190° to 280°  => 191.5° to 278.5°

  return (
    <View style={styles.container}>
      <Svg viewBox="0 0 340 355" style={styles.svg}>
        {/* ── 1. SEGMENT 1: Food & Dining (35% - Gold) ── */}
        <Path
          d={getArcPath(cx, cy, r, -78.5, 44.5)}
          stroke="#F59E0B"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ── 2. SEGMENT 2: Transport (16% - Green) ── */}
        <Path
          d={getArcPath(cx, cy, r, 47.5, 102.1)}
          stroke="#10B981"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ── 3. SEGMENT 3: Subscriptions (14% - Orange) ── */}
        <Path
          d={getArcPath(cx, cy, r, 105.1, 152.5)}
          stroke="#F97316"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ── 4. SEGMENT 4: Others (10% - Grey) ── */}
        <Path
          d={getArcPath(cx, cy, r, 155.5, 188.5)}
          stroke="#94A3B8"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
        />

        {/* ── 5. SEGMENT 5: Shopping (25% - Dark Navy) ── */}
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

        {/* Shopping Callout Line (Upper Left) */}
        <Path
          d="M 115 91 L 64 68 L 64 54"
          stroke="rgba(17, 24, 39, 0.35)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Food & Dining Callout Line (Upper Right) */}
        <Path
          d="M 262 142 L 278 84 L 278 58"
          stroke="rgba(245, 158, 11, 0.45)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Transport Callout Line (Lower Right) */}
        <Path
          d="M 195 263 L 244 286"
          stroke="rgba(16, 185, 129, 0.45)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Subscriptions Callout Line (Bottom Center) */}
        <Path
          d="M 116 250 L 136 302"
          stroke="rgba(249, 115, 22, 0.45)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Others Callout Line (Lower Left) */}
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

        {/* Upper Left: Shopping (25%) */}
        <SvgText
          x={18}
          y={36}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="start"
        >
          25%
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

        {/* Upper Right: Food & Dining (35%) */}
        <SvgText
          x={322}
          y={36}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="end"
        >
          35%
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

        {/* Lower Right: Transport (16%) */}
        <SvgText
          x={264}
          y={296}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="middle"
        >
          16%
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

        {/* Bottom Center: Subscriptions (14%) */}
        <SvgText
          x={136}
          y={320}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="middle"
        >
          14%
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

        {/* Lower Left: Others (10%) */}
        <SvgText
          x={40}
          y={280}
          fontSize={20}
          fontWeight="700"
          fontFamily={FONTS.bodyBold}
          fill={COLORS.primary}
          textAnchor="middle"
        >
          10%
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
});
