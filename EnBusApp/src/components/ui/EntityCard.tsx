/**
 * EntityCard — the list row used across the whole app.
 *
 * Anatomía única (AU-21): insignia + código arriba, título, subtítulo y, si la
 * fila abre algo, la flecha a la derecha (AN-33). Es la fila de "Mis boletos",
 * "Mis encomiendas", las salidas y la cooperativa del envío.
 *
 * Con `selectable`, tocar la tarjeta la elige (no avanza): elegida = borde
 * `accentStrong` de 2 pt + `CheckCircle` (D1).
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CaretRight, CheckCircle } from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';


export interface EntityCardProps {
  title: string;
  subtitle?: string;
  /** Leading element of the top row — usually a `<StatusBadge />` or `<Badge />` */
  badge?: React.ReactNode;
  /** Trailing element of the top row — a code, a price, a seat count */
  meta?: React.ReactNode;
  /**
   * Flecha a la derecha (la tarjeta abre otra pantalla). Por defecto, sí cuando
   * hay `onPress` y la tarjeta no es `selectable`.
   */
  chevron?: boolean;
  /** Líneas máximas del subtítulo (por defecto 1). */
  subtitleLines?: number;
  /** Tarjeta de opción: tocarla la elige */
  selectable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const EntityCard = memo(function EntityCard({
  title,
  subtitle,
  badge,
  meta,
  chevron,
  subtitleLines = 1,
  selectable = false,
  selected = false,
  onPress,
  accessibilityLabel,
}: EntityCardProps) {
  const conFlecha = chevron ?? (!!onPress && !selectable);
  const elegida = selectable && selected;

  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      accessibilityRole={selectable ? 'radio' : 'button'}
      accessibilityState={selectable ? { selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? `${title}${subtitle ? `. ${subtitle}` : ''}`}
      style={[s.card, selectable ? s.selectable : null, elegida ? s.selected : null]}
    >
      <View style={s.body}>
        {(badge || meta) && (
          <View style={s.topRow}>
            {badge ?? <View />}
            {typeof meta === 'string' ? (
              <Text variant="caption" color="muted" weight="semibold" compact numberOfLines={1} style={s.meta}>
                {meta}
              </Text>
            ) : (
              meta
            )}
          </View>
        )}

        <Text variant="subheading" numberOfLines={2} style={badge || meta ? s.titleBelow : null}>
          {title}
        </Text>

        {subtitle ? (
          <Text variant="secondary" color="muted" numberOfLines={subtitleLines} style={s.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {elegida ? (
        <View style={s.trailing}>
          <CheckCircle size={Sizes.icon.lg} color={Colors.accentStrong} weight="fill" />
        </View>
      ) : conFlecha ? (
        <View style={s.trailing}>
          <CaretRight size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />
        </View>
      ) : null}
    </PressableScale>
  );
});

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  // El borde existe siempre (transparente) para que elegir no mueva el contenido.
  selectable: {
    borderWidth: Sizes.borderSelected,
    borderColor: Colors.transparent,
  },
  selected: {
    backgroundColor: Colors.background,
    borderColor: Colors.accentStrong,
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
  meta: {
    flexShrink: 1,
  },
  titleBelow: {
    marginTop: Spacing.sm,
  },
  subtitle: {
    marginTop: Spacing.xs,
  },
  trailing: {
    marginLeft: Spacing.md,
  },
});
