import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { SANDBOX_ACCOUNTS, SandboxAccount } from '../types/aa';
import { api, endpoints } from './api';

export type AAConsentStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'NONE';

export interface AAConsentDetails {
  consentId: string;
  purpose: string;
  dataRange: string;
  fetchFrequency: string;
  expiryDate: string;
  fiuName: string;
}

export interface AAState {
  aa_onboarding_completed: boolean;
  aa_consent_status: AAConsentStatus;
  aa_connected: boolean;
  aa_last_synced: string | null;
  connected_account_count: number;
  connected_accounts: SandboxAccount[];
  consent_details: AAConsentDetails;
}

const STORAGE_KEY = 'assay_aa_state_v2';

const DEFAULT_STATE: AAState = {
  aa_onboarding_completed: true,
  aa_consent_status: 'ACTIVE',
  aa_connected: true,
  aa_last_synced: 'Today, 8:20 PM',
  connected_account_count: 1,
  connected_accounts: [SANDBOX_ACCOUNTS[0]],
  consent_details: {
    consentId: 'AA-2026-9812-CONSENT',
    purpose: 'Personal Financial Management',
    dataRange: 'Last 12 months & ongoing',
    fetchFrequency: 'Daily / On-demand',
    expiryDate: '20 Sep 2027',
    fiuName: 'ASSAY Financial Intelligence',
  },
};

// In-memory runtime state
let memoryState: AAState = { ...DEFAULT_STATE };

// Initialize from localStorage if on web
if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.connected_accounts) && parsed.connected_accounts.length > 0) {
        memoryState = { ...DEFAULT_STATE, ...parsed };
      }
    }
  } catch (e) {
    // Ignore storage parse errors
  }
}

type AAListener = (state: AAState) => void;
const listeners: Set<AAListener> = new Set();

function persistState(state: AAState) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore
    }
  }
}

function notifyListeners() {
  persistState(memoryState);
  listeners.forEach((listener) => listener({ ...memoryState }));
}

function formatTimeNow(): string {
  const now = new Date();
  return `Today, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export const AAService = {
  getState(): AAState {
    return { ...memoryState };
  },

  setState(updates: Partial<AAState>) {
    memoryState = {
      ...memoryState,
      ...updates,
    };
    notifyListeners();
  },

  async fetchAccountsFromBackend(): Promise<SandboxAccount[]> {
    try {
      const response = await api.get(endpoints.accounts.list);
      const backendAccounts: any[] = response.data || [];
      if (backendAccounts.length > 0) {
        const mapped: SandboxAccount[] = backendAccounts.map((item) => {
          const bankKey = item.bank_key || (item.institution_name.toLowerCase().includes('icici') ? 'icici' : 'hdfc');
          const bal = Number(item.balance) || 0;
          return {
            id: String(item.id),
            bankName: item.institution_name,
            bankKey,
            accountType: item.account_type || 'Savings Account',
            accountNumber: item.account_number_masked?.replace(/[^0-9]/g, '') || '0000',
            maskedNumber: item.account_number_masked || `•••• ${item.id.slice(-4)}`,
            balance: bal,
            formattedBalance: `₹${bal.toLocaleString('en-IN')}`,
            currency: item.currency || 'INR',
            fipId: `FIP-${bankKey.toUpperCase()}-001`,
            institutionType: 'Bank',
            selectedDefault: false,
            status: item.status || 'connected',
            lastSynced: item.last_synced_at || formatTimeNow(),
          };
        });

        const activeCount = mapped.filter((a) => a.status !== 'disconnected').length;
        memoryState = {
          ...memoryState,
          aa_connected: activeCount > 0,
          connected_account_count: activeCount,
          connected_accounts: mapped,
        };
        notifyListeners();
        return mapped;
      }
    } catch (e) {
      // Backend offline or unreachable: keep local accounts
    }
    return memoryState.connected_accounts;
  },

  async addAccount(account: SandboxAccount): Promise<SandboxAccount> {
    const formattedTime = formatTimeNow();
    const updatedAccount: SandboxAccount = {
      ...account,
      status: 'connected',
      lastSynced: formattedTime,
    };

    const existingIndex = memoryState.connected_accounts.findIndex(
      (a) => a.id === account.id || a.bankKey === account.bankKey
    );

    let nextAccounts: SandboxAccount[];
    if (existingIndex >= 0) {
      nextAccounts = [...memoryState.connected_accounts];
      nextAccounts[existingIndex] = updatedAccount;
    } else {
      nextAccounts = [...memoryState.connected_accounts, updatedAccount];
    }

    const activeCount = nextAccounts.filter((a) => a.status !== 'disconnected').length;

    memoryState = {
      ...memoryState,
      aa_connected: true,
      aa_consent_status: 'ACTIVE',
      aa_last_synced: formattedTime,
      connected_account_count: activeCount,
      connected_accounts: nextAccounts,
    };
    notifyListeners();

    // Sync to backend asynchronously
    try {
      await api.post(endpoints.accounts.link, {
        bank_key: account.bankKey,
        institution_name: account.bankName,
        account_type: account.accountType,
        account_number_masked: account.maskedNumber,
        consent_id: memoryState.consent_details.consentId,
      });
    } catch (e) {
      // Backend request fallback handled locally
    }

    return updatedAccount;
  },

  async syncAccount(accountId: string): Promise<string> {
    const formattedTime = formatTimeNow();

    const nextAccounts = memoryState.connected_accounts.map((acc) => {
      if (acc.id === accountId) {
        return {
          ...acc,
          status: 'connected' as const,
          lastSynced: formattedTime,
        };
      }
      return acc;
    });

    memoryState = {
      ...memoryState,
      aa_last_synced: formattedTime,
      connected_accounts: nextAccounts,
    };
    notifyListeners();

    try {
      await api.post(endpoints.accounts.sync(accountId));
    } catch (e) {
      // Offline fallback
    }

    return formattedTime;
  },

  async disconnectAccountById(accountId: string): Promise<void> {
    const nextAccounts = memoryState.connected_accounts.map((acc) => {
      if (acc.id === accountId) {
        return {
          ...acc,
          status: 'disconnected' as const,
        };
      }
      return acc;
    });

    const activeCount = nextAccounts.filter((a) => a.status !== 'disconnected').length;

    memoryState = {
      ...memoryState,
      connected_accounts: nextAccounts,
      connected_account_count: activeCount,
      aa_connected: activeCount > 0,
    };
    notifyListeners();

    try {
      await api.post(endpoints.accounts.disconnect(accountId));
    } catch (e) {
      // Offline fallback
    }
  },

  completeOnboarding(selectedAccounts: SandboxAccount[] = [SANDBOX_ACCOUNTS[0]]) {
    const formattedTime = formatTimeNow();

    memoryState = {
      ...memoryState,
      aa_onboarding_completed: true,
      aa_consent_status: 'ACTIVE',
      aa_connected: true,
      aa_last_synced: formattedTime,
      connected_account_count: selectedAccounts.length,
      connected_accounts: selectedAccounts.map((a) => ({
        ...a,
        status: 'connected',
        lastSynced: formattedTime,
      })),
    };
    notifyListeners();
  },

  skipOnboarding() {
    memoryState = {
      ...memoryState,
      aa_onboarding_completed: true,
      aa_consent_status: 'NONE',
      aa_connected: false,
      aa_last_synced: null,
      connected_account_count: 0,
      connected_accounts: [],
    };
    notifyListeners();
  },

  disconnectAccount() {
    // Legacy disconnect all
    const updated = memoryState.connected_accounts.map((a) => ({
      ...a,
      status: 'disconnected' as const,
    }));
    memoryState = {
      ...memoryState,
      aa_connected: false,
      aa_consent_status: 'REVOKED',
      connected_account_count: 0,
      connected_accounts: updated,
    };
    notifyListeners();
  },

  reconnectAccount(accounts: SandboxAccount[] = [SANDBOX_ACCOUNTS[0]]) {
    const formattedTime = formatTimeNow();

    memoryState = {
      ...memoryState,
      aa_consent_status: 'ACTIVE',
      aa_connected: true,
      aa_last_synced: formattedTime,
      connected_account_count: accounts.length,
      connected_accounts: accounts.map((a) => ({
        ...a,
        status: 'connected',
        lastSynced: formattedTime,
      })),
    };
    notifyListeners();
  },

  syncNow(): Promise<string> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const formattedTime = formatTimeNow();
        const updated = memoryState.connected_accounts.map((a) =>
          a.status !== 'disconnected' ? { ...a, lastSynced: formattedTime } : a
        );
        memoryState = {
          ...memoryState,
          aa_last_synced: formattedTime,
          connected_accounts: updated,
        };
        notifyListeners();
        resolve(formattedTime);
      }, 700);
    });
  },

  resetState() {
    memoryState = { ...DEFAULT_STATE };
    notifyListeners();
  },

  subscribe(listener: AAListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Custom React hook for reactive AA state across components
 */
export function useAAState(): AAState {
  const [state, setState] = useState<AAState>(() => AAService.getState());

  useEffect(() => {
    const unsubscribe = AAService.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  return state;
}
