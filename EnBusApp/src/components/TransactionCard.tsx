import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import { View, Text } from '@/tw';
import { Package, Ticket } from 'phosphor-react-native';
import { PressableScale } from './PressableScale';
import { Colors, Typography, Radius, Shadows, Spacing } from '@/src/theme';

export type TransactionType = 'encomienda_envio' | 'encomienda_recepcion' | 'boleto';

interface TransactionCardProps {
  type: TransactionType;
  id: string;
  estado: string;
  titulo: string;
  subtitulo: string;
  onPress?: () => void;
}

const getStatusBadge = (type: TransactionType, estado: string) => {
  let bgColor = 'rgba(138, 138, 138, 0.12)';
  let textColor: string = Colors.mutedForeground;

  if (type === 'boleto') {
    switch (estado) {
      case 'RESERVADO':
        bgColor = Colors.warningLight;
        textColor = Colors.warning;
        break;
      case 'PAGADO':
        bgColor = Colors.successLight;
        textColor = Colors.success;
        break;
      case 'USADO':
      case 'CANCELADO':
      case 'EXPIRADO':
        bgColor = 'rgba(138, 138, 138, 0.12)';
        textColor = Colors.mutedForeground;
        break;
    }
  } else {
    switch (estado) {
      case 'PENDIENTE_DE_ESCANEO':
      case 'EN_RECEPCION':
        bgColor = Colors.warningLight;
        textColor = Colors.warning;
        break;
      case 'POR_PAGAR':
      case 'DEVUELTA':
        bgColor = Colors.destructiveLight;
        textColor = Colors.destructive;
        break;
      case 'PAGADA':
      case 'EN_TRANSITO':
        bgColor = Colors.infoLight;
        textColor = Colors.info;
        break;
      case 'EN_OFICINA_DESTINO':
      case 'ENTREGADA':
        bgColor = Colors.successLight;
        textColor = Colors.success;
        break;
      case 'CANCELADA':
        bgColor = 'rgba(138, 138, 138, 0.12)';
        textColor = Colors.mutedForeground;
        break;
    }
  }

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>
        {estado.replace(/_/g, ' ')}
      </Text>
    </View>
  );
};

export const TransactionCard = memo(({ type, id, estado, titulo, subtitulo, onPress }: TransactionCardProps) => {
  let pillBg: string = Colors.accentLight;
  let pillTextColor: string = Colors.accent;
  let pillLetter = 'B';

  if (type === 'encomienda_envio') {
    pillBg = Colors.secondaryLight;
    pillTextColor = Colors.secondary;
    pillLetter = 'E';
  } else if (type === 'encomienda_recepcion') {
    pillBg = Colors.successLight;
    pillTextColor = Colors.success;
    pillLetter = 'R';
  }

  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      style={styles.cardContainer}
      accessibilityRole="button"
      accessibilityLabel={`Tarjeta de transacción: ${titulo}. Estado: ${estado.replace(/_/g, ' ')}`}
    >
      <View style={styles.card}>
        <View style={styles.leftContent}>
          <View style={styles.badgeRow}>
            {getStatusBadge(type, estado)}
            <Text style={styles.idText}>{id}</Text>
          </View>
          <Text style={styles.titulo} numberOfLines={2}>
            {titulo}
          </Text>
          <Text style={styles.subtitulo} numberOfLines={1}>
            {subtitulo}
          </Text>
        </View>
        <View style={[styles.rightPill, { backgroundColor: pillBg }]}>
          <Text style={[styles.rightPillText, { color: pillTextColor }]}>
            {pillLetter}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
});

TransactionCard.displayName = 'TransactionCard';

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: Spacing.md + 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  idText: {
    fontSize: Typography.sizes.xs - 1,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs - 1,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: Typography.sizes.xs - 2,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  titulo: {
    fontSize: Typography.sizes.lg - 1,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginTop: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  subtitulo: {
    fontSize: Typography.sizes.sm - 1,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
  },
  rightPill: {
    width: 50,
    height: 80,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.lg,
  },
  rightPillText: {
    fontSize: Typography.sizes['2xl'],
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
  },
});
