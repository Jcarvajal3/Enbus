import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { useEncomiendas } from '@/src/hooks/useEncomiendas';
import { BOLETO_ESTADOS_ACTIVOS, isEncomiendaActiva } from '@/src/utils/estados';
import type { Encomienda } from '@/src/types';

interface ActivitySummary {
  /** Boletos reservados o pagados */
  boletosActivos: number;
  /** Encomiendas que aún no llegaron a un estado final */
  encomiendasActivas: number;
  /** Notificaciones sin leer (de las 50 más recientes): campana de `HeaderActions` */
  notificacionesSinLeer: number;
}

const VACIO: ActivitySummary = {
  boletosActivos: 0,
  encomiendasActivas: 0,
  notificacionesSinLeer: 0,
};

const ActivityContext = createContext<ActivitySummary>(VACIO);

export function useActivity() {
  return useContext(ActivityContext);
}

/**
 * Counts of in-flight boletos and encomiendas, and of unread notifications,
 * subscribed once for the whole tab group.
 *
 * The tab bar badges, the header bell (`HeaderActions`, in the three tabs) and
 * the home screen all need these numbers. Without a shared provider each would
 * open its own Realtime channel for the same rows, so the counts could also
 * disagree mid-update. The notifications channel used to live in Inicio; it
 * lives here now so the bell reads the same number in every tab.
 */
export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const { data: boletos } = useRealtime<{ id: string; estado: string }>(
    'boletos',
    'comprador_id',
    user?.id,
    'id, estado',
    { enabled: !!user?.id, limit: 30 }
  );

  const { data: encomiendas } = useEncomiendas(user?.id, {
    enabled: !!user?.id,
    limit: 30,
  });

  const { data: notificaciones } = useRealtime<{ id: string; leida: boolean }>(
    'notificaciones_usuario',
    'usuario_id',
    user?.id,
    'id, leida',
    { enabled: !!user?.id, limit: 50 }
  );

  const value = useMemo<ActivitySummary>(() => {
    if (!user) return VACIO;
    return {
      boletosActivos: (boletos ?? []).filter((b) =>
        (BOLETO_ESTADOS_ACTIVOS as readonly string[]).includes(b.estado)
      ).length,
      encomiendasActivas: (encomiendas ?? []).filter((e: Encomienda) =>
        isEncomiendaActiva(e.estado)
      ).length,
      notificacionesSinLeer: (notificaciones ?? []).filter((n) => !n.leida).length,
    };
  }, [user, boletos, encomiendas, notificaciones]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}
