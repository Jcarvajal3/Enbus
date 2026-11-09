/**
 * useCooperativas — las cooperativas aliadas (estado ACTIVA) con su logo, su
 * calificación y sus rutas activas; `useCooperativa(id)` añade sus sucursales.
 *
 *   const { data, loading, error, recargar } = useCooperativasAliadas();
 *   const { data: coop } = useCooperativa(id);
 *
 * Lee las tablas directamente: la RLS ya deja leer a cualquier usuario con sesión
 * `cooperativas` y `sucursales`, y de `rutas` solo las activas. Se piden solo las
 * columnas que la app muestra (nunca la comisión, el RIF ni los contactos internos).
 *
 * El listado se guarda en memoria mientras la app está abierta: "Cooperativas
 * aliadas" de Inicio y el buscador comparten la misma lectura y el buscador abre
 * sin esqueleto; al montarse vuelve a leer en segundo plano.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/utils/supabase';
import { formatCity } from '@/src/utils/formatters';
import { humanizeError } from '@/src/utils/errores';
import type {
  CooperativaAliada,
  CooperativaDetalle,
  RutaCooperativa,
  SucursalCooperativa,
} from '@/src/types';

const COLUMNAS_RUTA = 'id, ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje, activa';
const COLUMNAS_COOPERATIVA = `id, nombre, logo_url, calificacion_promedio, total_calificaciones,
  rutas ( ${COLUMNAS_RUTA} )`;
const COLUMNAS_SUCURSAL = 'id, nombre, ciudad, estado_geografico, direccion, telefono, horario, activa';

// ─── Utilidades ──────────────────────────────────────────────────────────────

const TILDES: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'a', É: 'e', Í: 'i', Ó: 'o', Ú: 'u', Ü: 'u', Ñ: 'n',
};

/** Clave de búsqueda: minúsculas, sin tildes y sin espacios repetidos ("Mérida" → "merida"). */
export function claveBusqueda(v: string | null | undefined): string {
  return (v ?? '')
    .replace(/[ÁÉÍÓÚÜÑáéíóúüñ]/g, (c) => TILDES[c] ?? c)
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

/** Ciudades que cubre (origen y destino de sus rutas), legibles y en orden alfabético. */
export function ciudadesDe(rutas: RutaCooperativa[]): string[] {
  const vistas = new Map<string, string>();
  for (const r of rutas) {
    for (const c of [r.ciudad_origen, r.ciudad_destino]) {
      const nombre = formatCity(c);
      if (nombre !== '—') vistas.set(claveBusqueda(nombre), nombre);
    }
  }
  return Array.from(vistas.values()).sort((a, b) => a.localeCompare(b, 'es'));
}

/** "Caracas, Mérida y Valencia" · "Caracas, Mérida, Valencia y 4 más" */
export function resumenCiudades(ciudades: string[], max = 3): string {
  if (ciudades.length === 0) return '';
  if (ciudades.length <= max) {
    return ciudades.length === 1
      ? ciudades[0]
      : `${ciudades.slice(0, -1).join(', ')} y ${ciudades[ciudades.length - 1]}`;
  }
  return `${ciudades.slice(0, max).join(', ')} y ${ciudades.length - max} más`;
}

/** El pasaje más barato de sus rutas (USD), o `null` si ninguna tiene precio. */
export function precioDesde(rutas: RutaCooperativa[]): number | null {
  const precios = rutas.map((r) => Number(r.precio_pasaje) || 0).filter((p) => p > 0);
  return precios.length > 0 ? Math.min(...precios) : null;
}

/** ¿La cooperativa coincide con lo que se busca? Por nombre o por una ciudad que cubre. */
export function coincideBusqueda(coop: CooperativaAliada, consulta: string): boolean {
  const q = claveBusqueda(consulta);
  if (!q) return true;
  if (claveBusqueda(coop.nombre).includes(q)) return true;
  return ciudadesDe(coop.rutas).some((c) => claveBusqueda(c).includes(q));
}

/** Mejor valoradas primero (con más opiniones ante empate); las nuevas al final. */
export function ordenPorCalificacion(a: CooperativaAliada, b: CooperativaAliada): number {
  return (
    b.calificacion_promedio - a.calificacion_promedio ||
    b.total_calificaciones - a.total_calificaciones ||
    a.nombre.localeCompare(b.nombre, 'es')
  );
}

type FilaRuta = RutaCooperativa & { activa?: boolean | null };
type FilaSucursal = SucursalCooperativa & { activa?: boolean | null };

interface FilaCooperativa {
  id: string;
  nombre: string | null;
  logo_url: string | null;
  calificacion_promedio: number | string | null;
  total_calificaciones: number | null;
  rutas?: FilaRuta[] | null;
  sucursales?: FilaSucursal[] | null;
}

const porRuta = (a: RutaCooperativa, b: RutaCooperativa) =>
  formatCity(a.ciudad_origen).localeCompare(formatCity(b.ciudad_origen), 'es') ||
  formatCity(a.ciudad_destino).localeCompare(formatCity(b.ciudad_destino), 'es');

function aCooperativa(f: FilaCooperativa): CooperativaAliada {
  return {
    id: f.id,
    nombre: (f.nombre ?? '').trim() || 'Cooperativa',
    logo_url: f.logo_url ?? null,
    calificacion_promedio: Number(f.calificacion_promedio) || 0,
    total_calificaciones: Number(f.total_calificaciones) || 0,
    // El personal de una cooperativa también ve sus rutas inactivas: se filtran aquí.
    rutas: (f.rutas ?? [])
      .filter((r) => r.activa !== false)
      .map(({ activa: _activa, ...r }) => r)
      .sort(porRuta),
  };
}

// ─── Lecturas ────────────────────────────────────────────────────────────────

export async function cargarCooperativasAliadas(): Promise<CooperativaAliada[]> {
  const { data, error } = await supabase
    .from('cooperativas')
    .select(COLUMNAS_COOPERATIVA)
    .eq('estado', 'ACTIVA')
    .eq('rutas.activa', true)
    .order('nombre', { ascending: true })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as FilaCooperativa[])
    .map(aCooperativa)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** `null` si no existe o ya no está ACTIVA. */
export async function cargarCooperativa(id: string): Promise<CooperativaDetalle | null> {
  const { data, error } = await supabase
    .from('cooperativas')
    .select(`${COLUMNAS_COOPERATIVA}, sucursales ( ${COLUMNAS_SUCURSAL} )`)
    .eq('id', id)
    .eq('estado', 'ACTIVA')
    .eq('rutas.activa', true)
    .eq('sucursales.activa', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const fila = data as unknown as FilaCooperativa;
  return {
    ...aCooperativa(fila),
    sucursales: (fila.sucursales ?? [])
      .filter((x) => x.activa !== false)
      .map(({ activa: _activa, ...x }) => x)
      .sort(
        (a, b) =>
          formatCity(a.ciudad).localeCompare(formatCity(b.ciudad), 'es') ||
          a.nombre.localeCompare(b.nombre, 'es')
      ),
  };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Última lectura buena del listado (memoria de la sesión de la app). */
let cacheListado: CooperativaAliada[] | null = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useCooperativasAliadas(): {
  data: CooperativaAliada[] | null;
  loading: boolean;
  /** Texto para el usuario si la última lectura falló; null si fue bien */
  error: string | null;
  recargar(): Promise<void>;
} {
  const [data, setData] = useState<CooperativaAliada[] | null>(cacheListado);
  const [loading, setLoading] = useState(cacheListado === null);
  const [error, setError] = useState<string | null>(null);
  const montadoRef = useRef(true);
  const turnoRef = useRef(0);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const recargar = useCallback(async () => {
    const turno = ++turnoRef.current;
    const vigente = () => montadoRef.current && turno === turnoRef.current;
    if (cacheListado === null) setLoading(true);
    try {
      const lista = await cargarCooperativasAliadas();
      cacheListado = lista;
      if (!vigente()) return;
      setData(lista);
      setError(null);
    } catch (err) {
      if (__DEV__) console.warn('[cooperativas] Error cargando el listado:', err);
      if (vigente()) setError(humanizeError(err, 'carga'));
    } finally {
      if (vigente()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { data, loading, error, recargar };
}

export function useCooperativa(id: string | undefined): {
  data: CooperativaDetalle | null;
  loading: boolean;
  error: string | null;
  /** No existe, el enlace es inválido o la cooperativa ya no está activa */
  noEncontrada: boolean;
  recargar(): Promise<void>;
} {
  const [data, setData] = useState<CooperativaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const montadoRef = useRef(true);
  const turnoRef = useRef(0);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const recargar = useCallback(async () => {
    const turno = ++turnoRef.current;
    const vigente = () => montadoRef.current && turno === turnoRef.current;
    if (!id || !UUID_RE.test(id)) {
      setNoEncontrada(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const coop = await cargarCooperativa(id);
      if (!vigente()) return;
      setData(coop);
      setNoEncontrada(coop === null);
    } catch (err) {
      if (__DEV__) console.warn('[cooperativas] Error cargando la cooperativa:', err);
      if (vigente()) setError(humanizeError(err, 'carga'));
    } finally {
      if (vigente()) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { data, loading, error, noEncontrada, recargar };
}
