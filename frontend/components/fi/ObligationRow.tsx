import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Typography } from '../Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { Home, Car, CreditCard, Shield, Landmark, Calendar } from 'lucide-react-native';

export interface ObligationItem {
  id: string;
  name: string;
  dueDate: string;
  amount: number;
  type?: 'rent' | 'emi' | 'credit_card' | 'insurance' | 'subscription' | 'other';
  recurrence?: string;
  account?: string;
}

export interface ObligationRowProps {
  item: ObligationItem;
  onPress?: () => void;
}

export function ObligationRow({ item, onPress }: ObligationRowProps) {
  const getIcon = () => {
    switch (item.type) {
      case 'rent':
        return <Home size={18} color={COLORS.primary} />;
      case 'emi':
        return <Car size={18} color={COLORS.primary} />;
      case 'credit_card':
        return <CreditCard size={18} color={COLORS.primary} />;
      case 'insurance':
        return <Shield size={18} color={COLORS.primary} />;
      default:
        return <Calendar size={18} color={COLORS.primary} />;
    }
  };

  const formatAmount = (val: number) => {
    return `-₹${Math.abs(val).toLocaleString('en-IN')}`;
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        {getIcon()}
      </View>

      <View style={styles.contentWrap}>
        <Typography variant="bodyBold" color={COLORS.primary} style={styles.title} numberOfLines={1}>
          {item.name}
        </Typography>
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.subtitle} numberOfLines={1}>
          {item.dueDate}{item.recurrence ? ` • ${item.recurrence}` : ''}
        </Typography>
      </View>

      <View style={styles.amountWrap}>
        <Typography variant="bodyBold" color={COLORS.primary} style={styles.amount}>
          {formatAmount(item.amount)}
        </Typography>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0EE',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F5F5F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  contentWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14.5,
    fontFamily: FONTS.bodyBold,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  amountWrap: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    color: COLORS.primary,
  },
});
