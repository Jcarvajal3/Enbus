/**
 * Shared date/number formatting utilities for EnBusApp.
 *
 * All Intl formatters are created ONCE at module level (not inside render).
 * In React Native, `Intl` objects are expensive to instantiate (~0.5–2ms each).
 * Creating them per-render in a FlatList with 30+ items = 60+ unnecessary Intl
 * constructions per frame.
 */

import { formatCiudad, ZONA_VE } from './ve.generated';

// ─── Date formatters ──────────────────────────────────────────────────────────
// Fechas y horas: usar `formatDiaVE` ("mar. 3 nov."), `formatHoraVE` ("2:30 p. m.") y
// `formatDiaHoraVE` ("mar. 3 nov. · 2:30 p. m."), siempre en hora de Venezuela (D4).

const LOCALE = 'es-VE';

/** Lo que acepta `formatDate`: un `Intl.DateTimeFormat` o un alias VE. */
export interface FormateadorFecha {
  format(fecha: Date): string;
}

/** "12/05/2025" (hora de Venezuela) */
export const dateShort = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: ZONA_VE,
});

/** "12 may" (hora de Venezuela) */
export const dateDayMonth = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  timeZone: ZONA_VE,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safe wrapper — returns fallback if dateString is invalid */
export function formatDate(
  dateString: string | null | undefined,
  formatter: FormateadorFecha = dateShort
): string {
  if (!dateString) return '—';
  try {
    return formatter.format(new Date(dateString));
  } catch {
    return dateString;
  }
}

/**
 * Formats a bare calendar day ('YYYY-MM-DD') as "02/10/2026" without going
 * through `Date`, so the day never shifts with the device time zone.
 */
export function formatDateKey(key: string | null | undefined): string {
  if (!key) return '—';
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : key;
}

/** Local calendar day as 'YYYY-MM-DD' (the format of Postgres `date` columns). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Ciudades ────────────────────────────────────────────────────────────────
// La fuente es shared/ve.ts (copiada en ./ve.generated.ts por shared/generar.mjs),
// la misma que usan el panel y la landing: "merida" → "Mérida",
// "puerto_la_cruz" → "Puerto La Cruz", "san_juan" → "San Juan de los Morros".

/** Formats a db-friendly city/state name (e.g. "puerto_la_cruz" -> "Puerto La Cruz", "merida" -> "Mérida"); "—" if empty */
export function formatCity(val: string | null | undefined): string {
  return formatCiudad(val) || '—';
}

// Formatos venezolanos compartidos (hora de Venezuela, duraciones, ciudades): mismos
// nombres que en el panel. Ver shared/README.md.
export {
  formatCiudad,
  formatRuta,
  normalizarCiudad,
  mismaCiudad,
  ZONA_VE,
  fechaVE,
  hoyVE,
  sumarDiasVE,
  fechaHoraVEaISO,
  rangoDiaVE,
  formatFechaVE,
  formatHoraVE,
  formatFechaHoraVE,
  formatFechaHoraCortaVE,
  formatDiaVE,
  formatDiaHoraVE,
  capitalizarInicio,
  CLAVE_MINIMO,
  CLAVE_AYUDA,
  CLAVE_ERROR,
  formatFechaCalendario,
  formatHaceTiempo,
  formatDuracion,
} from './ve.generated';
