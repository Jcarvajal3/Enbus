import { useEffect, useState } from 'react';
import { supabase } from '@/src/utils/supabase';

// Hook genérico para suscribirse a cambios de una tabla en Supabase y mantener estado
export function useRealtime<T>(
  tableName: string, 
  filterColumn?: string, 
  filterValue?: string,
  selectQuery: string = '*'
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | Error>(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        let query = supabase.from(tableName).select(selectQuery);
        
        if (filterColumn && filterValue) {
          query = query.eq(filterColumn, filterValue);
        }
        
        // Asumimos un orden por fecha decreciente por defecto si la tabla tiene created_at
        // Esto podría fallar si la Vista o Tabla no tiene created_at, por eso es un query simple.
        const { data: result, error: fetchError } = await query;
        
        if (fetchError) throw fetchError;
        
        if (isMounted) setData(result as T[]);
      } catch (e: any) {
        if (isMounted) setError(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    // Configurar Websocket
    let filter = undefined;
    if (filterColumn && filterValue) {
      filter = `${filterColumn}=eq.${filterValue}`;
    }

    // El nombre del canal debe ser único para evitar "cannot add callbacks after subscribe"
    const channelName = `realtime:${tableName}:${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(channelName);
    
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: filter
        },
        (payload) => {
          if (!isMounted) return;
          
          if (payload.eventType === 'INSERT') {
            setData(prev => [payload.new as T, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setData(prev => prev.map(item => 
              // @ts-ignore
              item.id === payload.new.id ? payload.new as T : item
            ));
          } else if (payload.eventType === 'DELETE') {
            setData(prev => prev.filter(item => 
              // @ts-ignore
              item.id !== payload.old.id
            ));
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [tableName, filterColumn, filterValue]);

  return { data, loading, error, setData }; // exponemos setData para muteo optimista
}
