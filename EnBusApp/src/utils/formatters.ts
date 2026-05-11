/**
 * Shared date/number formatting utilities for EnBusApp.
 *
 * All Intl formatters are created ONCE at module level (not inside render).
 * In React Native, `Intl` objects are expensive to instantiate (~0.5–2ms each).
 * Creating them per-render in a FlatList with 30+ items = 60+ unnecessary Intl
 * constructions per frame.
 */

// ─── Date formatters ──────────────────────────────────────────────────────────

const LOCALE = 'es-VE';

/** "12/05/2025" */
export const dateShort = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "12 may" */
export const dateDayMonth = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
});

/** "12 may, 3:45 PM" */
export const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "lun., 12 may" */
export const dateFull = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** "3:45 PM" */
export const timeOnly = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// ─── Number formatters ────────────────────────────────────────────────────────

/** "1.234,56 Bs.S" */
export const currencyBs = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'VES',
  minimumFractionDigits: 2,
});

/** "1.234,56 $" */
export const currencyUSD = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safe wrapper — returns fallback if dateString is invalid */
export function formatDate(
  dateString: string | null | undefined,
  formatter: Intl.DateTimeFormat = dateShort
): string {
  if (!dateString) return '—';
  try {
    return formatter.format(new Date(dateString));
  } catch {
    return dateString;
  }
}
