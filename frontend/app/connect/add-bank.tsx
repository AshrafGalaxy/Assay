import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Text,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Search,
  ChevronRight,
  ShieldCheck,
  Building2,
  Check,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Plus,
} from 'lucide-react-native';
import { Typography } from '../../components/Typography';
import { Button } from '../../components/Button';
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { COLORS, SIZES, SPACING, FONTS } from '../../constants/theme';
import { SANDBOX_ACCOUNTS, SandboxAccount, LinkedAccount } from '../../types/aa';
import { AAService, useAAState } from '../../services/aaState';

type Step = 'select_bank' | 'consent' | 'bank_login' | 'success';

/** Bank picker entry: institution identity only. Balances come from the backend after linking. */
interface BankOption {
  bankKey: string;
  bankName: string;
  defaultType: string;
  defaultMasked: string;
}

const POPULAR_BANK_KEYS = ['hdfc', 'icici', 'sbi', 'axis', 'kotak', 'indusind'];

const POPULAR_BANKS: BankOption[] = POPULAR_BANK_KEYS.map((key) => {
  const catalogue = SANDBOX_ACCOUNTS.find((a) => a.bankKey === key);
  return {
    bankKey: key,
    bankName: catalogue?.bankName ?? key.toUpperCase(),
    defaultType: catalogue?.accountType ?? 'Savings Account',
    defaultMasked: catalogue?.maskedNumber ?? '',
  };
});

export default function AddBankAccountScreen() {
  const router = useRouter();
  const aaState = useAAState();

  const [currentStep, setCurrentStep] = useState<Step>('select_bank');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBank, setSelectedBank] = useState<BankOption>(POPULAR_BANKS[1]); // Default to ICICI
  const [customerId, setCustomerId] = useState('ashish_icici_99');
  const [password, setPassword] = useState('••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<SandboxAccount | null>(null);

  // Filter banks
  const filteredBanks = POPULAR_BANKS.filter((b) =>
    b.bankName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectBank = (bank: BankOption) => {
    setSelectedBank(bank);
    setCustomerId(`usr_${bank.bankKey}_77`);
    setCurrentStep('consent');
  };

  const handleAuthorizeLogin = async () => {
    setIsLinking(true);
    try {
      // Find matching sandbox account or build account record
      const match = SANDBOX_ACCOUNTS.find((a) => a.bankKey === selectedBank.bankKey);
      const newAcc: SandboxAccount = match || {
        id: `acc-${selectedBank.bankKey}-${Date.now().toString().slice(-4)}`,
        bankName: selectedBank.bankName,
        bankKey: selectedBank.bankKey,
        accountType: selectedBank.defaultType,
        accountNumber: selectedBank.defaultMasked.replace(/[^0-9]/g, '') || '0000',
        maskedNumber: selectedBank.defaultMasked,
        currency: 'INR',
        fipId: `FIP-${selectedBank.bankKey.toUpperCase()}-001`,
        institutionType: 'Bank',
        selectedDefault: false,
      };

      // The backend imports the account's transactions and returns its real balance.
      const linked = await AAService.addAccount(newAcc);
      setConnectedAccount(linked);
      setCurrentStep('success');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* Top Navigation */}
      <View style={styles.topNav}>
        <TouchableOpacity
          onPress={() => {
            if (currentStep === 'success') {
              router.replace('/settings/connected-accounts');
            } else if (currentStep === 'bank_login') {
              setCurrentStep('consent');
            } else if (currentStep === 'consent') {
              setCurrentStep('select_bank');
            } else {
              router.back();
            }
          }}
          style={styles.backButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={COLORS.primary} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          STEP 1: SELECT BANK PROVIDER (Screen 2)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {currentStep === 'select_bank' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerSection}>
            <Typography variant="pageTitle" style={styles.pageTitle}>
              Add Bank Account
            </Typography>
            <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
              Select your bank to securely link using Account Aggregator (RBI regulated).
            </Typography>
          </View>

          {/* Search Box */}
          <View style={styles.searchBar}>
            <Search size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search bank..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Popular Banks List */}
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.sectionHeading}>
            POPULAR BANKS
          </Typography>

          <View style={styles.bankListCard}>
            {filteredBanks.map((bank, index) => {
              const isAlreadyConnected = aaState.connected_accounts.some(
                (a) => a.bankKey === bank.bankKey && a.status !== 'disconnected'
              );

              return (
                <React.Fragment key={bank.bankKey}>
                  <TouchableOpacity
                    style={styles.bankItemRow}
                    activeOpacity={0.7}
                    onPress={() => handleSelectBank(bank)}
                  >
                    <MerchantLogo name={bank.bankKey} size={36} />
                    <View style={styles.bankTextWrap}>
                      <Typography variant="bodyMedium" color={COLORS.primary} style={styles.bankNameText}>
                        {bank.bankName}
                      </Typography>
                      {isAlreadyConnected && (
                        <Typography variant="caption" color={COLORS.success} style={{ fontSize: 11 }}>
                          Connected
                        </Typography>
                      )}
                    </View>
                    <ChevronRight size={18} color="#9CA3AF" />
                  </TouchableOpacity>

                  {index < filteredBanks.length - 1 && <View style={styles.bankDivider} />}
                </React.Fragment>
              );
            })}
          </View>

          {/* Security Guarantee Box */}
          <View style={styles.trustCard}>
            <View style={styles.trustIconWrap}>
              <ShieldCheck size={26} color={COLORS.gold} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Typography variant="bodyBold" color={COLORS.primary} style={{ fontSize: 14 }}>
                Your data is secure
              </Typography>
              <Typography variant="caption" color={COLORS.textSecondary} style={{ lineHeight: 18 }}>
                We use RBI regulated Account Aggregator to connect your bank securely.
              </Typography>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          STEP 2: CONSENT & AUTHORIZATION (Screen 3)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {currentStep === 'consent' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.consentContainer}>
            <View style={styles.heroIconCircle}>
              <Building2 size={34} color={COLORS.primary} strokeWidth={1.7} />
            </View>

            <Typography variant="h2" color={COLORS.primary} align="center" style={{ marginBottom: 6 }}>
              Account Aggregator
            </Typography>
            <Typography variant="secondary" color={COLORS.textSecondary} align="center" style={{ marginBottom: 28, lineHeight: 22, maxWidth: 320 }}>
              You will be redirected to your bank to provide consent for data access.
            </Typography>

            {/* Checklist */}
            <View style={styles.checklistCard}>
              <View style={styles.checkItem}>
                <View style={styles.checkDot}>
                  <Check size={14} color={COLORS.gold} strokeWidth={3} />
                </View>
                <Typography variant="bodyMedium" color={COLORS.primary} style={styles.checkItemText}>
                  Read your account statements
                </Typography>
              </View>

              <View style={styles.checkItem}>
                <View style={styles.checkDot}>
                  <Check size={14} color={COLORS.gold} strokeWidth={3} />
                </View>
                <Typography variant="bodyMedium" color={COLORS.primary} style={styles.checkItemText}>
                  Fetch transactions securely
                </Typography>
              </View>

              <View style={styles.checkItem}>
                <View style={styles.checkDot}>
                  <Check size={14} color={COLORS.gold} strokeWidth={3} />
                </View>
                <Typography variant="bodyMedium" color={COLORS.primary} style={styles.checkItemText}>
                  Only with your permission
                </Typography>
              </View>

              <View style={styles.checkItem}>
                <View style={styles.checkDot}>
                  <Check size={14} color={COLORS.gold} strokeWidth={3} />
                </View>
                <Typography variant="bodyMedium" color={COLORS.primary} style={styles.checkItemText}>
                  You can revoke anytime
                </Typography>
              </View>
            </View>

            <Button
              title="Continue to Bank"
              variant="primary"
              size="lg"
              onPress={() => setCurrentStep('bank_login')}
              style={{ width: '100%', marginTop: 24, marginBottom: 18 }}
            />

            <View style={styles.footerNoteRow}>
              <Lock size={14} color={COLORS.textSecondary} />
              <Typography variant="caption" color={COLORS.textSecondary}>
                Powered by RBI regulated Account Aggregator (AA)
              </Typography>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          STEP 3: BANK LOGIN & CONSENT (Screen 4)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {currentStep === 'bank_login' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loginContainer}>
            {/* Bank Header */}
            <View style={styles.bankHeaderRow}>
              <MerchantLogo name={selectedBank.bankKey} size={48} />
              <Typography variant="h3" color={COLORS.primary} style={{ marginTop: 8 }}>
                {selectedBank.bankName}
              </Typography>
              <Typography variant="secondary" color={COLORS.textSecondary}>
                Login to continue
              </Typography>
            </View>

            {/* Inputs */}
            <View style={styles.loginForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Customer ID / User ID</Text>
                <TextInput
                  style={styles.textInput}
                  value={customerId}
                  onChangeText={setCustomerId}
                  placeholder="Enter your Customer ID"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={[styles.textInput, { flex: 1, borderWidth: 0 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color="#9CA3AF" />
                    ) : (
                      <Eye size={18} color="#9CA3AF" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Button
                title={isLinking ? 'Verifying Credentials...' : 'Login'}
                variant="primary"
                size="lg"
                onPress={handleAuthorizeLogin}
                disabled={isLinking}
                style={{ width: '100%', marginTop: 12 }}
              />

              {/* OR Divider */}
              <View style={styles.orDividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.netbankingBtn}
                activeOpacity={0.7}
                onPress={handleAuthorizeLogin}
                disabled={isLinking}
              >
                <Building2 size={18} color={COLORS.primary} />
                <Text style={styles.netbankingBtnText}>Continue with NetBanking</Text>
              </TouchableOpacity>
            </View>

            {/* Security Notice */}
            <View style={styles.securityBox}>
              <ShieldCheck size={18} color={COLORS.textSecondary} />
              <Typography variant="caption" color={COLORS.textSecondary} style={{ flex: 1, lineHeight: 18 }}>
                This is a secure bank login page. Your credentials are not stored in ASSAY.
              </Typography>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          STEP 4: SUCCESS SCREEN (Screen 5)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {currentStep === 'success' && connectedAccount && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.successContainer}>
            <View style={styles.successIconCircle}>
              <CheckCircle2 size={68} color={COLORS.success} strokeWidth={2.2} />
            </View>

            <Typography variant="h2" color={COLORS.primary} align="center" style={styles.successTitle}>
              Bank Account Connected!
            </Typography>

            <Typography variant="secondary" color={COLORS.textSecondary} align="center" style={styles.successSubtitle}>
              Your account has been successfully linked and will start syncing transactions shortly.
            </Typography>

            {/* Account Card Summary */}
            <View style={styles.summaryCard}>
              <MerchantLogo name={connectedAccount.bankKey} size={42} />
              <View style={styles.summaryDetails}>
                <Typography variant="bodyBold" color={COLORS.primary}>
                  {connectedAccount.bankName}
                </Typography>
                <Typography variant="secondary" color={COLORS.textSecondary}>
                  {connectedAccount.maskedNumber}
                </Typography>
              </View>
            </View>

            <View style={{ width: '100%', gap: 12, marginTop: 32 }}>
              <Button
                title="Done"
                variant="primary"
                size="lg"
                onPress={() => router.replace('/settings/connected-accounts')}
                style={{ width: '100%' }}
              />

              <Button
                title="+ Add Another Account"
                variant="secondary"
                size="md"
                onPress={() => {
                  setCurrentStep('select_bank');
                  setSearchQuery('');
                }}
                style={{ width: '100%' }}
              />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topNav: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 12,
    marginBottom: SPACING.md,
    height: 44,
    justifyContent: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: SIZES.padding,
    paddingBottom: 40,
  },
  headerSection: {
    marginBottom: SPACING.lg,
  },
  pageTitle: {
    fontSize: 32,
    lineHeight: 40,
    color: COLORS.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.cardRadius,
    paddingHorizontal: 14,
    height: 46,
    gap: 10,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 14.5,
    color: COLORS.primary,
  },
  sectionHeading: {
    letterSpacing: 0.8,
    marginBottom: 10,
    fontFamily: FONTS.bodySemiBold,
  },
  bankListCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 4,
    marginBottom: 20,
  },
  bankItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  bankTextWrap: {
    flex: 1,
    gap: 2,
  },
  bankNameText: {
    fontSize: 15,
    fontFamily: FONTS.bodySemiBold,
  },
  bankDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 66,
  },
  trustCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(214, 169, 40, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.22)',
    borderRadius: SIZES.cardRadius,
    padding: 16,
    gap: 14,
  },
  trustIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.2)',
  },
  consentContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  heroIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  checklistCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 16,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(214, 169, 40, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkItemText: {
    fontSize: 14.5,
  },
  footerNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loginContainer: {
    paddingTop: 10,
  },
  bankHeaderRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  loginForm: {
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    color: COLORS.primary,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.smallRadius,
    paddingHorizontal: 14,
    height: 46,
    fontFamily: FONTS.body,
    fontSize: 14.5,
    color: COLORS.primary,
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.smallRadius,
  },
  eyeBtn: {
    paddingHorizontal: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  orText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  netbankingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.smallRadius,
    height: 46,
    backgroundColor: COLORS.surface,
  },
  netbankingBtnText: {
    fontFamily: FONTS.bodySemiBold,
    fontSize: 14,
    color: COLORS.primary,
  },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    paddingHorizontal: 8,
  },
  successContainer: {
    alignItems: 'center',
    paddingTop: 30,
  },
  successIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 26,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14.5,
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: 28,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
    width: '100%',
  },
  summaryDetails: {
    gap: 2,
  },
});
