import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Typography } from '../Typography';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import { BarChart3 } from 'lucide-react-native';

export interface ForecastSummaryCardProps {
  message?: string;
  style?: ViewStyle;
}

export function ForecastSummaryCard({
  message = 'Your projected balance stays above your minimum reserve.',
  style,
}: ForecastSummaryCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.iconBox}>
        <BarChart3 size={20} color={COLORS.gold} />
      </View>
      <View style={styles.textBox}>
        <Typography variant="bodyMedium" color={COLORS.primary} style={styles.message}>
          {message}
        </Typography>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF7EE',
    borderRadius: SIZES.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3E8C4',
    marginBottom: 16,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textBox: {
    flex: 1,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 18,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.primary,
  },
});
