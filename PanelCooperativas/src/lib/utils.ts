import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Pre-created Intl formatters (expensive to create, free to reuse) ────────

export const currencyFormatterUSD = new Intl.NumberFormat("es-VE", {
  style: "currency",
  currency: "USD",
});

export const currencyFormatterVES = new Intl.NumberFormat("es-VE", {
  style: "currency",
  currency: "VES",
});

export const dateFormatterShort = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "short",
  timeStyle: "short",
});

export const dateFormatterDayMonth = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "2-digit",
});

export const dateFormatterDayMonthTime = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "numeric",
});

export const dateFormatterDayMonthTime12h = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "numeric",
  hour12: true,
});

export const relativeTimeFormatter = new Intl.RelativeTimeFormat("es-VE", {
  numeric: "auto",
});

export function formatCurrency(amount: number) {
  return currencyFormatterUSD.format(amount);
}
