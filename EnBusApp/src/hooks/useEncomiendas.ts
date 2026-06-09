import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/src/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type WithId = { id: string };

interface UseEncomiendasOptions {
  /**
   * When false, tears down the subscription and stops fetching.
   * Use with useFocusEffect to save battery when the screen isn't visible.
   */
  enabled?: boolean;
  limit?: number;
}

/**
 * Specialized hook for encomiendas that supports OR-filter (sender + receiver)
 * and focus-aware pause/resume lifecycle with local SWR offline caching.
 *
 * C5 Fix — Realtime subscription overhead:
 * Supabase Realtime does not support compound OR filters at the server level
 * (e.g. `sender_id=eq.X,receiver_user_id=eq.X`). To avoid broadcasting ALL
 * encomienda changes to every connected client, this hook uses TWO separate
 * channels, each with a single server-side equality filter:
 *   - Channel A: `sender_id=eq.${userId}`
 *   - Channel B: `receiver_user_id=eq.${userId}`
 *
 * Each channel only receives rows that match the filter at the Supabase
 * Realtime server, drastically reducing unnecessary WebSocket traffic in
 * production environments with many concurrent users.
 */
export function useEncomiendas(
  userId?: string,
  { enabled = true, limit = 30 }: UseEncomiendasOptions = {}
) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  const cacheKey = `cache:encomiendas_or:${userId || 'anon'}:${limit}`;

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const { data: result, error } = await supabase
        .from('encomiendas')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('[useEncomiendas] Error fetching encomiendas:', error.message);
      } else if (result) {
        setData(result);
        // Persist fresh data to cache
        if (result.length > 0) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(result)).catch((e) => {
            console.warn('[useEncomiendas] Error guardando cache:', e);
          });
        }
      }
    } catch (err) {
      console.warn('[useEncomiendas] Error in fetchData:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, limit, cacheKey]);

  // ── Efecto principal: cache secuencial → fetch → dos canales Realtime ───────
  //
  // La carga de cache y el fetch de red son SECUENCIALES para evitar la misma
  // race condition que en useRealtime. Se usan DOS canales Realtime en lugar
  // de uno sin filtro para reducir el tráfico WebSocket en producción (C5 Fix).
  useEffect(() => {
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const initialize = async () => {
      // ── Paso 1: Cache ─────────────────────────────────────────────────────
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          setData(JSON.parse(cached));
          setLoading(false);
        }
      } catch (err) {
        console.warn('[useEncomiendas] Error al cargar cache local:', err);
      }

      // ── Paso 2: Fetch de red ──────────────────────────────────────────────
      if (isMounted) {
        await fetchData();
      }
    };

    initialize();

    // ── Realtime: DOS canales con filtros de servidor individuales ────────────
    //
    // Un único canal sin filtro recibiría TODOS los cambios de la tabla.
    // Con dos canales, cada uno filtra en el servidor — sólo llegan al cliente
    // los eventos relevantes para este usuario.
    const makeRealtimeHandler = () => (payload: any) => {
      if (!isMounted) return;

      setDataRef.current((current) => {
        let updatedList = current;

        if (payload.eventType === 'INSERT') {
          const newRec = payload.new as any;
          // Guard de seguridad: solo añadir si el registro pertenece al usuario
          if (newRec.sender_id === userId || newRec.receiver_user_id === userId) {
            updatedList = [newRec, ...current];
          }
        } else if (payload.eventType === 'UPDATE') {
          updatedList = current.map((item) =>
            item.id === payload.new.id ? payload.new : item
          );
        } else if (payload.eventType === 'DELETE') {
          updatedList = current.filter((item) => item.id !== payload.old.id);
        }

        // Persistir parche en cache
        if (updatedList !== current && updatedList.length > 0) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(updatedList)).catch(() => {});
        }

        return updatedList;
      });
    };

    const uniqueId = Math.random().toString(36).substring(2, 9);

    // Canal A: encomiendas enviadas por este usuario
    const channelSender = supabase
      .channel(`rt:enc:sender:${userId}:${uniqueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'encomiendas',
          filter: `sender_id=eq.${userId}`,
        },
        makeRealtimeHandler()
      )
      .subscribe();

    // Canal B: encomiendas recibidas por este usuario
    const channelReceiver = supabase
      .channel(`rt:enc:receiver:${userId}:${uniqueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'encomiendas',
          filter: `receiver_user_id=eq.${userId}`,
        },
        makeRealtimeHandler()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channelSender);
      supabase.removeChannel(channelReceiver);
    };
  // fetchData is stable (useCallback), re-run only on enabled/userId change
  }, [enabled, userId, fetchData, cacheKey]);

  return { data, loading, setData, refetch: fetchData };
}
