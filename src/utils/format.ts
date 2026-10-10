/**
 * Money formatting helpers.
 *
 * Finance convention: the sign always goes BEFORE the currency symbol
 * (`-$7.60`, never `$-7.60`, `-₹50.00`, never `₹-50.00`). Panels render live P&L
 * and option Greeks that routinely go negative, so every signed amount must use
 * these helpers.
 */

/** Formats an amount with currency symbol: formatMoney(-1234.5, 2, '₹') -> "-₹1,234.50". */
export const formatMoney = (value: number, decimals = 2, symbol = '$'): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${symbol}${abs}`;
};

/** Like formatMoney but always shows a sign: "+$12.34" for gains, "-$7.60" for losses. */
export const formatSignedMoney = (value: number, decimals = 2, symbol = '$'): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${symbol}${abs}`;
};

