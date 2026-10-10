import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Typography } from '../Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { BarChart2, TrendingUp, TrendingDown, Minus } from 'lucide-react-native';

export type ScenarioType = 'best' | 'expected' | 'worst';

export interface ScenarioCardProps {
  type: ScenarioType;
  title: string;
  description: string;
  projectedOutcome: string;
  outcomeLabel?: string;
  assumptions?: string;
  isSelected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function ScenarioCard({
  type,
  title,
  description,
  projectedOutcome,
  outcomeLabel = 'Closing balance in 6 months',
  assumptions,
  isSelected = false,
  onPress,
  style,
}: ScenarioCardProps) {
  const getIcon = () => {
    switch (type) {
      case 'best':
        return <TrendingUp size={20} color={COLORS.gold} />;
      case 'worst':
        return <TrendingDown size={20} color={COLORS.gold} />;
      case 'expected':
      default:
        return <BarChart2 size={20} color={COLORS.gold} />;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isSelected && styles.cardSelected,
        style,
      ]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.75}
    >
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          {getIcon()}
        </View>
        <View style={styles.titleWrap}>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.title}>
            {title}
          </Typography>
        </View>
      </View>

      <Typography variant="caption" color={COLORS.textSecondary} style={styles.description}>
        {description}
      </Typography>

      <View style={styles.outcomeBlock}>
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.outcomeLabel}>
          {outcomeLabel}
        </Typography>
        <Typography variant="bodyBold" color={COLORS.primary} style={styles.outcomeValue}>
          {projectedOutcome}
        </Typography>
      </View>

      {assumptions ? (
        <View style={styles.assumptionsBlock}>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.assumptionsText}>
            Key factors: {assumptions}
          </Typography>
        </View>
      ) : null}
    </TouchableOpacity>
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
  cardSelected: {
    borderColor: COLORS.gold,
    borderWidth: 1.5,
    backgroundColor: '#FCFAF4',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: FONTS.bodyBold,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  outcomeBlock: {
    backgroundColor: '#F8F8F6',
    borderRadius: 10,
    padding: 10,
  },
  outcomeLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  outcomeValue: {
    fontSize: 18,
    fontFamily: FONTS.bodyBold,
  },
  assumptionsBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0EE',
  },
  assumptionsText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});
