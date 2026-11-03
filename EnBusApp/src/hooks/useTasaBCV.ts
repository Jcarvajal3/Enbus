/**
 * useTasaBCV – tasa oficial BCV (Bs por 1 USD) vigente.
 *
 * Fuente única: la RPC `fn_tasa_bcv_vigente` (tabla `tasas_bcv`, que alimenta
 * la edge function `actualizar-tasa-bcv` o el super admin a mano). Es la misma
 * tasa con la que el servidor cobra, así que lo que ve el usuario coincide con
 * lo que se le cobra.
 *
 * - Caché en memoria de 30 min compartida por todas las pantallas, con una sola
 *   consulta en vuelo a la vez.
 * - La última tasa conocida se guarda en AsyncStorage (`tasa_bcv:ultima`) para
 *   mostrar algo sin conexión, indicando de qué día es (APP-28).
 *
 * Uso:
 *   const { tasa, fecha, tasaRef, diasAntiguedad, loading, error, desactualizada } = useTasaBCV();
 *   <Monto usd={precio} tasa={tasaRef} />
 *
 * `desactualizada` = no se pudo consultar (se muestra la guardada) o la tasa
 * tiene 2 días o más. Para cobrar, el servidor exige una tasa de ≤ 4 días.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/utils/supabase';
import type { TasaRef } from '@/src/utils/dinero';
import type { TasaBCVVigente } from '@/src/types';

// ─── Cache en memoria (compartida entre instancias del hook) ──────────────────
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

interface TasaGuardada {
  tasa: number;
  /** Día de vigencia de la tasa, 'YYYY-MM-DD' */
  fecha: string;
  /** Origen de la tasa: la automática o 'manual' (cargada por el super admin) */
  fuente?: string;
}

let _cached: TasaGuardada | null = null;
let _cachedAt = 0;
/** Consulta en curso, para que varias pantallas no pidan la tasa a la vez. */
let _enVuelo: Promise<TasaGuardada | null> | null = null;

// ─── Persistencia ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'tasa_bcv:ultima';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

async function leerTasaGuardada(): Promise<TasaGuardada | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TasaGuardada>;
    if (
      typeof parsed.tasa !== 'number' ||
      !(parsed.tasa > 0) ||
      typeof parsed.fecha !== 'string' ||
      !FECHA_RE.test(parsed.fecha)
    ) {
      return null;
    }
    return { tasa: parsed.tasa, fecha: parsed.fecha, fuente: parsed.fuente };
  } catch {
    return null;
  }
}

// ─── Fechas (Venezuela es UTC-4 todo el año) ──────────────────────────────────
const OFFSET_CARACAS_MS = -4 * 60 * 60 * 1000;

/** Hoy en Caracas como 'YYYY-MM-DD', independiente de la zona del teléfono. */
function hoyCaracas(): string {
  return new Date(Date.now() + OFFSET_CARACAS_MS).toISOString().slice(0, 10);
}

/** Días entre la fecha de la tasa y hoy en Caracas (0 = de hoy). */
function diasDesde(fecha: string): number {
  const a = Date.parse(`${fecha}T00:00:00Z`);
  const b = Date.parse(`${hoyCaracas()}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// ─── Consulta ─────────────────────────────────────────────────────────────────
const ERROR_TASA = 'No pudimos consultar la tasa BCV.';
const SIN_TASA = 'Todavía no hay una tasa BCV registrada.';

/** Error controlado: no hay ninguna tasa en la base (no es un fallo de red). */
class SinTasaError extends Error {}

async function consultarTasa(): Promise<TasaGuardada | null> {
  const { data, error } = await supabase.rpc('fn_tasa_bcv_vigente').maybeSingle<TasaBCVVigente>();
  if (error) throw error;
  if (!data) throw new SinTasaError(SIN_TASA);
  const tasa = Number(data.tasa);
  const fecha = typeof data.fecha === 'string' ? data.fecha.slice(0, 10) : '';
  if (!(tasa > 0) || !FECHA_RE.test(fecha)) throw new Error('Tasa BCV inválida en la respuesta');

  const nueva: TasaGuardada = { tasa, fecha, fuente: data.fuente };
  _cached = nueva;
  _cachedAt = Date.now();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nueva)).catch(() => {});
  return nueva;
}

/** Una sola consulta en vuelo; las demás instancias esperan la misma promesa. */
function obtenerTasa(): Promise<TasaGuardada | null> {
  if (!_enVuelo) {
    _enVuelo = consultarTasa().finally(() => {
      _enVuelo = null;
    });
  }
  return _enVuelo;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface TasaBCVResult {
  /** Bs por 1 USD, o null si no hay ninguna tasa (ni guardada) */
  tasa: number | null;
  /** Día de vigencia de la tasa, 'YYYY-MM-DD' (formatéalo con `fechaTasaCorta` o `formatDateKey`) */
  fecha: string | null;
  /** `{ tasa, fecha }` listo para `formatMoney` / `<Monto tasa>`; null sin tasa */
  tasaRef: TasaRef | null;
  /** Días desde la fecha de la tasa hasta hoy en Caracas; null sin tasa */
  diasAntiguedad: number | null;
  loading: boolean;
  /** Mensaje para el usuario cuando no se pudo obtener la tasa */
  error: string | null;
  /** true si no se pudo actualizar (se muestra la guardada) o la tasa tiene ≥ 2 días */
  desactualizada: boolean;
  /** Fuerza una consulta nueva (ignora la caché) */
  recargar: () => void;
}

export function useTasaBCV(): TasaBCVResult {
  const [dato, setDato] = useState<TasaGuardada | null>(_cached);
  const [loading, setLoading] = useState<boolean>(
    _cached === null || Date.now() - _cachedAt >= CACHE_TTL_MS
  );
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const forzar = useRef(false);

  useEffect(() => {
    // Servir desde la caché si está fresca.
    if (!forzar.current && _cached !== null && Date.now() - _cachedAt < CACHE_TTL_MS) {
      setDato(_cached);
      setLoading(false);
      setError(null);
      return;
    }
    forzar.current = false;

    let cancelado = false;

    (async () => {
      setLoading(true);
      setError(null);

      // Mientras llega la red, mostrar la última tasa guardada (con su fecha).
      if (_cached === null) {
        const guardada = await leerTasaGuardada();
        if (guardada && !cancelado) {
          if (_cached === null) _cached = guardada; // _cachedAt = 0: se sigue consultando
          setDato(_cached);
        }
      }

      try {
        const nueva = await obtenerTasa();
        if (!cancelado) setDato(nueva);
      } catch (err: unknown) {
        if (__DEV__ && !(err instanceof SinTasaError)) {
          console.warn('[useTasaBCV] Error consultando la tasa BCV:', err);
        }
        if (!cancelado) {
          setError(err instanceof SinTasaError ? SIN_TASA : ERROR_TASA);
          // Si hay una tasa guardada, se sigue mostrando como respaldo.
          if (_cached !== null) setDato(_cached);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [intento]);

  const recargar = useCallback(() => {
    forzar.current = true;
    setIntento((n) => n + 1);
  }, []);

  const diasAntiguedad = dato ? diasDesde(dato.fecha) : null;

  return {
    tasa: dato?.tasa ?? null,
    fecha: dato?.fecha ?? null,
    tasaRef: dato ? { tasa: dato.tasa, fecha: dato.fecha } : null,
    diasAntiguedad,
    loading,
    error,
    desactualizada: error !== null || (diasAntiguedad !== null && diasAntiguedad >= 2),
    recargar,
  };
}
