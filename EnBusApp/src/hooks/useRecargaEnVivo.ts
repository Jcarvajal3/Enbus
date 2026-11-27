/**
 * useRecargaEnVivo — vuelve a leer una pantalla de detalle cuando su fila cambia
 * en la base (Realtime), sin que la persona tenga que deslizar para actualizar.
 *
 * - Escucha el canal privado del usuario (`usuario:<id>`, compartido con el resto
 *   de la app; ver `realtimeCanales`) y reacciona a los cambios de `tabla` cuya
 *   columna `campo` vale `valor` (p. ej. `id` del boleto, `compra_id` de la compra).
 *   Llama a `recargar` una sola vez por ráfaga de cambios.
 * - Si el canal se vuelve a unir (socket caído, app de vuelta en primer plano),
 *   también recarga: esos cambios no llegaron por el canal.
 * - `valor` null o sin sesión: no escucha nada (p. ej. mientras no hay id).
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { escucharUsuario, idDelCambio } from '@/src/utils/realtimeCanales';

const ESPERA_MS = 400;

export function useRecargaEnVivo(
  tabla: 'boletos' | 'encomiendas',
  campo: string,
  valor: string | null | undefined,
  recargar: () => unknown
): void {
  const { user } = useAuth();
  const usuarioId = user?.id;
  const recargarRef = useRef(recargar);
  useEffect(() => {
    recargarRef.current = recargar;
  }, [recargar]);

  useEffect(() => {
    if (!valor || !usuarioId) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pronto = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (vivo) void recargarRef.current();
      }, ESPERA_MS);
    };

    const dejarDeEscuchar = escucharUsuario(usuarioId, {
      alCambio: (cambio) => {
        if (cambio.tabla !== tabla) return;
        const coincide = campo === 'id'
          ? idDelCambio(cambio) === valor
          : cambio.nuevo?.[campo] === valor;
        if (coincide) pronto();
      },
      alReconectar: pronto,
    });

    const appState = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') pronto();
    });

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      appState.remove();
      dejarDeEscuchar();
    };
  }, [tabla, campo, valor, usuarioId]);
}
