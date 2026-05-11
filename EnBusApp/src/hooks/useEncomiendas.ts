import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/src/utils/supabase';

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
 * and focus-aware pause/resume lifecycle.
 */
export function useEncomiendas(
  userId?: string,
  { enabled = true, limit = 30 }: UseEncomiendasOptions = {}
) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: result, error } = await supabase
      .from('encomiendas')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching encomiendas:', error.message);
    } else if (result) {
      setData(result);
    }
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => {
    // Guard: disabled or no user yet
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const run = async () => {
      await fetchData();
    };
    run();

    // Deterministic channel name — avoids channel proliferation from Math.random()
    const channelName = `rt:encomiendas:user:${userId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'encomiendas' },
        (payload) => {
          if (!isMounted) return;

          setDataRef.current((current) => {
            if (payload.eventType === 'INSERT') {
              const newRec = payload.new as any;
              // Guard: only add if this record belongs to the current user
              if (newRec.sender_id === userId || newRec.receiver_user_id === userId) {
                return [newRec, ...current];
              }
              return current;
            }
            if (payload.eventType === 'UPDATE') {
              return current.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            }
            if (payload.eventType === 'DELETE') {
              return current.filter((item) => item.id !== payload.old.id);
            }
            return current;
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  // fetchData is stable (useCallback), re-run only on enabled/userId change
  }, [enabled, userId, fetchData]);

  return { data, loading, setData, refetch: fetchData };
}
