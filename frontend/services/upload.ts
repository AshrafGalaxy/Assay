import axios from 'axios';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { api, endpoints } from './api';

export const RECEIPT_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Healthcare',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Services',
  'Other',
] as const;

export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

export type ReceiptOcrResult = {
  upload_id: string;
  status: 'PROCESSED' | 'UNREADABLE' | 'MANUAL_ENTRY_REQUIRED';
  ocr: { engine: 'tesseract' | 'none'; overall_confidence: number };
  receipt: {
    merchant: string | null;
    total_amount: number | null;
    subtotal: number | null;
    tax: number | null;
    date: string | null;
    time: string | null;
    payment_method: string | null;
    transaction_reference: string | null;
  };
  line_items: Array<{ name: string; quantity?: number; unit_price?: number | null; total_price?: number | null }>;
  raw_text: string;
  suggested_category: string | null;
  message: string | null;
};

type CapturedImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
};

export type ReceiptConfirmInput = {
  merchant: string;
  total_amount: number;
  category: string;
};

const OCR_TIMEOUT_MS = 90_000;

/** Gallery photos (often HEIC) and large camera shots are normalized to JPEG for the backend.
 * Always resizes high-MP images (e.g. 64MP on Realme) to max width 1200 to prevent native OOM crashes.
 */
async function prepareReceiptImage(image: CapturedImage): Promise<CapturedImage> {
  const actions = [{ resize: { width: 1200 } }];

  const converted = await manipulateAsync(image.uri, actions, {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });

  return {
    uri: converted.uri,
    fileName: `receipt-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
    width: converted.width,
    height: converted.height,
  };
}

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (error.code === 'ECONNABORTED') {
      return 'Scan timed out. Try a clearer, closer photo of the receipt.';
    }
    if (!error.response) {
      return 'Could not reach the Assay backend. Check Wi‑Fi and that the server is running.';
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unexpected scan error.';
}

export async function scanReceipt(image: CapturedImage): Promise<ReceiptOcrResult> {
  const prepared = await prepareReceiptImage(image);
  const body = new FormData();
  body.append('file', {
    uri: prepared.uri,
    name: prepared.fileName || `receipt-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);

  try {
    const response = await api.post<ReceiptOcrResult>(endpoints.uploads.receipt, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: OCR_TIMEOUT_MS,
    });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

export async function confirmReceipt(
  result: ReceiptOcrResult,
  overrides: ReceiptConfirmInput,
): Promise<{ transaction_id: string; category: string }> {
  const merchant = overrides.merchant.trim();
  const totalAmount = overrides.total_amount;
  const category = overrides.category.trim() || result.suggested_category || 'Other';

  if (!merchant || !(totalAmount > 0)) {
    throw new Error('Enter a merchant and total amount before creating a transaction.');
  }

  const response = await api.post(endpoints.uploads.confirm(result.upload_id), {
    merchant,
    total_amount: totalAmount,
    category,
    date: result.receipt.date,
    time: result.receipt.time,
    payment_method: result.receipt.payment_method,
    transaction_reference: result.receipt.transaction_reference,
    description: `Receipt OCR: ${merchant}`,
    line_items: result.line_items,
  });
  return response.data as { transaction_id: string; category: string };
}
