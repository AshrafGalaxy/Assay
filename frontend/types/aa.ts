/**
 * Sandbox bank catalogue entry used by the bank-picker / onboarding UI.
 *
 * This describes an institution the user *can* link. It deliberately carries no
 * balance or sync state: those values only exist on the backend (`GET /accounts`)
 * and are represented by `LinkedAccount`.
 */
export interface SandboxAccount {
  id: string;
  bankName: string;
  bankKey: string;
  accountType: string;
  accountNumber: string;
  maskedNumber: string;
  currency: string;
  fipId: string;
  institutionType: 'Bank' | 'NBFC' | 'Mutual Fund';
  selectedDefault: boolean;
}

export type LinkedAccountStatus = 'connected' | 'syncing' | 'disconnected' | 'error';

/**
 * A bank account as returned by the backend (`GET /accounts`, `POST /accounts/link`).
 * `balance` is only ever populated from backend data.
 */
export interface LinkedAccount extends SandboxAccount {
  balance: number;
  formattedBalance: string;
  status: LinkedAccountStatus;
  lastSynced: string | null;
}

export const SANDBOX_ACCOUNTS: SandboxAccount[] = [
  {
    id: 'acc-hdfc-4821',
    bankName: 'HDFC Bank',
    bankKey: 'hdfc',
    accountType: 'Savings Account',
    accountNumber: '4821',
    maskedNumber: 'Savings •••• 4821',
    currency: 'INR',
    fipId: 'FIP-HDFC-001',
    institutionType: 'Bank',
    selectedDefault: true,
  },
  {
    id: 'acc-icici-7712',
    bankName: 'ICICI Bank',
    bankKey: 'icici',
    accountType: 'Savings Account',
    accountNumber: '7712',
    maskedNumber: 'Savings •••• 7712',
    currency: 'INR',
    fipId: 'FIP-ICICI-002',
    institutionType: 'Bank',
    selectedDefault: false,
  },
  {
    id: 'acc-axis-3044',
    bankName: 'Axis Bank',
    bankKey: 'axis',
    accountType: 'Current Account',
    accountNumber: '3044',
    maskedNumber: 'Current •••• 3044',
    currency: 'INR',
    fipId: 'FIP-AXIS-003',
    institutionType: 'Bank',
    selectedDefault: false,
  },
  {
    id: 'acc-sbi-9812',
    bankName: 'State Bank of India',
    bankKey: 'sbi',
    accountType: 'Savings Account',
    accountNumber: '9812',
    maskedNumber: 'Savings •••• 9812',
    currency: 'INR',
    fipId: 'FIP-SBI-004',
    institutionType: 'Bank',
    selectedDefault: false,
  },
  {
    id: 'acc-kotak-5521',
    bankName: 'Kotak Mahindra Bank',
    bankKey: 'kotak',
    accountType: 'Savings Account',
    accountNumber: '5521',
    maskedNumber: 'ActiveMoney •••• 5521',
    currency: 'INR',
    fipId: 'FIP-KOTAK-005',
    institutionType: 'Bank',
    selectedDefault: false,
  },
  {
    id: 'acc-pnb-1290',
    bankName: 'Punjab National Bank',
    bankKey: 'pnb',
    accountType: 'Savings Account',
    accountNumber: '1290',
    maskedNumber: 'Savings •••• 1290',
    currency: 'INR',
    fipId: 'FIP-PNB-006',
    institutionType: 'Bank',
    selectedDefault: false,
  },
  {
    id: 'acc-indusind-6310',
    bankName: 'IndusInd Bank',
    bankKey: 'indusind',
    accountType: 'Savings Account',
    accountNumber: '6310',
    maskedNumber: 'Savings •••• 6310',
    currency: 'INR',
    fipId: 'FIP-INDUSIND-007',
    institutionType: 'Bank',
    selectedDefault: false,
  },
  {
    id: 'acc-zerodha-8819',
    bankName: 'Zerodha Broking',
    bankKey: 'zerodha',
    accountType: 'Demat & Trading',
    accountNumber: '8819',
    maskedNumber: 'Kite •••• 8819',
    currency: 'INR',
    fipId: 'FIP-ZERODHA-007',
    institutionType: 'Mutual Fund',
    selectedDefault: false,
  },
  {
    id: 'acc-groww-3312',
    bankName: 'Groww Invest Tech',
    bankKey: 'groww',
    accountType: 'Mutual Funds Portfolio',
    accountNumber: '3312',
    maskedNumber: 'Folio •••• 3312',
    currency: 'INR',
    fipId: 'FIP-GROWW-008',
    institutionType: 'Mutual Fund',
    selectedDefault: false,
  },
];
