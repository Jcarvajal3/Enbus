import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/src/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

/** T must have an `id` field so UPDATE/DELETE diffing is type-safe */
type WithId = { id: string | number };

interface UseRealtimeOptions {
  /**
   * When false, the fetch and WebSocket subscription are torn down immediately.
   * Set to false via `useFocusEffect` when the screen loses focus to save battery/network.
   * Defaults to true.
   */
  enabled?: boolean;
  /** Filas por página (la primera carga y cada `cargarMas`). Por defecto 50. */
  limit?: number;
}

/** Tope de filas que `cargarMas` puede llegar a pedir (máximo de PostgREST). */
const MAX_FILAS = 1000;
/** Al volver a primer plano tras este tiempo, se vuelve a leer la lista. */
const RECARGA_AL_VOLVER_MS = 30_000;

/** Resuelve las promesas de `refetch` que esperaban la recarga. */
function resolverPendientes(ref: { current: (() => void)[] }) {
  const pendientes = ref.current;
  ref.current = [];
  pendientes.forEach((resolve) => resolve());
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Generic hook that:
 * 1. Loads cached data from AsyncStorage for instant offline rendering.
 * 2. Fetches initial data from `tableName` and updates cache.
 * 3. Opens a Supabase Realtime WebSocket for live INSERT/UPDATE/DELETE patches.
 *
 * Race-condition-safe: cache and network fetch run SEQUENTIALLY inside a
 * single effect, guaranteeing that:
 *   - Cache is shown first for instant rendering
 *   - Fresh network data always overwrites stale cache (never the other way)
 *
 * La lectura y el canal Realtime van en efectos separados: una recarga
 * (pull-to-refresh, "Reintentar", `cargarMas`, un UPDATE con embeds) ya no
 * cierra y vuelve a abrir el canal, así no se pierden eventos en el hueco ni
 * se multiplica la carga del servidor de Realtime. Los eventos que se pierden
 * igual (teléfono en segundo plano, socket caído) se recuperan releyendo al
 * volver a primer plano y cuando el canal se vuelve a suscribir.
 */
export function useRealtime<T extends WithId>(
  tableName: string,
  filterColumn?: string,
  filterValue?: string,
  selectQuery: string = '*',
  { enabled = true, limit = 50 }: UseRealtimeOptions = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  /** Momento (ms) de la última lectura correcta de la red, para "Actualizado hace X". */
  const [actualizadoAt, setActualizadoAt] = useState<number | null>(null);
  /** La última lectura llenó la página: puede haber más filas (`cargarMas`). */
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);

  const cacheKey = `cache:${tableName}:${filterColumn || 'all'}:${filterValue || 'all'}:${limit}`;

  // Filas pedidas: `limit` y, con `cargarMas`, una página más cada vez. Vuelve a
  // `limit` cuando cambia la consulta (otra cuenta, otro filtro).
  const [paginado, setPaginado] = useState({ clave: cacheKey, filas: limit });
  const filas = paginado.clave === cacheKey ? paginado.filas : limit;

  // `refetch` se resuelve cuando termina la recarga (bien o con error), así un
  // "Reintentar" o un pull-to-refresh muestran la carga el tiempo real.
  const pendientesRef = useRef<(() => void)[]>([]);

  const refetch = useCallback((): Promise<void> => {
    if (!enabled) return Promise.resolve();
    return new Promise((resolve) => {
      pendientesRef.current.push(resolve);
      setRefreshCount((prev) => prev + 1);
    });
  }, [enabled]);

  const cargarMas = useCallback(() => {
    if (!enabled || !hayMas || cargandoMas || filas >= MAX_FILAS) return;
    setCargandoMas(true);
    setPaginado({ clave: cacheKey, filas: Math.min(filas + limit, MAX_FILAS) });
  }, [enabled, hayMas, cargandoMas, filas, limit, cacheKey]);

  // Keep a stable ref so the WebSocket callback never closes over a stale setter.
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  /** Clave cuya caché ya se mostró (se lee una sola vez por consulta). */
  const cacheLeidaRef = useRef<string | null>(null);
  /** Última lectura correcta de la red, para decidir si recargar al volver. */
  const ultimaLecturaRef = useRef(0);

  // ── Lectura: caché (solo la primera vez) → red, que siempre gana ────────────
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setCargandoMas(false);
      resolverPendientes(pendientesRef);
      return;
    }

    let isMounted = true;

    const initialize = async () => {
      // ── Paso 1: Cache ─── respuesta instantánea para el usuario ─────────────
      if (cacheLeidaRef.current !== cacheKey) {
        const primeraVez = cacheLeidaRef.current === null;
        cacheLeidaRef.current = cacheKey;
        // Otra consulta (p. ej. otra cuenta): nada de la anterior en pantalla.
        if (!primeraVez) {
          setData([]);
          setLoading(true);
        }
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached && isMounted) {
            setData(JSON.parse(cached));
            setLoading(false); // ocultar spinner inmediatamente si hay caché
          }
        } catch (err) {
          if (__DEV__) console.warn('[useRealtime] Error cargando cache local:', err);
        }
      }

      // ── Paso 2: Fetch de red ─── siempre posterior, siempre gana ────────────
      try {
        let query = supabase
          .from(tableName)
          .select(selectQuery)
          .order('created_at', { ascending: false })
          .limit(filas);

        if (filterColumn && filterValue) {
          query = query.eq(filterColumn, filterValue);
        }

        const { data: result, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        if (isMounted) {
          const fresh = (result as unknown as T[]) ?? [];
          setData(fresh);
          setError(null);
          setHayMas(fresh.length >= filas && filas < MAX_FILAS);
          ultimaLecturaRef.current = Date.now();
          setActualizadoAt(ultimaLecturaRef.current);

          // Persistir datos frescos en caché (solo si el array no está vacío)
          if (fresh.length > 0) {
            AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch((e) => {
              if (__DEV__) console.warn('[useRealtime] Error guardando cache local:', e);
            });
          }
        }
      } catch (e: unknown) {
        if (__DEV__) console.warn(`[useRealtime] Fetch fallido para ${tableName} (offline/error):`, e);
        // Si ya hay datos de cache, el usuario los ve — no bloquear UI con error
        if (isMounted) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (isMounted) {
          setLoading(false);
          setCargandoMas(false);
          // Si el efecto se reinició (otra recarga), la nueva ejecución resuelve.
          resolverPendientes(pendientesRef);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, [enabled, tableName, filterColumn, filterValue, selectQuery, filas, cacheKey, refreshCount]);

  // ── Realtime WebSocket (uno por consulta, no por recarga) ───────────────────
  useEffect(() => {
    if (!enabled) return;
    let isMounted = true;

    // Realtime entrega solo las columnas de la tabla, sin los embeds del select
    // (p. ej. `viajes(...)`, `pago:pagos!...(...)`). Si el select tiene embeds,
    // un UPDATE se mezcla sobre la fila existente (conserva los embeds) y, tras
    // una ráfaga de cambios, se vuelve a leer la lista completa una sola vez.
    const tieneEmbeds = selectQuery.includes('(');
    let recargaTimer: ReturnType<typeof setTimeout> | null = null;
    const programarRecarga = () => {
      if (recargaTimer) clearTimeout(recargaTimer);
      recargaTimer = setTimeout(() => {
        recargaTimer = null;
        if (isMounted) setRefreshCount((prev) => prev + 1);
      }, 400);
    };

    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channelName = filterColumn && filterValue
      ? `rt:${tableName}:${filterColumn}:${filterValue}:${uniqueId}`
      : `rt:${tableName}:all:${uniqueId}`;

    const realtimeFilter = filterColumn && filterValue
      ? `${filterColumn}=eq.${filterValue}`
      : undefined;

    let suscritoAntes = false;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: realtimeFilter,
        },
        (payload) => {
          if (!isMounted) return;

          if (tieneEmbeds && payload.eventType === 'INSERT') {
            // Una fila nueva sin embeds rompería la UI: se espera a la recarga.
            programarRecarga();
            return;
          }

          setDataRef.current((prev) => {
            let updatedList = prev;

            if (payload.eventType === 'INSERT') {
              const nueva = payload.new as T;
              updatedList = prev.some((item) => item.id === nueva.id) ? prev : [nueva, ...prev];
            } else if (payload.eventType === 'UPDATE') {
              updatedList = prev.map((item) =>
                item.id === (payload.new as T).id
                  ? tieneEmbeds
                    ? ({ ...item, ...(payload.new as Partial<T>) } as T)
                    : (payload.new as T)
                  : item
              );
            } else if (payload.eventType === 'DELETE') {
              updatedList = prev.filter(
                (item) => item.id !== (payload.old as Partial<T>).id
              );
            }

            // Persistir parche Realtime en caché
            if (updatedList !== prev && updatedList.length > 0) {
              AsyncStorage.setItem(cacheKey, JSON.stringify(updatedList)).catch(() => {});
            }

            return updatedList;
          });

          // Los embeds (viaje, pago…) pueden haber cambiado con la fila.
          if (tieneEmbeds && payload.eventType === 'UPDATE') programarRecarga();
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // Se volvió a suscribir tras una caída del socket: lo que cambió en el
        // hueco no llegó por el canal, así que se relee.
        if (suscritoAntes) programarRecarga();
        suscritoAntes = true;
      });

    // Volver a primer plano: en segundo plano el socket se duerme y los cambios
    // (pago aprobado, reserva vencida) no llegan.
    const appState = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;
      if (Date.now() - ultimaLecturaRef.current >= RECARGA_AL_VOLVER_MS) programarRecarga();
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      isMounted = false;
      if (recargaTimer) clearTimeout(recargaTimer);
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [enabled, tableName, filterColumn, filterValue, selectQuery, cacheKey]);

  // Al desmontar, nadie queda esperando una recarga que no llegará.
  useEffect(() => () => resolverPendientes(pendientesRef), []);

  return { data, loading, error, setData, refetch, actualizadoAt, hayMas, cargandoMas, cargarMas };
}
