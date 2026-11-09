/**
 * Búsquedas recientes de viaje (APP-15): las últimas rutas buscadas, guardadas
 * en el teléfono con AsyncStorage para la sección "Recientes" del selector de
 * ciudad.
 *
 * Nada de esto es crítico: ninguna función lanza. Si el almacenamiento falla o
 * trae algo ilegible, se comporta como si no hubiera recientes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { VENEZUELA_LOCATIONS, localidadDeDb, normalizeCityForDb, type Localidad } from './venezuela';

const CLAVE = 'enbus.busquedas_recientes.v1';
const MAX_BUSQUEDAS = 5;
const MAX_CIUDADES = 3;

export type BusquedaReciente = { origen: Localidad; destino: Localidad; at: number };

const claveCiudad = (l: Localidad) => normalizeCityForDb(l.ciudad);

/**
 * La entrada del catálogo con esa ciudad (misma referencia que usa el
 * selector), una reconstruida si no está en el catálogo, o `null` si el valor
 * guardado está vacío.
 */
function localidadValida(v: unknown): Localidad | null {
  if (!v || typeof v !== 'object') return null;
  const { estado, ciudad } = v as Record<string, unknown>;
  if (typeof estado !== 'string' || typeof ciudad !== 'string') return null;
  const clave = normalizeCityForDb(ciudad);
  // Fuera del catálogo (ciudad que solo viene de una ruta activa) se reconstruye
  // con `localidadDeDb` en vez de descartar la búsqueda.
  return (
    VENEZUELA_LOCATIONS.find((l) => l.estado === estado && claveCiudad(l) === clave) ??
    VENEZUELA_LOCATIONS.find((l) => claveCiudad(l) === clave) ??
    localidadDeDb(ciudad, estado)
  );
}

/** Hasta 5 búsquedas, la más reciente primero. */
export async function leerBusquedasRecientes(): Promise<BusquedaReciente[]> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    if (!crudo) return [];
    const lista: unknown = JSON.parse(crudo);
    if (!Array.isArray(lista)) return [];
    const validas: BusquedaReciente[] = [];
    for (const item of lista) {
      if (!item || typeof item !== 'object') continue;
      const { origen, destino, at } = item as Record<string, unknown>;
      const o = localidadValida(origen);
      const d = localidadValida(destino);
      if (!o || !d || claveCiudad(o) === claveCiudad(d)) continue;
      validas.push({ origen: o, destino: d, at: typeof at === 'number' ? at : 0 });
      if (validas.length >= MAX_BUSQUEDAS) break;
    }
    return validas;
  } catch {
    return [];
  }
}

/** Guarda la ruta al principio (sin repetirla). Ignora rutas inválidas o de una ciudad a sí misma. */
export async function guardarBusquedaReciente(origen: Localidad, destino: Localidad): Promise<void> {
  const o = localidadValida(origen);
  const d = localidadValida(destino);
  if (!o || !d || claveCiudad(o) === claveCiudad(d)) return;
  try {
    const anteriores = await leerBusquedasRecientes();
    const resto = anteriores.filter(
      (b) => !(claveCiudad(b.origen) === claveCiudad(o) && claveCiudad(b.destino) === claveCiudad(d))
    );
    const nuevas = [{ origen: o, destino: d, at: Date.now() }, ...resto].slice(0, MAX_BUSQUEDAS);
    await AsyncStorage.setItem(CLAVE, JSON.stringify(nuevas));
  } catch {
    // Sin almacenamiento la búsqueda funciona igual; solo no se recordará.
  }
}

/** Ciudades de las búsquedas recientes (origen y destino), sin repetir, máx. 3. */
export async function ciudadesRecientes(): Promise<Localidad[]> {
  const busquedas = await leerBusquedasRecientes();
  const vistas = new Set<string>();
  const ciudades: Localidad[] = [];
  for (const b of busquedas) {
    for (const l of [b.origen, b.destino]) {
      const clave = claveCiudad(l);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      ciudades.push(l);
      if (ciudades.length >= MAX_CIUDADES) return ciudades;
    }
  }
  return ciudades;
}
