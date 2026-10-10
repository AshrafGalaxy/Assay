import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Typography } from '../Typography';
import { COLORS, FONTS, SHADOWS, SPACING, SIZES } from '../../constants/theme';
import { formatINR } from '../../utils/currency';

interface TransactionSuccessViewProps {
  amount: number;
  merchant: string;
  category: string;
  type: 'debit' | 'credit';
  paymentMethod?: string;
  transactionDate?: string;
  onDone: () => void;
  onAddAnother?: () => void;
}

export const TransactionSuccessView: React.FC<TransactionSuccessViewProps> = ({
  amount,
  merchant,
  category,
  type,
  paymentMethod = 'UPI',
  transactionDate,
  onDone,
  onAddAnother,
}) => {
  // Animation drivers
  const circleScale = useRef(new Animated.Value(0.6)).current;
  const circleOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(16)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  const isIncome = type === 'credit';

  useEffect(() => {
    let isMounted = true;

    // Check accessibility reduced-motion preference
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!isMounted) return;

      if (reduceMotion) {
        // Fallback: Instant transition without spring/bounce
        circleScale.setValue(1);
        circleOpacity.setValue(1);
        checkScale.setValue(1);
        contentOpacity.setValue(1);
        contentTranslateY.setValue(0);
        buttonsOpacity.setValue(1);
      } else {
        // Premium orchestrated entrance
        Animated.parallel([
          // Green circle smooth scale-in & opacity
          Animated.timing(circleOpacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.spring(circleScale, {
            toValue: 1,
            friction: 7,
            tension: 50,
            useNativeDriver: true,
          }),

          // Checkmark pops smoothly inside circle
          Animated.sequence([
            Animated.delay(120),
            Animated.spring(checkScale, {
              toValue: 1,
              friction: 6,
              tension: 65,
              useNativeDriver: true,
            }),
          ]),

          // Card & text slide up with gentle fade
          Animated.sequence([
            Animated.delay(180),
            Animated.parallel([
              Animated.timing(contentOpacity, {
                toValue: 1,
                duration: 280,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(contentTranslateY, {
                toValue: 0,
                duration: 280,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]),
          ]),

          // Buttons fade in
          Animated.sequence([
            Animated.delay(280),
            Animated.timing(buttonsOpacity, {
              toValue: 1,
              duration: 220,
              useNativeDriver: true,
            }),
          ]),
        ]).start();
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.contentWrap}>
        {/* Animated Green Success Circle */}
        <Animated.View
          style={[
            styles.circleOuterRing,
            {
              opacity: circleOpacity,
              transform: [{ scale: circleScale }],
            },
          ]}
          accessibilityRole="image"
          accessibilityLabel="Success checkmark"
        >
          <View style={styles.circleInner}>
            <Animated.View style={{ transform: [{ scale: checkScale }] }}>
              <Check color="#FFFFFF" size={38} strokeWidth={3.2} />
            </Animated.View>
          </View>
        </Animated.View>

        {/* Headings & Confirmation Message */}
        <Animated.View
          style={[
            styles.textBlock,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
          <Typography variant="h1" color={COLORS.primary} style={styles.heading}>
            Transaction Added!
          </Typography>
          <Typography variant="body" color={COLORS.textSecondary} style={styles.subheading}>
            Your financial activity has been recorded.
          </Typography>
        </Animated.View>

        {/* Transaction Summary Card */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
          {/* Amount Header */}
          <View style={styles.cardHeader}>
            <View style={styles.amountWrap}>
              <Typography
                variant="h1"
                color={isIncome ? '#16A34A' : COLORS.primary}
                style={styles.amountText}
              >
                {isIncome ? '+' : '-'}{formatINR(amount)}
              </Typography>
            </View>

            <View
              style={[
                styles.typePill,
                isIncome ? styles.typePillIncome : styles.typePillExpense,
              ]}
            >
              {isIncome ? (
                <ArrowDownLeft size={13} color="#16A34A" strokeWidth={2.5} style={styles.typeIcon} />
              ) : (
                <ArrowUpRight size={13} color="#D97706" strokeWidth={2.5} style={styles.typeIcon} />
              )}
              <Typography
                variant="caption"
                color={isIncome ? '#16A34A' : '#D97706'}
                style={styles.typePillText}
              >
                {isIncome ? 'Income' : 'Expense'}
              </Typography>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Details Table */}
          <View style={styles.detailRow}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.detailLabel}>
              Merchant / Title
            </Typography>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.detailValue}>
              {merchant}
            </Typography>
          </View>

          <View style={styles.detailRow}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.detailLabel}>
              Category
            </Typography>
            <View style={styles.categoryBadge}>
              <Typography variant="bodyMedium" color={COLORS.primary} style={styles.categoryText}>
                {category}
              </Typography>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.detailLabel}>
              Payment Method
            </Typography>
            <Typography variant="bodySemiBold" color={COLORS.primary} style={styles.detailValue}>
              {paymentMethod}
            </Typography>
          </View>

          {transactionDate ? (
            <View style={styles.detailRow}>
              <Typography variant="caption" color={COLORS.textSecondary} style={styles.detailLabel}>
                Date & Time
              </Typography>
              <Typography variant="body" color={COLORS.textSecondary} style={styles.detailValue}>
                {transactionDate}
              </Typography>
            </View>
          ) : null}
        </Animated.View>
      </View>

      {/* Action Buttons */}
      <Animated.View style={[styles.bottomActions, { opacity: buttonsOpacity }]}>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={onDone}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Typography variant="bodyBold" color={COLORS.white} style={styles.doneBtnText}>
            Done
          </Typography>
        </TouchableOpacity>

        {onAddAnother ? (
          <TouchableOpacity
            style={styles.addAnotherButton}
            onPress={onAddAnother}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Add Another Transaction"
          >
            <Typography variant="bodySemiBold" color={COLORS.primary} style={styles.addAnotherText}>
              Add Another Transaction
            </Typography>
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 24 : 32,
    paddingBottom: SPACING.lg,
  },
  contentWrap: {
    alignItems: 'center',
    paddingTop: 16,
  },
  circleOuterRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  circleInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heading: {
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  subheading: {
    marginTop: 6,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  amountWrap: {
    flex: 1,
  },
  amountText: {
    fontSize: 30,
    fontFamily: FONTS.bodyBold,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  typePillExpense: {
    backgroundColor: '#FEF3C7',
  },
  typePillIncome: {
    backgroundColor: '#DCFCE7',
  },
  typeIcon: {
    marginRight: 4,
  },
  typePillText: {
    fontSize: 12,
    fontFamily: FONTS.bodySemiBold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 14,
    textAlign: 'right',
  },
  categoryBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 13,
  },
  bottomActions: {
    width: '100%',
    gap: 10,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
  },
  doneButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  doneBtnText: {
    fontSize: 16,
  },
  addAnotherButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAnotherText: {
    fontSize: 15,
  },
});
