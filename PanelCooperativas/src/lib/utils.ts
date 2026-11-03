import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Pre-created Intl formatters (expensive to create, free to reuse) ────────
// Las fechas siempre en hora de Venezuela: el servidor (Vercel, UTC) y el
// navegador deben mostrar la misma hora de salida.

/** Zona horaria de todas las fechas del panel. */
export const ZONA_HORARIA_VE = "America/Caracas";

export const dateFormatterShort = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: ZONA_HORARIA_VE,
});

export const dateFormatterDayMonth = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "2-digit",
  timeZone: ZONA_HORARIA_VE,
});

export const dateFormatterDayMonthTime = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "numeric",
  timeZone: ZONA_HORARIA_VE,
});

export const dateFormatterDayMonthTime12h = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "numeric",
  hour12: true,
  timeZone: ZONA_HORARIA_VE,
});

export const relativeTimeFormatter = new Intl.RelativeTimeFormat("es-VE", {
  numeric: "auto",
});
