/**
 * Formats a numeric value into standard Indian Rupee format (e.g. ₹1,250.00 or ₹1,250)
 */
export function formatINR(amount: number, showDecimals: boolean = false): string {
  if (isNaN(amount)) return '₹0';
  if (showDecimals) {
    return `₹${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}
