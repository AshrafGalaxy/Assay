import axios from 'axios';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const API_PORT = 8000;
const API_PATH = '/api/v1';

function buildApiUrl(host: string): string {
  return `http://${host}:${API_PORT}${API_PATH}`;
}

/** Host running Metro / Expo Go — usable as the LAN address of the backend machine. */
function getExpoDevHost(): string | null {
  // 1. Check NativeModules.SourceCode?.scriptURL (most reliable on physical devices)
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL && typeof scriptURL === 'string') {
      const match = scriptURL.match(/^https?:\/\/([^:\/]+)/);
      if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
        return match[1];
      }
    }
  } catch (_) {}

  // 2. Check Expo Constants candidates
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    (Constants as any).manifest?.debuggerHost,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    const host = candidate.split(':')[0]?.trim();
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
  }

  return null;
}

function getDefaultBaseUrl(): string {
  // In web browsers, connect directly to the current host (e.g. localhost)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const webHost = window.location.hostname || 'localhost';
    return buildApiUrl(webHost);
  }

  const expoHost = getExpoDevHost();
  if (expoHost) {
    return buildApiUrl(expoHost);
  }

  // Fallback to active machine LAN IP
  return buildApiUrl('10.10.0.246');
}

function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  // On native devices (iOS/Android), localhost refers to the phone itself and will fail.
  // When running on native, automatically resolve to the dev host machine.
  if (Platform.OS !== 'web') {
    if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      const devHost = getExpoDevHost() || '10.10.0.246';
      return buildApiUrl(devHost);
    }
    return envUrl;
  }

  // On Web, use envUrl if provided, or default to window.location.hostname
  return envUrl || getDefaultBaseUrl();
}

const resolvedBaseUrl = resolveApiBaseUrl();

/** Resolved backend base URL (useful for debugging Expo Go / LAN connectivity). */
export const API_BASE_URL = resolvedBaseUrl;

export const api = axios.create({
  baseURL: resolvedBaseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const endpoints = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    refresh: '/auth/refresh',
  },
  accounts: {
    list: '/accounts',
    demoConnect: '/accounts/demo-connect',
    link: '/accounts/link',
    sync: (id: string) => `/accounts/${id}/sync`,
    disconnect: (id: string) => `/accounts/${id}/disconnect`,
    consent: (id: string) => `/accounts/${id}/consent`,
  },
  transactions: {
    list: '/transactions',
    detail: (id: string) => `/transactions/${id}`,
    create: '/transactions',
  },
  financialHealth: {
    summary: '/financial-health',
    cashFlow: '/analytics/cash-flow',
    cashFlowForecast: '/analytics/cash-flow/forecast',
    cashFlowDaily: '/analytics/cash-flow/daily',
    obligations: '/analytics/obligations',
    spending: '/analytics/spending',
    moneyLeaks: '/analytics/money-leaks',
    scenarios: '/analytics/cash-flow/scenarios',
    affordability: '/analytics/affordability',
  },
  settings: {
    forecast: '/settings/forecast',
  },
  copilot: {
    query: '/copilot/query',
    insights: '/copilot/insights',
    audit: (id: string) => `/copilot/audit/${id}`,
  },
  recommendations: {
    list: '/recommendations',
    simulate: (id: string) => `/recommendations/${id}/simulate`,
  },
  simulator: {
    whatIf: '/simulator/what-if',
  },
  uploads: {
    receipt: '/uploads/receipt',
    upi: '/uploads/upi',
    confirm: (id: string) => `/uploads/${id}/confirm`,
  },
  planning: {
    forecast: '/planning/forecast',
    benchmark: '/planning/benchmark',
    simulateActions: '/planning/simulate-actions',
    replan: '/planning/replan',
    velocity: '/planning/velocity',
    debtBreakdown: '/planning/debt-breakdown',
  },
};
