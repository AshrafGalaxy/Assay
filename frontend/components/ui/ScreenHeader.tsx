import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Typography } from '../Typography';
import { COLORS, SIZES } from '../../constants/theme';
import { Bell } from 'lucide-react-native';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  greeting?: string;
  userName?: string;
  showNotification?: boolean;
  hasUnreadNotification?: boolean;
  onNotificationPress?: () => void;
  rightAction?: React.ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  greeting,
  userName,
  showNotification = true,
  hasUnreadNotification = true,
  onNotificationPress,
  rightAction,
}: ScreenHeaderProps) {
  const router = useRouter();
  const isGreeting = Boolean(greeting && userName);

  const handleNotification = () => {
    if (onNotificationPress) {
      onNotificationPress();
    } else {
      router.push('/settings/notifications');
    }
  };

  return (
    <View style={styles.header}>
      <View style={styles.textContainer}>
        {isGreeting ? (
          <>
            <Typography variant="secondary" color={COLORS.textSecondary}>
              {greeting}
            </Typography>
            <Typography variant="h2" color={COLORS.text} style={styles.userName}>
              {userName}
            </Typography>
          </>
        ) : (
          <>
            <Typography
              variant="pageTitle"
              color={COLORS.text}
              style={styles.title}
              numberOfLines={2}
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="secondary"
                color={COLORS.textSecondary}
                style={styles.subtitle}
                numberOfLines={2}
              >
                {subtitle}
              </Typography>
            )}
          </>
        )}
      </View>

      {(rightAction || showNotification) && (
        <View style={styles.actionsContainer}>
          {rightAction}
          {!rightAction && showNotification && (
            <TouchableOpacity
              style={styles.notificationBtn}
              onPress={handleNotification}
              activeOpacity={0.7}
            >
              <Bell color={COLORS.text} size={18} strokeWidth={1.8} />
              {hasUnreadNotification && <View style={styles.notificationBadgeDot} />}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export const AppHeader = ScreenHeader;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SIZES.padding,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  textContainer: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: 4,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    flexShrink: 1,
  },
  userName: {
    marginTop: 2,
  },
  subtitle: {
    marginTop: 2,
    paddingRight: 8,
    lineHeight: 20,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 10,
    marginLeft: 12,
    marginTop: 4,
  },
  notificationBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadgeDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EA580C',
  },
});
