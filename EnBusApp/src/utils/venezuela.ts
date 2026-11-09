// Localidades de Venezuela para el selector de ciudad (<LocationSelector />).
//
// El catálogo de estados y ciudades es el de shared/ve.ts (`ESTADOS_VE`, copiado en
// ./ve.generated.ts por shared/generar.mjs): el mismo con el que el panel crea rutas
// y sucursales. Para añadir una ciudad se edita shared/ve.ts, no este archivo.

import { ESTADOS_VE, ciudadVE, formatCiudad, normalizarCiudad } from './ve.generated';

/** Ciudad elegible, con nombres legibles: `{ estado: 'Barinas', ciudad: 'Socopó' }`. */
export type Localidad = {
  estado: string;
  ciudad: string;
};

/** Todas las ciudades del catálogo compartido, en el orden de `ESTADOS_VE`. */
export const VENEZUELA_LOCATIONS: Localidad[] = ESTADOS_VE.flatMap((e) =>
  e.ciudades.map((c) => ({ estado: e.nombre, ciudad: c.nombre }))
);

/**
 * Clave con la que la base guarda la ciudad: igual que `normalizar_localidad` (SQL)
 * y `normalizarCiudad` del panel. "Mérida" → "merida", "Puerto La Cruz" →
 * "puerto_la_cruz", "San Fernando de Apure" → "san_fernando", "San Juan de los
 * Morros" → "san_juan"; '' si está vacía.
 */
export function normalizeCityForDb(ciudad: string | null | undefined): string {
  return normalizarCiudad(ciudad);
}

/**
 * La localidad de una ciudad guardada en la base ("socopo", "Socopó"): la entrada
 * de `VENEZUELA_LOCATIONS` si está en el catálogo (misma referencia) o, si no, una
 * nueva con el nombre legible del dato (`estado` puede venir vacío). Así una ruta
 * activa con una ciudad fuera del catálogo se puede elegir igual.
 */
export function localidadDeDb(
  ciudad: string | null | undefined,
  estado?: string | null
): Localidad | null {
  const clave = normalizarCiudad(ciudad);
  if (!clave) return null;
  const enCatalogo = ciudadVE(clave, estado) ?? ciudadVE(clave);
  if (enCatalogo) {
    return (
      VENEZUELA_LOCATIONS.find(
        (l) => l.estado === enCatalogo.estado.nombre && l.ciudad === enCatalogo.ciudad.nombre
      ) ?? null
    );
  }
  return { estado: formatCiudad(estado), ciudad: formatCiudad(ciudad) };
}

/**
 * `base` más las localidades de `extra` cuya ciudad no está ya en la lista (misma
 * clave de `normalizeCityForDb`). Devuelve `base` (misma referencia) si no hay nada
 * que añadir.
 */
export function unirLocalidades(base: Localidad[], extra: Localidad[]): Localidad[] {
  const vistas = new Set(base.map((l) => normalizeCityForDb(l.ciudad)));
  const nuevas: Localidad[] = [];
  for (const l of extra) {
    const clave = normalizeCityForDb(l.ciudad);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    nuevas.push(l);
  }
  return nuevas.length ? [...base, ...nuevas] : base;
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
