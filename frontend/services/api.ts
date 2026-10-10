import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 8000;
const API_PATH = '/api/v1';

function buildApiUrl(host: string): string {
  return `http://${host}:${API_PORT}${API_PATH}`;
}

/** Host running Metro / Expo Go — usable as the LAN address of the backend machine. */
function getExpoDevHost(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.manifest2?.extra?.expoClient?.hostUri,
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
  const expoHost = getExpoDevHost();
  if (expoHost) {
    return buildApiUrl(expoHost);
  }

  // Simulator / emulator / web only — localhost is unreachable from a physical device.
  return (
    Platform.select({
      android: buildApiUrl('10.0.2.2'),
      ios: buildApiUrl('localhost'),
      default: buildApiUrl('localhost'),
    }) ?? buildApiUrl('localhost')
  );
}

const resolvedBaseUrl = process.env.EXPO_PUBLIC_API_URL || getDefaultBaseUrl();

export const api = axios.create({
  baseURL: resolvedBaseUrl,
  timeout: 10000,
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
    sync: (id: string) => `/accounts/${id}/sync`,
  },
  transactions: {
    list: '/transactions',
    detail: (id: string) => `/transactions/${id}`,
    create: '/transactions',
  },
  financialHealth: {
    summary: '/financial-health',
    cashFlow: '/analytics/cash-flow',
    obligations: '/analytics/obligations',
    spending: '/analytics/spending',
  },
  copilot: {
    query: '/copilot/query',
  },
  recommendations: {
    list: '/recommendations',
    simulate: (id: string) => `/recommendations/${id}/simulate`,
  },
  uploads: {
    receipt: '/uploads/receipt',
    upi: '/uploads/upi',
    confirm: (id: string) => `/uploads/${id}/confirm`,
  },
};
