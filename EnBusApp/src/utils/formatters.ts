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

/** Formats a db-friendly city/state name (e.g. "puerto_la_cruz" -> "Puerto La Cruz", "merida" -> "Mérida") */
export function formatCity(val: string | null | undefined): string {
  if (!val) return '—';
  
  // Reemplazar guiones bajos con espacios y capitalizar cada palabra
  const formatted = val
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Mapear casos específicos que llevan acento o necesitan formato especial
  const lower = formatted.toLowerCase();
  if (lower === 'merida') return 'Mérida';
  if (lower === 'falcon') return 'Falcón';
  if (lower === 'bolivar') return 'Bolívar';
  if (lower === 'tachira') return 'Táchira';
  if (lower === 'anzoategui') return 'Anzoátegui';
  if (lower === 'guarico') return 'Guárico';
  if (lower === 'portuguesa') return 'Portuguesa';
  if (lower === 'nueva esparta') return 'Nueva Esparta';
  if (lower === 'la guaira') return 'La Guaira';
  if (lower === 'apure') return 'Apure';
  if (lower === 'cojedes') return 'Cojedes';
  if (lower === 'trujillo') return 'Trujillo';
  if (lower === 'miranda') return 'Miranda';
  if (lower === 'caracas') return 'Caracas';
  if (lower === 'valencia') return 'Valencia';
  if (lower === 'maracay') return 'Maracay';
  if (lower === 'barquisimeto') return 'Barquisimeto';
  if (lower === 'maracaibo') return 'Maracaibo';
  if (lower === 'maturin') return 'Maturín';
  if (lower === 'cumana') return 'Cumaná';
  if (lower === 'tovar') return 'Tovar';
  if (lower === 'bocono') return 'Boconó';
  if (lower === 'tariba') return 'Táriba';
  if (lower === 'socopo') return 'Socopó';
  if (lower === 'san fernando') return 'San Fernando de Apure';
  if (lower === 'san juan') return 'San Juan de los Morros';
  if (lower === 'puerto ayacucho') return 'Puerto Ayacucho';
  if (lower === 'puerto la cruz') return 'Puerto La Cruz';
  if (lower === 'lecheria') return 'Lechería';
  if (lower === 'el tigre') return 'El Tigre';
  if (lower === 'la victoria') return 'La Victoria';
  if (lower === 'ciudad bolivar') return 'Ciudad Bolívar';
  if (lower === 'puerto ordaz') return 'Puerto Ordaz';
  if (lower === 'san felix') return 'San Félix';
  if (lower === 'puerto cabello') return 'Puerto Cabello';
  if (lower === 'san diego') return 'San Diego';
  if (lower === 'san carlos') return 'San Carlos';
  if (lower === 'punto fijo') return 'Punto Fijo';
  if (lower === 'valle de la pascua') return 'Valle de la Pascua';
  if (lower === 'el vigia') return 'El Vigía';
  if (lower === 'los teques') return 'Los Teques';
  if (lower === 'punta de mata') return 'Punta de Mata';
  if (lower === 'la asuncion') return 'La Asunción';
  if (lower === 'san cristobal') return 'San Cristóbal';
  if (lower === 'la guaira') return 'La Guaira';
  if (lower === 'maiquetia') return 'Maiquetía';
  if (lower === 'catia la mar') return 'Catia La Mar';
  if (lower === 'san felipe') return 'San Felipe';
  if (lower === 'yaritagua') return 'Yaritagua';
  if (lower === 'chivacoa') return 'Chivacoa';
  if (lower === 'ciudad ojeda') return 'Ciudad Ojeda';

  return formatted;
}
