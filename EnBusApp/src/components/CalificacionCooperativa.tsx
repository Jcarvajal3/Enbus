/**
 * CalificacionCooperativa — estrella de marca + nota (+ cuántas opiniones). Sin
 * opiniones todavía, la insignia "Nueva": un 0,0 diría que es mala.
 *
 *   <CalificacionCooperativa valor={coop.calificacion_promedio} total={coop.total_calificaciones} />
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Star } from 'phosphor-react-native';
import { Badge, Text } from '@/src/components/ui';
import { formatNumeroVE } from '@/src/utils/dinero';
import { Colors, Sizes, Spacing } from '@/src/theme';

/** "4,6 (23 opiniones)" para el lector de pantalla y para las listas. */
export function textoCalificacion(valor: number, total?: number | null): string {
  if (!(valor > 0)) return 'Nueva, sin opiniones todavía';
  const nota = `${formatNumeroVE(valor, 1)} de 5`;
  if (!total) return nota;
  return `${nota}, ${total} ${total === 1 ? 'opinión' : 'opiniones'}`;
}

export function CalificacionCooperativa({
  valor,
  total,
  inverso = false,
}: {
  valor: number;
  total?: number | null;
  /** Sobre noche: texto blanco */
  inverso?: boolean;
}) {
  if (!(valor > 0)) return <Badge tone="neutral">Nueva</Badge>;
  return (
    <View
      style={s.fila}
      accessible
      accessibilityLabel={`Calificación ${textoCalificacion(valor, total)}`}
    >
      <Star size={Sizes.icon.sm} color={Colors.primaryDeep} weight="fill" />
      <Text variant="caption" weight="semibold" color={inverso ? 'inverse' : 'foreground'} compact tabular>
        {formatNumeroVE(valor, 1)}
      </Text>
      {total ? (
        <Text variant="caption" color={inverso ? 'inverseMuted' : 'muted'} compact numberOfLines={1}>
          {`(${total})`}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
