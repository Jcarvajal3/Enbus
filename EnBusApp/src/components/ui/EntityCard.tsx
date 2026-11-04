/**
 * EntityCard — the list row used across the whole app.
 *
 * Lo principal manda: el icono en su cuadrito, el título grande (una ruta se pinta
 * "Caracas → Mérida" con su flecha) y el subtítulo; abajo, separados por una línea
 * fina, el estado y el código. Es la fila de "Mis boletos", "Mis encomiendas" y la
 * cooperativa del envío.
 *
 * Con `selectable`, tocar la tarjeta la elige (no avanza): elegida = borde azul de
 * 2 pt + `CheckCircle`.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowRight, CaretRight, CheckCircle, CircleIcon as Circle } from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

export interface EntityCardProps {
  title: string;
  subtitle?: string;
  /** Leading element of the footer row — usually a `<StatusBadge />` or `<Badge />` */
  badge?: React.ReactNode;
  /** Trailing element of the footer row — a code, a price, a seat count */
  meta?: React.ReactNode;
  /** Cuadrito con icono a la izquierda (`IconTile`) */
  leading?: React.ReactNode;
  /** Junto al subtítulo: una valoración, un dato breve */
  adorno?: React.ReactNode;
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

/** "Caracas → Mérida": el título de una ruta se dibuja con su flecha, no con un carácter. */
function TituloEntidad({ title }: { title: string }) {
  const partes = title.split(' → ');
  if (partes.length !== 2) {
    return (
      <Text variant="subheading" numberOfLines={2}>
        {title}
      </Text>
    );
  }
  return (
    <View style={s.ruta}>
      <Text variant="subheading" numberOfLines={1} style={s.rutaCiudad}>
        {partes[0]}
      </Text>
      <ArrowRight size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
      <Text variant="subheading" numberOfLines={1} style={s.rutaCiudad}>
        {partes[1]}
      </Text>
    </View>
  );
}

export const EntityCard = memo(function EntityCard({
  title,
  subtitle,
  badge,
  meta,
  leading,
  adorno,
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
      <View style={s.cuerpo}>
        {leading}
        <View style={s.textos}>
          <TituloEntidad title={title} />
          {subtitle ? (
            <Text variant="secondary" color="muted" numberOfLines={subtitleLines} style={s.subtitle}>
              {subtitle}
            </Text>
          ) : null}
          {adorno ? <View style={s.adorno}>{adorno}</View> : null}
        </View>

        {selectable ? (
          elegida ? (
            <CheckCircle size={Sizes.icon.lg} color={Colors.accentStrong} weight="fill" />
          ) : (
            <Circle size={Sizes.icon.lg} color={Colors.borderControl} weight="regular" />
          )
        ) : conFlecha ? (
          <CaretRight size={Sizes.icon.sm} color={Colors.placeholder} weight="bold" />
        ) : null}
      </View>

      {badge || meta ? (
        <View style={s.pie}>
          {badge ?? <View />}
          {typeof meta === 'string' ? (
            <Text variant="caption" weight="medium" color="muted" compact numberOfLines={1} tabular style={s.meta}>
              {meta}
            </Text>
          ) : (
            meta
          )}
        </View>
      ) : null}
    </PressableScale>
  );
});

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  // El borde conserva su ancho para que elegir no mueva el contenido.
  selectable: {
    borderWidth: Sizes.borderSelected,
    borderColor: Colors.card,
  },
  selected: {
    borderColor: Colors.accentStrong,
  },
  cuerpo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  textos: {
    flex: 1,
  },
  ruta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + Spacing.xs / 2,
  },
  rutaCiudad: {
    flexShrink: 1,
  },
  subtitle: {
    marginTop: Spacing.xs / 2,
  },
  adorno: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
  },
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
  },
  meta: {
    flexShrink: 1,
  },
});
