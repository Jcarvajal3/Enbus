import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/utils/supabase';

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Generic hook that:
 * 1. Fetches initial data from `tableName` with an optional eq-filter.
 * 2. Opens a Supabase Realtime WebSocket for live INSERT/UPDATE/DELETE patches.
 * 3. Tears down the channel when `enabled = false` (screen out of focus) and
 *    re-establishes it when `enabled = true` again.
 *
 * Channel names are deterministic to avoid accumulating ephemeral channels.
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

  // Keep a stable ref so the WebSocket callback never closes over a stale setter.
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  useEffect(() => {
    // ── Guard: nothing to do if disabled or no filter value yet ──────────────
    if (!enabled) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // ── 1. Initial data fetch ─────────────────────────────────────────────────
    const fetchData = async () => {
      try {
        setLoading(true);

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
        if (isMounted) setData((result as T[]) ?? []);
      } catch (e: unknown) {
        if (isMounted) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    // ── 2. Realtime WebSocket ─────────────────────────────────────────────────
    // Deterministic name → same logical channel re-used across focus cycles.
    // Avoids accumulating hundreds of Math.random() channels.
    const channelName = filterColumn && filterValue
      ? `rt:${tableName}:${filterColumn}:${filterValue}`
      : `rt:${tableName}:all`;

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

          setDataRef.current((prev) => {
            if (payload.eventType === 'INSERT') {
              return [payload.new as T, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((item) =>
                item.id === (payload.new as T).id ? (payload.new as T) : item
              );
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter(
                (item) => item.id !== (payload.old as Partial<T>).id
              );
            }
            return prev;
          });
        }
      )
      .subscribe();

    // ── Cleanup: unsubscribe channel & cancel pending fetch ───────────────────
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  // Re-run only when these stable primitives change or enabled toggles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tableName, filterColumn, filterValue, limit]);

  return { data, loading, error, setData };
}
