import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { DownloadSimple, Ticket, UploadSimple } from 'phosphor-react-native';
import { EntityCard, IconTile, StatusBadge, Text } from '@/src/components/ui';
import { LogoCooperativa } from '@/src/components/LogoCooperativa';
import { getEstadoVisual } from '@/src/utils/estados';
import { Spacing } from '@/src/theme';

export type TransactionType = 'encomienda_envio' | 'encomienda_recepcion' | 'boleto';

interface TransactionCardProps {
  type: TransactionType;
  /** Código que se muestra abajo a la derecha (BOL-…, EB-…) */
  id: string;
  /** Estado del dominio (para boletos, el estado que ve el usuario o REEMBOLSO_*) */
  estado: string;
  titulo: string;
  subtitulo: string;
  /** La cooperativa que lleva el viaje o el paquete (su logo y su nombre bajo el subtítulo) */
  cooperativa?: { nombre?: string | null; logoUrl?: string | null } | null;
  onPress?: () => void;
}

const NOMBRE: Record<TransactionType, string> = {
  boleto: 'Boleto',
  encomienda_envio: 'Encomienda enviada',
  // Mismo nombre que el segmento y la ceja del detalle ("Enviadas | Para mí").
  encomienda_recepcion: 'Encomienda para mí',
};

const ICONO = {
  boleto: Ticket,
  encomienda_envio: UploadSimple,
  encomienda_recepcion: DownloadSimple,
} as const;

/**
 * Fila de "Mis boletos" y "Mis encomiendas", dibujada con `EntityCard`: el icono del
 * dominio teñido con el color del estado (una lista se escanea por color antes de
 * leerla), la ruta como título, la salida o la fecha, la cooperativa con su logo y
 * abajo el estado y el código.
 */
export const TransactionCard = memo(function TransactionCard({
  type,
  id,
  estado,
  titulo,
  subtitulo,
  cooperativa,
  onPress,
}: TransactionCardProps) {
  const dominio = type === 'boleto' ? 'boleto' : 'encomienda';
  const visual = getEstadoVisual(dominio, estado);
  const nombreCoop = cooperativa?.nombre?.trim() || '';

  return (
    <EntityCard
      leading={<IconTile icon={ICONO[type]} estado={visual.tone} />}
      badge={<StatusBadge dominio={dominio} estado={estado} />}
      meta={id}
      title={titulo}
      // Hasta 2 líneas: "Asiento 14 · Sale vie. 4 oct. · 8:30 a. m." no cabe en 360 pt.
      subtitle={subtitulo || undefined}
      subtitleLines={2}
      adorno={
        nombreCoop ? (
          <View style={s.cooperativa}>
            <LogoCooperativa nombre={nombreCoop} logoUrl={cooperativa?.logoUrl} size="sm" decorativo />
            <Text variant="caption" weight="medium" color="muted" compact numberOfLines={1} style={s.nombre}>
              {nombreCoop}
            </Text>
          </View>
        ) : undefined
      }
      onPress={onPress}
      accessibilityLabel={`${NOMBRE[type]}. ${titulo}. ${subtitulo}.${
        nombreCoop ? ` ${nombreCoop}.` : ''
      } Estado: ${visual.label}. Código ${id}`}
    />
  );
});

const s = StyleSheet.create({
  cooperativa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  nombre: {
    flexShrink: 1,
  },
});
