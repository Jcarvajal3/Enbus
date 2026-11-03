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

// PERF-06: Replace 45+ if/else chain with a O(1) Map lookup.
// Previously every formatCity() call iterated through all branches in the worst case.
// With a Map, the lookup is O(1) regardless of the number of entries.
const CITY_MAP = new Map<string, string>([
  ['merida', 'Mérida'],
  ['falcon', 'Falcón'],
  ['bolivar', 'Bolívar'],
  ['tachira', 'Táchira'],
  ['anzoategui', 'Anzoátegui'],
  ['guarico', 'Guárico'],
  ['portuguesa', 'Portuguesa'],
  ['nueva esparta', 'Nueva Esparta'],
  ['la guaira', 'La Guaira'],
  ['apure', 'Apure'],
  ['cojedes', 'Cojedes'],
  ['trujillo', 'Trujillo'],
  ['miranda', 'Miranda'],
  ['caracas', 'Caracas'],
  ['valencia', 'Valencia'],
  ['maracay', 'Maracay'],
  ['barquisimeto', 'Barquisimeto'],
  ['maracaibo', 'Maracaibo'],
  ['maturin', 'Maturín'],
  ['cumana', 'Cumaná'],
  ['tovar', 'Tovar'],
  ['bocono', 'Boconó'],
  ['tariba', 'Táriba'],
  ['socopo', 'Socopó'],
  ['san fernando', 'San Fernando de Apure'],
  ['san juan', 'San Juan de los Morros'],
  ['puerto ayacucho', 'Puerto Ayacucho'],
  ['puerto la cruz', 'Puerto La Cruz'],
  ['lecheria', 'Lechería'],
  ['el tigre', 'El Tigre'],
  ['la victoria', 'La Victoria'],
  ['ciudad bolivar', 'Ciudad Bolívar'],
  ['puerto ordaz', 'Puerto Ordaz'],
  ['san felix', 'San Félix'],
  ['puerto cabello', 'Puerto Cabello'],
  ['san diego', 'San Diego'],
  ['san carlos', 'San Carlos'],
  ['punto fijo', 'Punto Fijo'],
  ['valle de la pascua', 'Valle de la Pascua'],
  ['el vigia', 'El Vigía'],
  ['los teques', 'Los Teques'],
  ['punta de mata', 'Punta de Mata'],
  ['la asuncion', 'La Asunción'],
  ['san cristobal', 'San Cristóbal'],
  ['maiquetia', 'Maiquetía'],
  ['catia la mar', 'Catia La Mar'],
  ['san felipe', 'San Felipe'],
  ['yaritagua', 'Yaritagua'],
  ['chivacoa', 'Chivacoa'],
  ['ciudad ojeda', 'Ciudad Ojeda'],
]);

/** Formats a db-friendly city/state name (e.g. "puerto_la_cruz" -> "Puerto La Cruz", "merida" -> "Mérida") */
export function formatCity(val: string | null | undefined): string {
  if (!val) return '—';

  // Replace underscores with spaces and capitalize each word
  const formatted = val
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // O(1) lookup for special accent/format cases
  const lower = formatted.toLowerCase();
  return CITY_MAP.get(lower) ?? formatted;
}
