/**
 * useRecargaEnVivo — vuelve a leer una pantalla de detalle cuando su fila cambia
 * en la base (Realtime), sin que la persona tenga que deslizar para actualizar.
 *
 * - Escucha los UPDATE de `tabla` con `filtro` (`id=eq.<uuid>`) y llama a
 *   `recargar` una sola vez por ráfaga de cambios.
 * - Si el canal se vuelve a suscribir tras una caída del socket, o la app vuelve
 *   a primer plano, también recarga: esos cambios no llegaron por el canal.
 * - `filtro` null: no escucha nada (p. ej. mientras no hay id).
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/src/utils/supabase';

const ESPERA_MS = 400;

export function useRecargaEnVivo(
  tabla: string,
  filtro: string | null,
  recargar: () => unknown
): void {
  const recargarRef = useRef(recargar);
  useEffect(() => {
    recargarRef.current = recargar;
  }, [recargar]);

  useEffect(() => {
    if (!filtro) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pronto = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (vivo) void recargarRef.current();
      }, ESPERA_MS);
    };

    let suscritoAntes = false;
    const channel = supabase
      .channel(`rt:${tabla}:${filtro}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: tabla, filter: filtro }, pronto)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (suscritoAntes) pronto();
        suscritoAntes = true;
      });

    const appState = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') pronto();
    });

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [tabla, filtro]);
}
