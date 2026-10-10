import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { Typography } from '../Typography';
import { COLORS, FONTS } from '../../constants/theme';
import { formatINR } from '../../services/finance';

interface GlassSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (val: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  disabled?: boolean;
  minLabel?: string;
  maxLabel?: string;
}

export const GlassSlider: React.FC<GlassSliderProps> = ({
  value,
  min,
  max,
  step = 1000,
  onValueChange,
  onDragStart,
  onDragEnd,
  disabled = false,
  minLabel,
  maxLabel,
}) => {
  return (
    <View style={styles.container}>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onValueChange}
        onSlidingStart={onDragStart}
        onSlidingComplete={onDragEnd}
        minimumTrackTintColor="#D6A928"
        maximumTrackTintColor="#E2E8F0"
        thumbTintColor={Platform.OS === 'ios' ? undefined : '#D6A928'}
        disabled={disabled}
      />

      <View style={styles.labelsRow}>
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.scaleText}>
          {minLabel ?? formatINR(min)}
        </Typography>
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.scaleText}>
          {maxLabel ?? formatINR(max)}
        </Typography>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 2,
  },
  slider: {
    width: '100%',
    height: 40,
    ...Platform.select({
      web: {
        accentColor: '#D6A928',
      },
      default: {},
    }),
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: -2,
  },
  scaleText: {
    fontSize: 11,
    fontFamily: FONTS.bodyMedium,
    color: '#8A92A6',
  },
});
