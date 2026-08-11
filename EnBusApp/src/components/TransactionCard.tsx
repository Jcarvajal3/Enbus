import React, { memo } from 'react';
import { EntityCard, StatusBadge, type PillTone } from '@/src/components/ui';
import { getEstadoVisual } from '@/src/utils/estados';

export type TransactionType = 'encomienda_envio' | 'encomienda_recepcion' | 'boleto';

interface TransactionCardProps {
  type: TransactionType;
  id: string;
  estado: string;
  titulo: string;
  subtitulo: string;
  onPress?: () => void;
}

/** Right-hand pill: letter + tint identify the kind of transaction at a glance. */
const TYPE_MARK: Record<TransactionType, { letter: string; tone: PillTone }> = {
  boleto: { letter: 'B', tone: 'accent' },
  encomienda_envio: { letter: 'E', tone: 'brand' },
  encomienda_recepcion: { letter: 'R', tone: 'success' },
};

/**
 * Row shown in "Mis Viajes" and "Mis Paquetes".
 *
 * All of the layout now lives in `EntityCard` and all of the status colouring in
 * `getEstadoVisual` — this file only maps a transaction type onto those.
 */
export const TransactionCard = memo(function TransactionCard({
  type,
  id,
  estado,
  titulo,
  subtitulo,
  onPress,
}: TransactionCardProps) {
  const mark = TYPE_MARK[type];
  const dominio = type === 'boleto' ? 'boleto' : 'encomienda';
  const estadoLabel = getEstadoVisual(dominio, estado).label;

  return (
    <EntityCard
      title={titulo}
      subtitle={subtitulo}
      badge={<StatusBadge dominio={dominio} estado={estado} />}
      meta={id}
      initial={mark.letter}
      tone={mark.tone}
      onPress={onPress}
      accessibilityLabel={`${titulo}. Estado: ${estadoLabel}. Código ${id}`}
    />
  );
});
