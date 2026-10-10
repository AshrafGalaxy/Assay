import React from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, ViewStyle } from 'react-native';
import { Typography } from '../Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { AlertCircle, Inbox, Sparkles } from 'lucide-react-native';

export interface StateViewProps {
  type: 'loading' | 'empty' | 'error' | 'preview';
  title?: string;
  message: string;
  actionText?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function StateView({
  type,
  title,
  message,
  actionText,
  onAction,
  style,
}: StateViewProps) {
  if (type === 'loading') {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Typography variant="caption" color={COLORS.textSecondary} style={styles.loadingText}>
          {message || 'Loading forecast model...'}
        </Typography>
      </View>
    );
  }

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <AlertCircle size={28} color={COLORS.error} />;
      case 'preview':
        return <Sparkles size={28} color={COLORS.gold} />;
      case 'empty':
      default:
        return <Inbox size={28} color={COLORS.textSecondary} />;
    }
  };

  return (
    <View style={[styles.container, styles.bordered, style]}>
      <View style={styles.iconBox}>{getIcon()}</View>
      {title ? (
        <Typography variant="bodyBold" color={COLORS.primary} style={styles.title}>
          {title}
        </Typography>
      ) : null}
      <Typography variant="caption" color={COLORS.textSecondary} style={styles.message}>
        {message}
      </Typography>
      {actionText && onAction ? (
        <TouchableOpacity style={styles.actionButton} onPress={onAction} activeOpacity={0.75}>
          <Typography variant="caption" color={COLORS.white} style={styles.actionText}>
            {actionText}
          </Typography>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordered: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 12,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
  },
  iconBox: {
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    marginBottom: 4,
    textAlign: 'center',
  },
  message: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 280,
  },
  actionButton: {
    marginTop: 14,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 12,
    fontFamily: FONTS.bodyMedium,
  },
});
