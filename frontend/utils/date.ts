/**
 * Date parsing and month boundary utilities for financial calculations.
 */

export function parseTransactionDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  const now = new Date();

  if (trimmed.toLowerCase().startsWith('today')) {
    return now;
  }
  if (trimmed.toLowerCase().startsWith('yesterday')) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return yesterday;
  }

  // Handle standard ISO or date string formats (e.g. "2026-10-10 16:55:00")
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return now;
}

export function isSameMonth(dateA: Date, dateB: Date): boolean {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth()
  );
}

export function isCurrentCalendarMonth(dateStr?: string, referenceDate: Date = new Date()): boolean {
  if (!dateStr) return true;
  const trimmed = dateStr.trim();
  if (
    trimmed.toLowerCase().startsWith('today') ||
    trimmed.toLowerCase().startsWith('yesterday')
  ) {
    return true;
  }
  const parsed = parseTransactionDate(trimmed);
  return isSameMonth(parsed, referenceDate);
}
