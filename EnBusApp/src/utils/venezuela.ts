// Catálogo estático reducido de Localidades de Venezuela
// Usado en <LocationSelector />

export type Localidad = {
  estado: string;
  ciudad: string;
};

export const VENEZUELA_LOCATIONS: Localidad[] = [
  { estado: 'Distrito Capital', ciudad: 'Caracas' },
  { estado: 'Carabobo', ciudad: 'Valencia' },
  { estado: 'Carabobo', ciudad: 'Puerto Cabello' },
  { estado: 'Aragua', ciudad: 'Maracay' },
  { estado: 'Aragua', ciudad: 'La Victoria' },
  { estado: 'Lara', ciudad: 'Barquisimeto' },
  { estado: 'Lara', ciudad: 'Carora' },
  { estado: 'Zulia', ciudad: 'Maracaibo' },
  { estado: 'Zulia', ciudad: 'Cabimas' },
  { estado: 'Zulia', ciudad: 'Ciudad Ojeda' },
  { estado: 'Anzoátegui', ciudad: 'Barcelona' },
  { estado: 'Anzoátegui', ciudad: 'Puerto La Cruz' },
  { estado: 'Anzoátegui', ciudad: 'El Tigre' },
  { estado: 'Bolívar', ciudad: 'Ciudad Guayana' },
  { estado: 'Bolívar', ciudad: 'Ciudad Bolívar' },
  { estado: 'Táchira', ciudad: 'San Cristóbal' },
  { estado: 'Táchira', ciudad: 'San Antonio del Táchira' },
  { estado: 'Mérida', ciudad: 'Mérida' },
  { estado: 'Mérida', ciudad: 'El Vigía' },
  { estado: 'Falcón', ciudad: 'Coro' },
  { estado: 'Falcón', ciudad: 'Punto Fijo' },
  { estado: 'Sucre', ciudad: 'Cumaná' },
  { estado: 'Sucre', ciudad: 'Carúpano' },
  { estado: 'Monagas', ciudad: 'Maturín' },
  { estado: 'Nueva Esparta', ciudad: 'Porlamar' },
  { estado: 'Nueva Esparta', ciudad: 'La Asunción' },
  { estado: 'Barinas', ciudad: 'Barinas' },
  { estado: 'Portuguesa', ciudad: 'Acarigua' },
  { estado: 'Portuguesa', ciudad: 'Guanare' },
  { estado: 'Guárico', ciudad: 'San Juan de los Morros' },
  { estado: 'Guárico', ciudad: 'Valle de la Pascua' },
  { estado: 'Apure', ciudad: 'San Fernando de Apure' },
  { estado: 'Cojedes', ciudad: 'San Carlos' },
  { estado: 'Yaracuy', ciudad: 'San Felipe' },
  { estado: 'Yaracuy', ciudad: 'Chivacoa' },
  { estado: 'Trujillo', ciudad: 'Valera' },
  { estado: 'Trujillo', ciudad: 'Trujillo' },
  { estado: 'La Guaira', ciudad: 'Maiquetía' },
  { estado: 'La Guaira', ciudad: 'Catia La Mar' },
  { estado: 'Miranda', ciudad: 'Los Teques' },
  { estado: 'Miranda', ciudad: 'Guatire' },
  { estado: 'Miranda', ciudad: 'Cúa' }
];

/**
 * Normalizes a display city name to its database-equivalent value.
 * e.g., "Mérida" -> "merida", "Puerto La Cruz" -> "puerto_la_cruz", "San Fernando de Apure" -> "san_fernando"
 */
export function normalizeCityForDb(ciudad: string | null | undefined): string {
  if (!ciudad) return '';
  const clean = ciudad.trim().toLowerCase();
  if (clean === 'san fernando de apure') return 'san_fernando';
  if (clean === 'san juan de los morros') return 'san_juan';
  return ciudad
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

const NOMBRES_POPULARES = [
  'Caracas',
  'Valencia',
  'Maracaibo',
  'Barquisimeto',
  'Maracay',
  'Mérida',
  'Puerto La Cruz',
  'San Cristóbal',
] as const;

/**
 * Ciudades más pedidas, en este orden, para la sección "Populares" del
 * selector (APP-15). Son las mismas entradas de `VENEZUELA_LOCATIONS` (misma
 * referencia), así que se comparan igual que cualquier otra.
 */
export const CIUDADES_POPULARES: Localidad[] = NOMBRES_POPULARES.map((ciudad) =>
  VENEZUELA_LOCATIONS.find((l) => l.ciudad === ciudad)
).filter((l): l is Localidad => !!l);
