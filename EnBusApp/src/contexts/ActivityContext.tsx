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
}

const ActivityContext = createContext<ActivitySummary>({
  boletosActivos: 0,
  encomiendasActivas: 0,
});

export function useActivity() {
  return useContext(ActivityContext);
}

/**
 * Counts of in-flight boletos and encomiendas, subscribed once for the whole
 * tab group.
 *
 * The tab bar badges and the home screen both need these numbers. Without a
 * shared provider each would open its own pair of Realtime channels for the
 * same rows, so the counts could also disagree mid-update.
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

  const value = useMemo<ActivitySummary>(() => {
    if (!user) return { boletosActivos: 0, encomiendasActivas: 0 };
    return {
      boletosActivos: (boletos ?? []).filter((b) =>
        (BOLETO_ESTADOS_ACTIVOS as readonly string[]).includes(b.estado)
      ).length,
      encomiendasActivas: (encomiendas ?? []).filter((e: Encomienda) =>
        isEncomiendaActiva(e.estado)
      ).length,
    };
  }, [user, boletos, encomiendas]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}
