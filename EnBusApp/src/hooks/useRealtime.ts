import { useEffect, useRef, useState } from 'react';
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
  /** Max rows to fetch. Defaults to 50. */
  limit?: number;
}

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
 * single useEffect, guaranteeing that:
 *   - Cache is shown first for instant rendering
 *   - Fresh network data always overwrites stale cache (never the other way)
 *
 * The previous implementation used two separate async Effects which could
 * race each other, causing stale cached data to overwrite fresh fetched data.
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

  // `refetch` se resuelve cuando termina la recarga (bien o con error), así un
  // "Reintentar" o un pull-to-refresh muestran la carga el tiempo real.
  const pendientesRef = useRef<(() => void)[]>([]);

  const refetch = (): Promise<void> => {
    if (!enabled) return Promise.resolve();
    return new Promise((resolve) => {
      pendientesRef.current.push(resolve);
      setRefreshCount((prev) => prev + 1);
    });
  };

  // Keep a stable ref so the WebSocket callback never closes over a stale setter.
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  const cacheKey = `cache:${tableName}:${filterColumn || 'all'}:${filterValue || 'all'}:${limit}`;

  // ── Efecto principal: inicialización secuencial (cache → fetch) + Realtime ──
  //
  // CRÍTICO — el orden garantizado es:
  //   await cache  → setData(cached)  ← render inmediato sin spinner
  //   await fetch  → setData(fresh)   ← dato más reciente, siempre gana
  //
  // Hacer estos pasos en efectos separados crea una race condition donde el
  // efecto de cache puede resolverse DESPUÉS del fetch y sobreescribir datos frescos.
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      resolverPendientes(pendientesRef);
      return;
    }

    let isMounted = true;

    const initialize = async () => {
      // ── Paso 1: Cache ─── respuesta instantánea para el usuario ─────────────
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          setData(JSON.parse(cached));
          setLoading(false); // ocultar spinner inmediatamente si hay caché
        }
      } catch (err) {
        console.warn('[useRealtime] Error cargando cache local:', err);
      }

      // ── Paso 2: Fetch de red ─── siempre posterior, siempre gana ────────────
      try {
        let query = supabase
          .from(tableName)
          .select(selectQuery)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (filterColumn && filterValue) {
          query = query.eq(filterColumn, filterValue);
        }

        const { data: result, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        if (isMounted) {
          const fresh = (result as unknown as T[]) ?? [];
          setData(fresh);
          setError(null);
          setActualizadoAt(Date.now());

          // Persistir datos frescos en caché (solo si el array no está vacío)
          if (fresh.length > 0) {
            AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch((e) => {
              console.warn('[useRealtime] Error guardando cache local:', e);
            });
          }
        }
      } catch (e: unknown) {
        console.warn(`[useRealtime] Fetch fallido para ${tableName} (offline/error):`, e);
        // Si ya hay datos de cache, el usuario los ve — no bloquear UI con error
        if (isMounted) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (isMounted) setLoading(false);
        // Si el efecto se reinició (otra recarga), la nueva ejecución resuelve.
        if (isMounted) resolverPendientes(pendientesRef);
      }
    };

    initialize();

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

    // ── Realtime WebSocket ────────────────────────────────────────────────────
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channelName = filterColumn && filterValue
      ? `rt:${tableName}:${filterColumn}:${filterValue}:${uniqueId}`
      : `rt:${tableName}:all:${uniqueId}`;

    const realtimeFilter = filterColumn && filterValue
      ? `${filterColumn}=eq.${filterValue}`
      : undefined;

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
              updatedList = [payload.new as T, ...prev];
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
      .subscribe();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      isMounted = false;
      if (recargaTimer) clearTimeout(recargaTimer);
      supabase.removeChannel(channel);
    };
  }, [enabled, tableName, filterColumn, filterValue, selectQuery, limit, cacheKey, refreshCount]);

  // Al desmontar, nadie queda esperando una recarga que no llegará.
  useEffect(() => () => resolverPendientes(pendientesRef), []);

  return { data, loading, error, setData, refetch, actualizadoAt };
}
