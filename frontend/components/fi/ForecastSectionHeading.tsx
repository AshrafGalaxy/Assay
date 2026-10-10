import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Typography } from '../Typography';
import { COLORS, FONTS } from '../../constants/theme';

export interface ForecastSectionHeadingProps {
  title: string;
  subtitle?: string;
  actionText?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function ForecastSectionHeading({
  title,
  subtitle,
  actionText,
  onAction,
  style,
}: ForecastSectionHeadingProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleCol}>
        <Typography variant="cardHeading" color={COLORS.primary} style={styles.title}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.subtitle}>
            {subtitle}
          </Typography>
        ) : null}
      </View>
      {actionText && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Typography variant="caption" color={COLORS.gold} style={styles.action}>
            {actionText}
          </Typography>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    marginTop: 18,
  },
  titleCol: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  action: {
    fontSize: 12,
    fontFamily: FONTS.bodyMedium,
  },
});
