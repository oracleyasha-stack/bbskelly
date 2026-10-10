import type { Security } from '../types/terminal';

export const currencySymbol = (security: Security | null | undefined): string =>
  security?.currency === 'INR' ? '₹' : '$';

/** Opens a web search for a publicly available original broker report. */
export function publicReportSearchUrl(
  ticker: string,
  companyName: string,
  broker?: string
): string {
  const query = [ticker, companyName, broker, 'equity research report filetype:pdf']
    .filter(Boolean)
    .join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
