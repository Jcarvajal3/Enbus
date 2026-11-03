import React, { memo } from 'react';
import { EntityCard, StatusBadge } from '@/src/components/ui';
import { getEstadoVisual } from '@/src/utils/estados';

export type TransactionType = 'encomienda_envio' | 'encomienda_recepcion' | 'boleto';

interface TransactionCardProps {
  type: TransactionType;
  /** Código que se muestra arriba a la derecha (BOL-…, EB-…) */
  id: string;
  /** Estado del dominio (para boletos, el estado que ve el usuario o REEMBOLSO_*) */
  estado: string;
  titulo: string;
  subtitulo: string;
  onPress?: () => void;
}

const NOMBRE: Record<TransactionType, string> = {
  boleto: 'Boleto',
  encomienda_envio: 'Encomienda enviada',
  // Mismo nombre que el segmento y la ceja del detalle (§2.1: "Enviadas | Para mí").
  encomienda_recepcion: 'Encomienda para mí',
};

/**
 * Fila de "Mis boletos" y "Mis encomiendas", dibujada con `EntityCard` (AU-21):
 * insignia del estado + código, título (la ruta), subtítulo (la salida o la
 * fecha, hasta 2 líneas) y flecha (AN-33). Sin icono: era el mismo en todas
 * las filas y no distinguía nada (AU-31).
 */
export const TransactionCard = memo(function TransactionCard({
  type,
  id,
  estado,
  titulo,
  subtitulo,
  onPress,
}: TransactionCardProps) {
  const dominio = type === 'boleto' ? 'boleto' : 'encomienda';
  const estadoLabel = getEstadoVisual(dominio, estado).label;

  return (
    <EntityCard
      badge={<StatusBadge dominio={dominio} estado={estado} />}
      meta={id}
      title={titulo}
      // Hasta 2 líneas: "Asiento 14 · Sale vie. 4 oct. · 8:30 a. m." no cabe en 360 pt.
      subtitle={subtitulo || undefined}
      subtitleLines={2}
      onPress={onPress}
      accessibilityLabel={`${NOMBRE[type]}. ${titulo}. ${subtitulo}. Estado: ${estadoLabel}. Código ${id}`}
    />
  );
});
