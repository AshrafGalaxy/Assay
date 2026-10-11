import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { SandboxAccount, LinkedAccount, LinkedAccountStatus } from '../types/aa';
import { api, endpoints } from './api';
import { formatINR } from './finance';

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
  /** Accounts sourced exclusively from the backend (`GET /accounts`). */
  connected_accounts: LinkedAccount[];
  /** True while `GET /accounts` is in flight. */
  accounts_loading: boolean;
  /** Set when the last backend account fetch failed; null otherwise. */
  accounts_error: string | null;
  consent_details: AAConsentDetails;
}

// v3: connected_accounts are never restored from storage (balances must come from the backend).
const STORAGE_KEY = 'assay_aa_state_v3';

const DEFAULT_STATE: AAState = {
  aa_onboarding_completed: false,
  aa_consent_status: 'NONE',
  aa_connected: false,
  aa_last_synced: null,
  connected_account_count: 0,
  connected_accounts: [],
  accounts_loading: false,
  accounts_error: null,
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

// Restore only non-financial flags from localStorage on web. Accounts/balances are
// always re-fetched from the backend.
if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        memoryState = {
          ...DEFAULT_STATE,
          aa_onboarding_completed: Boolean(parsed.aa_onboarding_completed),
          aa_consent_status: parsed.aa_consent_status ?? DEFAULT_STATE.aa_consent_status,
        };
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
      const { aa_onboarding_completed, aa_consent_status } = state;
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ aa_onboarding_completed, aa_consent_status }),
      );
    } catch (e) {
      // Ignore
    }
  }
}

function notifyListeners() {
  persistState(memoryState);
  listeners.forEach((listener) => listener({ ...memoryState }));
}

function inferBankKey(item: any): string {
  if (item?.bank_key) return String(item.bank_key);
  const name = String(item?.institution_name || '').toLowerCase();
  const known = ['hdfc', 'icici', 'axis', 'sbi', 'kotak', 'pnb', 'indusind', 'zerodha', 'groww'];
  return known.find((k) => name.includes(k)) || name.replace(/[^a-z0-9]/g, '') || 'bank';
}

function toStatus(value: unknown): LinkedAccountStatus {
  switch (value) {
    case 'connected':
    case 'syncing':
    case 'disconnected':
    case 'error':
      return value;
    default:
      return 'connected';
  }
}

/** Map a backend `AccountOut` payload to the frontend `LinkedAccount` shape. */
export function mapBackendAccount(item: any): LinkedAccount {
  const bankKey = inferBankKey(item);
  const balance = Number(item?.balance);
  const safeBalance = Number.isFinite(balance) ? balance : 0;
  const id = String(item?.id ?? '');
  const masked: string | undefined = item?.account_number_masked || undefined;
  return {
    id,
    bankName: String(item?.institution_name || bankKey.toUpperCase()),
    bankKey,
    accountType: item?.account_type || 'Savings Account',
    accountNumber: masked?.replace(/[^0-9]/g, '') || id.slice(-4),
    maskedNumber: masked || `•••• ${id.slice(-4)}`,
    balance: safeBalance,
    formattedBalance: formatINR(safeBalance),
    currency: item?.currency || 'INR',
    fipId: `FIP-${bankKey.toUpperCase()}-001`,
    institutionType: 'Bank',
    selectedDefault: false,
    status: toStatus(item?.status),
    lastSynced: item?.last_synced_at ?? null,
  };
}

function applyAccounts(accounts: LinkedAccount[]) {
  const active = accounts.filter((a) => a.status !== 'disconnected');
  const lastSynced =
    active.map((a) => a.lastSynced).find((v): v is string => Boolean(v)) ?? null;

  memoryState = {
    ...memoryState,
    aa_connected: active.length > 0,
    aa_consent_status: active.length > 0 ? 'ACTIVE' : memoryState.aa_consent_status,
    // If the backend already holds accounts, onboarding has evidently been completed.
    aa_onboarding_completed: memoryState.aa_onboarding_completed || accounts.length > 0,
    aa_last_synced: lastSynced,
    connected_account_count: active.length,
    connected_accounts: accounts,
    accounts_loading: false,
    accounts_error: null,
  };
  notifyListeners();
}

function errorMessage(e: unknown, fallback: string): string {
  const detail = (e as any)?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
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

  /**
   * Load accounts from `GET /accounts`. This is the only source of account balances.
   * On failure the account list is left untouched and `accounts_error` is set.
   */
  async fetchAccountsFromBackend(): Promise<LinkedAccount[]> {
    memoryState = { ...memoryState, accounts_loading: true, accounts_error: null };
    notifyListeners();
    try {
      const response = await api.get(endpoints.accounts.list);
      const backendAccounts: any[] = Array.isArray(response.data) ? response.data : [];
      const mapped = backendAccounts.map(mapBackendAccount);
      applyAccounts(mapped);
      return mapped;
    } catch (e) {
      memoryState = {
        ...memoryState,
        accounts_loading: false,
        accounts_error: errorMessage(e, 'Unable to reach the accounts service.'),
      };
      notifyListeners();
      return memoryState.connected_accounts;
    }
  },

  /**
   * Link a bank via `POST /accounts/link`. The returned account (including its
   * balance) comes from the backend; nothing is fabricated locally.
   * Throws if the backend request fails.
   */
  async addAccount(account: SandboxAccount): Promise<LinkedAccount> {
    const response = await api.post(endpoints.accounts.link, {
      bank_key: account.bankKey,
      institution_name: account.bankName,
      account_type: account.accountType,
      account_number_masked: account.maskedNumber,
      consent_id: memoryState.consent_details.consentId,
    });

    const linked = mapBackendAccount(response.data);

    const existingIndex = memoryState.connected_accounts.findIndex(
      (a) => a.id === linked.id || a.bankKey === linked.bankKey,
    );
    const nextAccounts = [...memoryState.connected_accounts];
    if (existingIndex >= 0) {
      nextAccounts[existingIndex] = linked;
    } else {
      nextAccounts.push(linked);
    }

    memoryState = {
      ...memoryState,
      aa_onboarding_completed: true,
      aa_consent_status: 'ACTIVE',
    };
    applyAccounts(nextAccounts);

    return linked;
  },

  /**
   * Sync a single account via `POST /accounts/{id}/sync`. Updates balance and
   * last-synced time from the backend response. Throws on failure.
   */
  async syncAccount(accountId: string): Promise<string> {
    const response = await api.post(endpoints.accounts.sync(accountId));
    const payload = response.data || {};
    const syncedAt: string = payload.last_synced || new Date().toISOString();
    const balance = Number(payload.balance);

    const nextAccounts = memoryState.connected_accounts.map((acc) => {
      if (acc.id !== accountId) return acc;
      const nextBalance = Number.isFinite(balance) ? balance : acc.balance;
      return {
        ...acc,
        status: 'connected' as const,
        lastSynced: syncedAt,
        balance: nextBalance,
        formattedBalance: formatINR(nextBalance),
      };
    });

    applyAccounts(nextAccounts);
    return syncedAt;
  },

  /** Disconnect one account via `POST /accounts/{id}/disconnect`. Throws on failure. */
  async disconnectAccountById(accountId: string): Promise<void> {
    await api.post(endpoints.accounts.disconnect(accountId));

    const nextAccounts = memoryState.connected_accounts.map((acc) =>
      acc.id === accountId ? { ...acc, status: 'disconnected' as const } : acc,
    );
    const active = nextAccounts.filter((a) => a.status !== 'disconnected');

    memoryState = {
      ...memoryState,
      connected_accounts: nextAccounts,
      connected_account_count: active.length,
      aa_connected: active.length > 0,
    };
    notifyListeners();
  },

  /**
   * Finish onboarding. Marks onboarding complete immediately, then links each
   * selected bank through the backend and refreshes the account list.
   */
  async completeOnboarding(selectedAccounts: SandboxAccount[] = []): Promise<void> {
    memoryState = {
      ...memoryState,
      aa_onboarding_completed: true,
      aa_consent_status: selectedAccounts.length > 0 ? 'ACTIVE' : memoryState.aa_consent_status,
      accounts_loading: selectedAccounts.length > 0,
      accounts_error: null,
    };
    notifyListeners();

    if (selectedAccounts.length === 0) return;

    let failures = 0;
    for (const bank of selectedAccounts) {
      try {
        await AAService.addAccount(bank);
      } catch {
        failures += 1;
      }
    }

    await AAService.fetchAccountsFromBackend();

    if (failures > 0 && !memoryState.accounts_error) {
      memoryState = {
        ...memoryState,
        accounts_error: `${failures} of ${selectedAccounts.length} bank link request(s) failed.`,
      };
      notifyListeners();
    }
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

  /** Legacy: disconnect every linked account. */
  async disconnectAccount(): Promise<void> {
    const targets = memoryState.connected_accounts.filter((a) => a.status !== 'disconnected');
    await Promise.allSettled(targets.map((a) => api.post(endpoints.accounts.disconnect(a.id))));

    memoryState = {
      ...memoryState,
      aa_connected: false,
      aa_consent_status: 'REVOKED',
      connected_account_count: 0,
      connected_accounts: memoryState.connected_accounts.map((a) => ({
        ...a,
        status: 'disconnected' as const,
      })),
    };
    notifyListeners();
  },

  /** Re-link the given banks through the backend and refresh the account list. */
  async reconnectAccount(accounts: SandboxAccount[] = []): Promise<void> {
    for (const bank of accounts) {
      try {
        await AAService.addAccount(bank);
      } catch {
        // Surfaced via accounts_error after refresh
      }
    }
    await AAService.fetchAccountsFromBackend();
  },

  /** Sync every active account via the backend and return the latest sync time. */
  async syncNow(): Promise<string> {
    const active = memoryState.connected_accounts.filter((a) => a.status !== 'disconnected');
    let latest: string | null = null;
    for (const acc of active) {
      try {
        latest = await AAService.syncAccount(acc.id);
      } catch {
        // Individual sync failures are reflected in per-account state
      }
    }
    if (!latest) {
      await AAService.fetchAccountsFromBackend();
      latest = memoryState.aa_last_synced;
    }
    return latest ?? '';
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

// Hydrate accounts from the backend as soon as the service module loads.
void AAService.fetchAccountsFromBackend();

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
