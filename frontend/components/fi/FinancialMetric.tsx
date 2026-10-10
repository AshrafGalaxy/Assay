import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Typography } from '../Typography';
import { COLORS, FONTS } from '../../constants/theme';

export interface FinancialMetricProps {
  label: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  style?: ViewStyle;
}

export function FinancialMetric({
  label,
  value,
  subtitle,
  icon,
  align = 'left',
  style,
}: FinancialMetricProps) {
  return (
    <View style={[styles.container, align === 'center' && styles.center, align === 'right' && styles.right, style]}>
      <View style={[styles.labelRow, align === 'center' && styles.centerRow, align === 'right' && styles.rightRow]}>
        {icon && <View style={styles.iconWrap}>{icon}</View>}
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.label}>
          {label}
        </Typography>
      </View>
      <Typography variant="bodyBold" color={COLORS.primary} style={styles.value}>
        {value}
      </Typography>
      {subtitle ? (
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.subtitle}>
          {subtitle}
        </Typography>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  right: {
    alignItems: 'flex-end',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  centerRow: {
    justifyContent: 'center',
  },
  rightRow: {
    justifyContent: 'flex-end',
  },
  iconWrap: {
    marginRight: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: 18,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
    color: COLORS.textSecondary,
  },
});
