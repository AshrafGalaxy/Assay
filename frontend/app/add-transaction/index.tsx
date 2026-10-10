import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { TransactionSuccessView } from '../../components/ui/TransactionSuccessView';
import { triggerTransactionSuccessFeedback } from '../../utils/feedback';
import { COLORS, SIZES, SPACING, FONTS } from '../../constants/theme';
import { useTransactions } from '../../services/transactions';
import {
  X,
  ArrowUp,
  Check,
  Calendar,
  CreditCard,
  ChevronDown,
  UtensilsCrossed,
  ShoppingBag,
  Car,
  Tv,
  Zap,
  ShoppingCart,
  Film,
  HeartPulse,
  House,
  Package,
  Banknote,
  Briefcase,
  TrendingUp,
  Building2,
  Coins,
} from 'lucide-react-native';

const EXPENSE_CATEGORIES = [
  { name: 'Food & Dining', Icon: UtensilsCrossed },
  { name: 'Shopping', Icon: ShoppingBag },
  { name: 'Transport', Icon: Car },
  { name: 'Subscriptions', Icon: Tv },
  { name: 'Bills & Utilities', Icon: Zap },
  { name: 'Groceries', Icon: ShoppingCart },
  { name: 'Entertainment', Icon: Film },
  { name: 'Healthcare', Icon: HeartPulse },
  { name: 'Housing & Rent', Icon: House },
  { name: 'Other', Icon: Package },
];

const INCOME_CATEGORIES = [
  { name: 'Salary', Icon: Banknote },
  { name: 'Freelance', Icon: Briefcase },
  { name: 'Investment', Icon: TrendingUp },
  { name: 'Business', Icon: Building2 },
  { name: 'Rental', Icon: House },
  { name: 'Other Income', Icon: Coins },
];

const PAYMENT_METHODS = ['UPI', 'Card', 'Cash', 'Bank', 'Wallet'];

export default function AddTransactionScreen() {
  const router = useRouter();
  const { createTransaction } = useTransactions();

  // Form State
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].name);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [note, setNote] = useState('');
  const [dateDisplay, setDateDisplay] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; merchant?: string; category?: string }>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedData, setSavedData] = useState<{
    id: string;
    amount: number;
    merchant: string;
    category: string;
    type: 'debit' | 'credit';
    paymentMethod: string;
    transactionDate?: string;
  } | null>(null);

  // Guards against duplicate feedback and manages auto-dismiss timer
  const lastSavedTxIdRef = useRef<string | null>(null);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set default current local time
  useEffect(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setDateDisplay(`Today, ${timeStr}`);
  }, []);

  // Cleanup auto-dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
      }
    };
  }, []);

  // Sync category default when toggling between expense and income
  const handleTypeChange = (type: 'expense' | 'income') => {
    setTransactionType(type);
    setFieldErrors((prev) => ({ ...prev, category: undefined }));
    if (type === 'income') {
      setCategory(INCOME_CATEGORIES[0].name);
    } else {
      setCategory(EXPENSE_CATEGORIES[0].name);
    }
  };

  const validateForm = (): boolean => {
    const errors: { amount?: string; merchant?: string; category?: string } = {};
    const parsedAmount = parseFloat(amount.replace(/,/g, '').trim());

    if (!amount.trim()) {
      errors.amount = 'Please enter an amount.';
    } else if (isNaN(parsedAmount) || parsedAmount <= 0) {
      errors.amount = 'Amount must be greater than ₹0.';
    } else if (parsedAmount > 100000000) {
      errors.amount = 'Amount exceeds maximum allowed limit.';
    }

    if (!merchant.trim()) {
      errors.merchant = 'Merchant or transaction title is required.';
    }

    if (!category.trim()) {
      errors.category = 'Please select a category.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleDone = () => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    router.back();
  };

  const handleAddAnother = () => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setShowSuccess(false);
    setSavedData(null);
    setAmount('');
    setMerchant('');
    setNote('');
    setFieldErrors({});
    setErrorMessage(null);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setDateDisplay(`Today, ${timeStr}`);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);

    if (!validateForm()) {
      return;
    }

    const parsedAmount = parseFloat(amount.replace(/,/g, '').trim());
    setIsSubmitting(true);

    try {
      const savedTx = await createTransaction({
        amount: parsedAmount,
        merchant_name: merchant.trim(),
        category,
        type: transactionType,
        payment_method: paymentMethod,
        transaction_date: dateDisplay,
        description: note.trim() || undefined,
      });

      // Trigger pleasant sound & haptic feedback strictly once per successfully saved transaction
      if (lastSavedTxIdRef.current !== savedTx.id) {
        lastSavedTxIdRef.current = savedTx.id;
        triggerTransactionSuccessFeedback();
      }

      setSavedData({
        id: savedTx.id,
        amount: savedTx.amount,
        merchant: savedTx.merchant_name,
        category: savedTx.category,
        type: savedTx.type,
        paymentMethod: savedTx.payment_method || paymentMethod,
        transactionDate: savedTx.transaction_date,
      });
      setShowSuccess(true);

      // Automatically transition back after viewing window, unless dismissed manually
      autoDismissTimerRef.current = setTimeout(() => {
        router.back();
      }, 2800);
    } catch (err: any) {
      // Backend error: form data is preserved, no feedback is triggered
      setErrorMessage(err.message || 'Failed to save transaction. Please check connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isIncome = transactionType === 'income';
  const activeCategories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // ── Success State Screen ──
  if (showSuccess && savedData) {
    return (
      <TransactionSuccessView
        amount={savedData.amount}
        merchant={savedData.merchant}
        category={savedData.category}
        type={savedData.type}
        paymentMethod={savedData.paymentMethod}
        transactionDate={savedData.transactionDate}
        onDone={handleDone}
        onAddAnother={handleAddAnother}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Drag handle / top arrow */}
        <View style={styles.handleContainer}>
          <View style={styles.handleIndicator} />
          <ArrowUp color={COLORS.textSecondary} size={18} strokeWidth={2} style={styles.arrowIcon} />
        </View>

        {/* Screen Header */}
        <View style={styles.header}>
          <View style={styles.headerTitles}>
            <Typography variant="h2" color={COLORS.text} style={styles.title}>
              Add Transaction
            </Typography>
            <Typography variant="secondary" color={COLORS.textSecondary} style={styles.subtitle}>
              Enter the details manually
            </Typography>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityLabel="Close"
            disabled={isSubmitting}
          >
            <X color={COLORS.text} size={20} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Typography variant="caption" color="#DC2626" style={styles.errorBannerText}>
                {errorMessage}
              </Typography>
            </View>
          ) : null}

          {/* Expense / Income Pill Toggle */}
          <View style={styles.typeToggleRow}>
            <TouchableOpacity
              style={[
                styles.typeToggleBtn,
                !isIncome && styles.typeToggleBtnActiveExpense,
              ]}
              onPress={() => handleTypeChange('expense')}
              activeOpacity={0.8}
            >
              <Typography
                variant="bodyBold"
                color={!isIncome ? COLORS.white : COLORS.textSecondary}
                style={styles.typeToggleText}
              >
                Expense
              </Typography>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeToggleBtn,
                isIncome && styles.typeToggleBtnActiveIncome,
              ]}
              onPress={() => handleTypeChange('income')}
              activeOpacity={0.8}
            >
              <Typography
                variant="bodyBold"
                color={isIncome ? COLORS.white : COLORS.textSecondary}
                style={styles.typeToggleText}
              >
                Income
              </Typography>
            </TouchableOpacity>
          </View>

          {/* Amount Input Section */}
          <View style={styles.amountCard}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.fieldLabel}>
              Amount
            </Typography>
            <View style={styles.amountRow}>
              <Typography
                variant="h1"
                color={isIncome ? '#16A34A' : COLORS.text}
                style={styles.rupeeSymbol}
              >
                ₹
              </Typography>
              <TextInput
                style={[
                  styles.amountInput,
                  { color: isIncome ? '#16A34A' : COLORS.text },
                ]}
                placeholder="0"
                placeholderTextColor={COLORS.border}
                value={amount}
                onChangeText={(val) => {
                  setAmount(val);
                  if (fieldErrors.amount) {
                    setFieldErrors((prev) => ({ ...prev, amount: undefined }));
                  }
                }}
                keyboardType="decimal-pad"
                autoFocus={false}
                maxLength={10}
              />
              {amount ? (
                <TouchableOpacity
                  onPress={() => setAmount('')}
                  style={styles.clearAmountBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X color={COLORS.textSecondary} size={16} strokeWidth={2} />
                </TouchableOpacity>
              ) : null}
            </View>
            {fieldErrors.amount ? (
              <Typography variant="caption" color="#DC2626" style={styles.inlineFieldError}>
                {fieldErrors.amount}
              </Typography>
            ) : null}
          </View>

          {/* Merchant / Title */}
          <View style={styles.fieldWrapper}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.fieldLabel}>
              Merchant / Title *
            </Typography>
            <TextInput
              style={[styles.inputBox, fieldErrors.merchant ? styles.inputBoxError : null]}
              placeholder={isIncome ? 'e.g. TechCorp, Freelance Client' : 'e.g. Starbucks, Zomato, Rent'}
              placeholderTextColor="#9CA3AF"
              value={merchant}
              onChangeText={(val) => {
                setMerchant(val);
                if (fieldErrors.merchant) {
                  setFieldErrors((prev) => ({ ...prev, merchant: undefined }));
                }
              }}
              autoCapitalize="words"
            />
            {fieldErrors.merchant ? (
              <Typography variant="caption" color="#DC2626" style={styles.inlineFieldError}>
                {fieldErrors.merchant}
              </Typography>
            ) : null}
          </View>

          {/* Category Selector */}
          <View style={styles.fieldWrapper}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.fieldLabel}>
              Category *
            </Typography>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryPillsScroll}
            >
              {activeCategories.map((cat) => {
                const isSelected = category === cat.name;
                const CategoryIcon = cat.Icon;
                const iconColor = isSelected ? COLORS.white : COLORS.text;
                return (
                  <TouchableOpacity
                    key={cat.name}
                    style={[
                      styles.categoryChip,
                      isSelected && styles.categoryChipSelected,
                    ]}
                    onPress={() => setCategory(cat.name)}
                    activeOpacity={0.75}
                  >
                    <CategoryIcon
                      size={15}
                      color={iconColor}
                      strokeWidth={2}
                    />
                    <Typography
                      variant="caption"
                      color={isSelected ? COLORS.white : COLORS.text}
                      style={[
                        styles.catLabel,
                        isSelected && { fontFamily: FONTS.bodyBold },
                      ]}
                    >
                      {cat.name}
                    </Typography>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {fieldErrors.category ? (
              <Typography variant="caption" color="#DC2626" style={styles.inlineFieldError}>
                {fieldErrors.category}
              </Typography>
            ) : null}
          </View>

          {/* Payment Method */}
          <View style={styles.fieldWrapper}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.fieldLabel}>
              Payment Method
            </Typography>
            <View style={styles.methodRow}>
              {PAYMENT_METHODS.map((method) => {
                const isSelected = paymentMethod === method;
                return (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.methodPill,
                      isSelected && styles.methodPillSelected,
                    ]}
                    onPress={() => setPaymentMethod(method)}
                    activeOpacity={0.75}
                  >
                    <Typography
                      variant="caption"
                      color={isSelected ? COLORS.white : COLORS.text}
                      style={[
                        styles.methodText,
                        isSelected && { fontFamily: FONTS.bodyBold },
                      ]}
                    >
                      {method}
                    </Typography>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Date & Time */}
          <View style={styles.fieldWrapper}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.fieldLabel}>
              Date & Time
            </Typography>
            <View style={styles.dateSelectorRow}>
              <Typography variant="body" color={COLORS.text} style={styles.dateText}>
                {dateDisplay}
              </Typography>
              <Calendar color={COLORS.textSecondary} size={18} strokeWidth={1.8} />
            </View>
          </View>

          {/* Notes (Optional) */}
          <View style={styles.fieldWrapper}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.fieldLabel}>
              Notes (Optional)
            </Typography>
            <TextInput
              style={[styles.inputBox, styles.notesInput]}
              placeholder="Add a note or reference..."
              placeholderTextColor="#9CA3AF"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              isIncome && styles.submitBtnIncome,
              isSubmitting && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Typography variant="bodyBold" color={COLORS.white} style={styles.submitBtnText}>
                Add Transaction
              </Typography>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  handleIndicator: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 6,
  },
  arrowIcon: {
    marginBottom: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitles: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: FONTS.heading,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 14,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorBannerText: {
    fontWeight: '600',
  },
  typeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 14,
    padding: 3,
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeToggleBtnActiveExpense: {
    backgroundColor: '#111827',
  },
  typeToggleBtnActiveIncome: {
    backgroundColor: '#16A34A',
  },
  typeToggleText: {
    fontSize: 14,
  },
  amountCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    letterSpacing: 0.2,
    fontFamily: FONTS.bodySemiBold,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rupeeSymbol: {
    fontSize: 32,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontFamily: FONTS.bodyBold,
    paddingVertical: 0,
  },
  clearAmountBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineFieldError: {
    marginTop: 2,
    fontSize: 12,
  },
  fieldWrapper: {
    gap: 8,
  },
  inputBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FONTS.body,
    color: COLORS.text,
  },
  inputBoxError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  notesInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  categoryPillsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  categoryChipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  catLabel: {
    fontSize: 13,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodPill: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodPillSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  methodText: {
    fontSize: 13,
  },
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateText: {
    fontSize: 15,
  },
  submitBtn: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnIncome: {
    backgroundColor: '#16A34A',
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    fontSize: 16,
  },
});
