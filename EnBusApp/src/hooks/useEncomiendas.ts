import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/src/utils/supabase';

// N-01: Hook especializado para encomiendas con lógica "OR"
export function useEncomiendas(userId?: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Soporta "Para Mí" (receiver) o "Enviados" (sender)
    const { data: result, error } = await supabase
      .from('encomiendas')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching encomiendas:', error.message);
    } else if (result) {
      setData(result);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    if (!userId) {
      setLoading(false);
      return;
    }

    fetchData();

    // Suscripción Realtime (El backend filtrará mediante RLS o recibiremos todo y lo manejamos)
    const channelName = `realtime:encomiendas:${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(channelName);
    
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'encomiendas' },
        (payload) => {
          if (!isMounted) return;
          
          setData((current) => {
            if (payload.eventType === 'INSERT') {
              // Validar si pertenece a este usuario (por si RLS no filtra el broadcast)
              const newRec = payload.new as any;
              if (newRec.sender_id === userId || newRec.receiver_user_id === userId) {
                return [newRec, ...current];
              }
              return current;
            }
            if (payload.eventType === 'UPDATE') {
              return current.map(item => item.id === payload.new.id ? payload.new : item);
            }
            if (payload.eventType === 'DELETE') {
              return current.filter(item => item.id !== payload.old.id);
            }
            return current;
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [userId, fetchData]);

  return { data, loading, setData, refetch: fetchData };
}
