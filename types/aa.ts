export interface SandboxAccount {
  id: string;
  bankName: string;
  bankKey: string;
  accountType: string;
  accountNumber: string;
  maskedNumber: string;
  balance: number;
  formattedBalance: string;
  currency: string;
  fipId: string;
  institutionType: 'Bank' | 'NBFC' | 'Mutual Fund';
  selectedDefault: boolean;
}

export const SANDBOX_ACCOUNTS: SandboxAccount[] = [
  {
    id: 'acc-hdfc-4821',
    bankName: 'HDFC Bank',
    bankKey: 'hdfc',
    accountType: 'Savings Account',
    accountNumber: '4821',
    maskedNumber: 'Savings •••• 4821',
    balance: 42580,
    formattedBalance: '₹42,580',
    currency: 'INR',
    fipId: 'FIP-HDFC-001',
    institutionType: 'Bank',
    selectedDefault: true,
  },
  {
    id: 'acc-icici-7192',
    bankName: 'ICICI Bank',
    bankKey: 'icici',
    accountType: 'Salary Account',
    accountNumber: '7192',
    maskedNumber: 'Salary •••• 7192',
    balance: 124350,
    formattedBalance: '₹1,24,350',
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
    balance: 65200,
    formattedBalance: '₹65,200',
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
    balance: 18400,
    formattedBalance: '₹18,400',
    currency: 'INR',
    fipId: 'FIP-SBI-004',
    institutionType: 'Bank',
    selectedDefault: false,
  },
];
