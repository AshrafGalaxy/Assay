/** Re-export finance transaction helpers for existing import paths. */
export {
  fetchTransactions,
  type ApiTransaction,
} from './finance';

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, endpoints } from './api';
import { isCurrentCalendarMonth } from '../utils/date';

export interface Transaction {
  id: string;
  user_id?: string;
  account_id?: string;
  bank_key?: string;
  account_name?: string;
  amount: number;
  type: 'debit' | 'credit'; // 'debit' = expense, 'credit' = income
  category: string;
  merchant_name: string;
  description?: string;
  transaction_date: string;
  payment_method?: string;
  is_recurring?: boolean;
  is_fixed?: boolean;
  is_discretionary?: boolean;
  is_internal_transfer?: boolean;
  source_type?: string;
  created_at?: string;
}

export interface CreateTransactionInput {
  amount: number;
  merchant_name: string;
  category: string;
  type: 'expense' | 'income' | 'debit' | 'credit';
  payment_method?: string;
  transaction_date?: string;
  description?: string;
}

export interface CategorySpendSummary {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface FinancialTotals {
  cashIn: number;
  cashOut: number;
  remainingThisMonth: number;
  categorySpending: CategorySpendSummary[];
}

// v2: cache contains backend-sourced rows only (v1 carried seeded demo rows).
const STORAGE_KEY = 'assay_transactions_v2';
const LOCAL_ID_PREFIX = 'tx_local_';

// Category color palette matching ASSAY design tokens
export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#F59E0B',
  'Shopping': '#111827',
  'Transport': '#10B981',
  'Subscriptions': '#F97316',
  'Bills & Utilities': '#2563EB',
  'Groceries': '#059669',
  'Healthcare': '#DC2626',
  'Entertainment': '#7C3AED',
  'Housing & Rent': '#0D9488',
  'Education': '#4F46E5',
  'Travel': '#0284C7',
  'Salary': '#16A34A',
  'Freelance': '#10B981',
  'Investment': '#6366F1',
  'Other Income': '#34D399',
  'Others': '#94A3B8',
  'Other': '#94A3B8',
};

// The ledger starts empty; GET /transactions is the only source of rows.
let memoryTransactions: Transaction[] = [];
// Sync status: null = never attempted, 'ok' = backend answered, 'error' = unreachable
let syncStatus: 'ok' | 'error' | null = null;
let syncInFlight: Promise<Transaction[]> | null = null;
type TransactionListener = (transactions: Transaction[]) => void;
const listeners = new Set<TransactionListener>();

function mapBackendTransaction(item: any): Transaction {
  return {
    id: String(item.id),
    user_id: item.user_id,
    account_id: item.account_id,
    amount: Number(item.amount),
    type: item.type === 'credit' ? 'credit' : 'debit',
    category: item.category || 'Other',
    merchant_name: item.merchant_name || item.description || 'Transaction',
    description: item.description,
    transaction_date: item.transaction_date || new Date().toISOString(),
    payment_method: item.payment_method || 'UPI',
    is_recurring: Boolean(item.is_recurring),
    is_fixed: Boolean(item.is_fixed),
    is_discretionary: Boolean(item.is_discretionary),
    source_type: item.source_type || 'manual',
    created_at: item.created_at,
  };
}

// Asynchronous storage load
void (async () => {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      raw = window.localStorage.getItem(STORAGE_KEY);
    }
    if (!raw) {
      raw = await AsyncStorage.getItem(STORAGE_KEY);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      // Only hydrate if the backend has not already answered during this session.
      if (Array.isArray(parsed) && parsed.length > 0 && syncStatus !== 'ok') {
        memoryTransactions = parsed;
        notifyListeners();
      }
    }
  } catch (_) {}
})();

function persistState(txs: Transaction[]) {
  try {
    const raw = JSON.stringify(txs);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, raw);
    }
    AsyncStorage.setItem(STORAGE_KEY, raw).catch(() => {});
  } catch (_) {}
}

function notifyListeners() {
  persistState(memoryTransactions);
  listeners.forEach((listener) => listener([...memoryTransactions]));
}

export const TransactionService = {
  getTransactions(): Transaction[] {
    return [...memoryTransactions];
  },

  /** 'ok' once GET /transactions has answered, 'error' if unreachable, null before first attempt. */
  getSyncStatus(): 'ok' | 'error' | null {
    return syncStatus;
  },

  async fetchFromBackend(): Promise<Transaction[]> {
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      try {
        const pageSize = 500;
        const items: any[] = [];
        let offset = 0;
        let total = 0;
        do {
          const response = await api.get(endpoints.transactions.list, {
            params: { limit: pageSize, offset },
          });
          const page: any[] = response.data?.items || [];
          total = Number(response.data?.total ?? page.length);
          items.push(...page);
          offset += page.length;
          if (page.length === 0) break;
        } while (offset < total);
        const mapped = items.map(mapBackendTransaction);
        const backendIds = new Set(mapped.map((t) => t.id));

        // Backend is the source of truth. Keep only user-entered rows that were
        // saved offline (tx_local_*) and have not reached the backend yet.
        const pendingLocal = memoryTransactions.filter(
          (t) => t.id.startsWith(LOCAL_ID_PREFIX) && !backendIds.has(t.id),
        );
        memoryTransactions = [...pendingLocal, ...mapped];
        syncStatus = 'ok';
        notifyListeners();
      } catch (e) {
        // Backend is unavailable or offline: preserve whatever we have
        syncStatus = 'error';
        listeners.forEach((listener) => listener([...memoryTransactions]));
      } finally {
        syncInFlight = null;
      }
      return memoryTransactions;
    })();
    return syncInFlight;
  },

  /** Load a single transaction via GET /transactions/:id. Returns null on 404 / network error. */
  async fetchTransactionById(id: string): Promise<Transaction | null> {
    const cached = memoryTransactions.find((t) => t.id === id);
    try {
      const response = await api.get(endpoints.transactions.detail(id));
      if (response.data?.id) {
        return mapBackendTransaction(response.data);
      }
    } catch (_) {
      // fall through to cache
    }
    return cached ? { ...cached } : null;
  },

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const amountVal = Number(input.amount);
    if (!amountVal || amountVal <= 0) {
      throw new Error('Please enter a valid positive amount.');
    }
    if (!input.merchant_name.trim()) {
      throw new Error('Please enter a merchant or transaction description.');
    }
    if (!input.category.trim()) {
      throw new Error('Please select a category.');
    }

    const normalizedType: 'debit' | 'credit' =
      input.type === 'income' || input.type === 'credit' ? 'credit' : 'debit';

    const now = new Date();
    const formattedDate =
      input.transaction_date ||
      `Today, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const payload = {
      amount: amountVal,
      merchant_name: input.merchant_name.trim(),
      category: input.category.trim(),
      type: normalizedType,
      payment_method: input.payment_method || 'UPI',
      description: input.description?.trim() || undefined,
      transaction_date: formattedDate,
      source_type: 'manual',
    };

    let savedTx: Transaction;

    try {
      const response = await api.post(endpoints.transactions.create, payload);
      const resData = response.data;
      savedTx = {
        id: String(resData.id),
        user_id: resData.user_id,
        account_id: resData.account_id,
        amount: Number(resData.amount),
        type: resData.type === 'credit' ? 'credit' : 'debit',
        category: resData.category,
        merchant_name: resData.merchant_name,
        description: resData.description,
        transaction_date: resData.transaction_date,
        payment_method: resData.payment_method || payload.payment_method,
        source_type: 'manual',
        created_at: resData.created_at,
      };
    } catch (err: any) {
      // If backend responded with explicit HTTP 4xx validation error, surface it
      if (err?.response && err.response.status >= 400 && err.response.status < 500) {
        const detail = err.response.data?.detail;
        if (typeof detail === 'string') {
          throw new Error(detail);
        }
      }

      // If backend is offline, network times out, or LAN is unreachable:
      // Fallback immediately to local persistence so user is NEVER blocked by network latency
      savedTx = {
        id: `tx_local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        user_id: 'usr_demo_01',
        account_id: 'primary_account',
        amount: amountVal,
        type: normalizedType,
        category: payload.category,
        merchant_name: payload.merchant_name,
        description: payload.description,
        transaction_date: payload.transaction_date,
        payment_method: payload.payment_method,
        source_type: 'manual',
        created_at: new Date().toISOString(),
      };
    }

    // Prepend to local memory store and notify all reactive screens
    memoryTransactions = [
      savedTx,
      ...memoryTransactions.filter((t) => t.id !== savedTx.id),
    ];
    persistState(memoryTransactions);
    notifyListeners();

    return savedTx;
  },

  calculateFinancialTotals(txs: Transaction[]): FinancialTotals {
    // Current calendar month transactions calculation
    // Calculate cashIn (all credit / income) and cashOut (all debit / expense)
    let cashIn = 0;
    let cashOut = 0;
    const categoryMap: Record<string, number> = {};

    for (const tx of txs) {
      // Respect month boundaries: only include current month transactions in active cash-flow
      if (!isCurrentCalendarMonth(tx.transaction_date)) {
        continue;
      }

      // Recognize and exclude internal transfers between user's own linked accounts
      // Prevents self transfers from inflating both cash in and cash out!
      const isInternal =
        Boolean(tx.is_internal_transfer) ||
        tx.category === 'Transfer' ||
        tx.merchant_name.toLowerCase().includes('self transfer') ||
        tx.merchant_name.toLowerCase().includes('internal transfer');

      if (isInternal) {
        continue;
      }

      const amt = Number(tx.amount) || 0;
      if (tx.type === 'credit') {
        cashIn += amt;
      } else {
        cashOut += amt;
        const cat = tx.category || 'Other';
        categoryMap[cat] = (categoryMap[cat] || 0) + amt;
      }
    }

    const remainingThisMonth = Math.max(0, cashIn - cashOut);

    const categorySpending: CategorySpendSummary[] = Object.entries(categoryMap)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: cashOut > 0 ? Math.round((amount / cashOut) * 100) : 0,
        color: CATEGORY_COLORS[name] || '#94A3B8',
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      cashIn,
      cashOut,
      remainingThisMonth,
      categorySpending,
    };
  },

  /**
   * Account linking imports statement rows server-side (POST /accounts/link).
   * This simply refetches GET /transactions so the UI reflects the imported ledger.
   * Parameters are kept for call-site compatibility.
   */
  async importAccountTransactions(
    _accountId: string,
    _bankKey: string,
    _bankName: string,
  ): Promise<Transaction[]> {
    return TransactionService.fetchFromBackend();
  },

  subscribe(listener: TransactionListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    TransactionService.getTransactions()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatusState, setSyncStatusState] = useState<'ok' | 'error' | null>(() =>
    TransactionService.getSyncStatus()
  );

  useEffect(() => {
    const unsubscribe = TransactionService.subscribe((updated) => {
      setTransactions(updated);
      setSyncStatusState(TransactionService.getSyncStatus());
    });

    // Background sync with backend
    TransactionService.fetchFromBackend()
      .catch(() => {})
      .finally(() => setSyncStatusState(TransactionService.getSyncStatus()));

    return unsubscribe;
  }, []);

  const totals = TransactionService.calculateFinancialTotals(transactions);

  const createTransaction = async (input: CreateTransactionInput) => {
    setLoading(true);
    setError(null);
    try {
      const created = await TransactionService.createTransaction(input);
      return created;
    } catch (e: any) {
      setError(e.message || 'Failed to create transaction');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await TransactionService.fetchFromBackend();
    } finally {
      setLoading(false);
    }
  };

  return {
    transactions,
    loading,
    error,
    /** True once GET /transactions has answered at least once this session. */
    hasLoaded: syncStatusState === 'ok',
    /** True if the last backend sync failed (offline / unreachable). */
    syncError: syncStatusState === 'error',
    cashIn: totals.cashIn,
    cashOut: totals.cashOut,
    remainingThisMonth: totals.remainingThisMonth,
    categorySpending: totals.categorySpending,
    createTransaction,
    refresh,
  };
}
