import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, Platform } from 'react-native';
import { Typography } from '../Typography';
import { COLORS, FONTS } from '../../constants/theme';
import { ChevronRight } from 'lucide-react-native';

export interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onPress: () => void;
  highlighted?: boolean;
  style?: ViewStyle;
}

export function FeatureCard({
  title,
  description,
  icon,
  onPress,
  highlighted = false,
  style,
}: FeatureCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.card,
        highlighted && styles.cardHighlighted,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Deep Navy Rounded Squircle Icon Container */}
      <View style={styles.iconContainer}>
        {icon}
      </View>

      {/* Title & Description */}
      <View style={styles.contentContainer}>
        <Typography variant="bodyBold" color={COLORS.primary} style={styles.title}>
          {title}
        </Typography>
        <Typography variant="body" color={COLORS.textSecondary} style={styles.description}>
          {description}
        </Typography>
      </View>

      {/* Right Chevron */}
      <View style={styles.arrowContainer}>
        <ChevronRight
          size={18}
          color={highlighted ? '#D6A928' : '#64748B'}
          strokeWidth={2}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.2,
    borderColor: '#F0EFEA',
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
      },
    }),
  },
  cardHighlighted: {
    borderColor: '#D6A928', // Thin gold border highlight matching reference
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#D6A928',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 10px rgba(214, 169, 40, 0.12)',
      },
    }),
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0F172A', // Deep Navy squircle container
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: FONTS.bodyBold,
    color: '#0F172A',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    fontFamily: FONTS.body,
  },
  arrowContainer: {
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
