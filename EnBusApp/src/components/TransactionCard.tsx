import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Package, PaperPlaneTilt, Ticket, type IconProps } from 'phosphor-react-native';
import { PressableScale } from './PressableScale';
import { StatusBadge, Text } from '@/src/components/ui';
import { getEstadoVisual } from '@/src/utils/estados';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

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

/**
 * Icono neutro por tipo (APP-36): antes eran letras "B", "E" y "R" sobre
 * colores de estado, que no se entendían y competían con la insignia del estado.
 */
const TIPO: Record<TransactionType, { icon: React.ComponentType<IconProps>; nombre: string }> = {
  boleto: { icon: Ticket, nombre: 'Boleto' },
  encomienda_envio: { icon: PaperPlaneTilt, nombre: 'Encomienda enviada' },
  encomienda_recepcion: { icon: Package, nombre: 'Encomienda por recibir' },
};

/**
 * Fila de "Mis boletos" y "Mis encomiendas": icono del tipo, estado, código,
 * título (la ruta) y subtítulo (la salida o la fecha). El color lo pone solo
 * la insignia del estado (`getEstadoVisual`).
 */
export const TransactionCard = memo(function TransactionCard({
  type,
  id,
  estado,
  titulo,
  subtitulo,
  onPress,
}: TransactionCardProps) {
  const tipo = TIPO[type];
  const Icon = tipo.icon;
  const dominio = type === 'boleto' ? 'boleto' : 'encomienda';
  const estadoLabel = getEstadoVisual(dominio, estado).label;

  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      accessibilityRole="button"
      accessibilityLabel={`${tipo.nombre}. ${titulo}. ${subtitulo}. Estado: ${estadoLabel}. Código ${id}`}
      style={s.card}
    >
      <View style={s.icono}>
        <Icon size={Sizes.icon.lg} color={Colors.mutedForeground} weight="bold" />
      </View>

      <View style={s.body}>
        <View style={s.topRow}>
          <StatusBadge dominio={dominio} estado={estado} />
          <Text
            variant="caption"
            color="muted"
            weight="bold"
            uppercase
            compact
            numberOfLines={1}
            style={s.codigo}
          >
            {id}
          </Text>
        </View>

        <Text variant="subheading" numberOfLines={2} style={s.title}>
          {titulo}
        </Text>

        {subtitulo ? (
          // Hasta 2 líneas: "Asiento 14 · Sale vie. 04/10 · 8:30 a. m." no cabe en 360 pt.
          <Text variant="secondary" color="muted" numberOfLines={2}>
            {subtitulo}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
});

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  icono: {
    width: Sizes.iconBox.lg,
    height: Sizes.iconBox.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  codigo: {
    flexShrink: 1,
  },
  title: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
});
