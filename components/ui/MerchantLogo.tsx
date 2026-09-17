import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Typography } from '../Typography';
import { 
  Coffee, 
  Car, 
  Utensils, 
  Train, 
  Dumbbell, 
  Landmark
} from 'lucide-react-native';

export interface MerchantLogoProps {
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function MerchantLogo({ name, size = 42, style }: MerchantLogoProps) {
  const normalized = (name || '').toLowerCase();

  // ICICI Bank
  if (normalized.includes('icici')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFF5F0', borderColor: '#FDBA74' }, style]}>
        <Typography variant="bodyBold" style={{ color: '#C2410C', fontSize: size * 0.45, fontStyle: 'italic', fontWeight: '900' }}>
          i
        </Typography>
      </View>
    );
  }

  // Axis Bank
  if (normalized.includes('axis')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }, style]}>
        <View style={{ width: 0, height: 0, borderLeftWidth: size * 0.22, borderRightWidth: size * 0.22, borderBottomWidth: size * 0.38, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#9F1239', transform: [{ rotate: '15deg' }] }} />
      </View>
    );
  }

  // HDFC Bank / HDFC Credila
  if (normalized.includes('hdfc')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }, style]}>
        <View style={{ width: size * 0.52, height: size * 0.52, backgroundColor: '#1E3A8A', borderRadius: 4, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: size * 0.24, height: size * 0.24, backgroundColor: '#DC2626', borderRadius: 2 }} />
        </View>
      </View>
    );
  }

  // Starbucks
  if (normalized.includes('starbucks')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#006241' }, style]}>
        <Coffee color="#FFFFFF" size={size * 0.52} strokeWidth={2} />
      </View>
    );
  }

  // Uber
  if (normalized.includes('uber')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#1A6B51' }, style]}>
        <Car color="#FFFFFF" size={size * 0.52} strokeWidth={2} />
      </View>
    );
  }

  // Amazon
  if (normalized.includes('amazon')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#0F172A' }, style]}>
        <Typography variant="bodyBold" style={{ color: '#FF9900', fontSize: size * 0.45, fontWeight: '900' }}>
          a
        </Typography>
      </View>
    );
  }

  // Tea Stall
  if (normalized.includes('tea') || normalized.includes('chai')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }, style]}>
        <Coffee color="#B45309" size={size * 0.52} strokeWidth={2} />
      </View>
    );
  }

  // Swiggy
  if (normalized.includes('swiggy')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#FC8019' }, style]}>
        <Utensils color="#FFFFFF" size={size * 0.52} strokeWidth={2} />
      </View>
    );
  }

  // BookMyShow
  if (normalized.includes('bookmyshow')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#0F172A' }, style]}>
        <Typography variant="caption" style={{ color: '#DC2626', fontWeight: '900', fontSize: size * 0.28 }}>
          my
        </Typography>
      </View>
    );
  }

  // Metro Card
  if (normalized.includes('metro')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#2563EB' }, style]}>
        <Train color="#FFFFFF" size={size * 0.52} strokeWidth={2} />
      </View>
    );
  }

  // Netflix
  if (normalized.includes('netflix')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#000000' }, style]}>
        <Typography variant="bodyBold" style={{ color: '#E50914', fontSize: size * 0.5, fontWeight: '900' }}>
          N
        </Typography>
      </View>
    );
  }

  // Cult / Gym
  if (normalized.includes('cult') || normalized.includes('gym')) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }, style]}>
        <Dumbbell color="#FF3278" size={size * 0.5} strokeWidth={2} />
      </View>
    );
  }

  // Fallback / default
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }, style]}>
      <Landmark color="#4B5563" size={size * 0.5} strokeWidth={1.8} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
