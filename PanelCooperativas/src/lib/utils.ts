import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ZONA_VE, formatFechaHoraCortaVE, formatFechaHoraVE, formatFechaVE } from "@/lib/fechas";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Fechas (alias retirados, D25) ───────────────────────────────────────────
// Las fechas se escriben con lib/fechas (shared/ve.ts): 12 h y hora de Venezuela.
// Estos alias conservan la forma `{ format(fecha) }` para que el código existente
// compile mientras se migra; la integración de la fase 5 los borra.

type FormateadorVE = { format(valor: string | number | Date): string };

/** @deprecated Usar `ZONA_VE` de `@/lib/fechas`. */
export const ZONA_HORARIA_VE = ZONA_VE;

/** @deprecated Usar `formatFechaHoraVE` ("03/11/2026 · 2:30 p. m."). */
export const dateFormatterShort: FormateadorVE = { format: (v) => formatFechaHoraVE(v) };

/** @deprecated Usar `formatFechaVE(v, { day: "2-digit", month: "2-digit" })` ("03/11"). */
export const dateFormatterDayMonth: FormateadorVE = {
  format: (v) => formatFechaVE(v, { day: "2-digit", month: "2-digit" }),
};

/** @deprecated Usar `formatFechaHoraCortaVE` ("03/11 · 2:30 p. m."). */
export const dateFormatterDayMonthTime: FormateadorVE = { format: (v) => formatFechaHoraCortaVE(v) };

/** @deprecated Usar `formatFechaHoraCortaVE` ("03/11 · 2:30 p. m."). */
export const dateFormatterDayMonthTime12h: FormateadorVE = { format: (v) => formatFechaHoraCortaVE(v) };

/** Para listas, preferir `formatHaceTiempo` de `@/lib/fechas`. */
export const relativeTimeFormatter = new Intl.RelativeTimeFormat("es-VE", {
  numeric: "auto",
});
