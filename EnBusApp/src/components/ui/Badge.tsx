/**
 * Badge / StatusBadge / Chip / CountPill — the small pills.
 *
 * `StatusBadge` is the only correct way to show an `estado`: it resolves the label
 * through `getEstadoVisual` and the colour through `StatusPalette`, so a new backend
 * state can never render as an unstyled raw enum string again.
 *
 * Insignias: punto de color + etiqueta 12 pt semibold sobre el tinte del tono. El
 * punto hace que el estado se lea de un vistazo, también en una lista larga.
 *
 * Selección: `Chip` elegido y `CountPill` activa en `accentStrong` con texto blanco;
 * chip sin elegir = blanco o pozo, sin competir con el contenido.
 */
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import type { IconProps } from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing, StatusPalette, type StatusTone } from '@/src/theme';
import { getEstadoVisual, type EstadoDominio } from '@/src/utils/estados';

export interface BadgeProps {
  children: string;
  tone?: StatusTone;
  size?: 'sm' | 'md';
  /** Dibuja el borde del tono (el tono `neutral` siempre lo lleva). */
  bordered?: boolean;
  style?: ViewStyle;
}

export function Badge({ children, tone = 'neutral', size = 'sm', bordered, style }: BadgeProps) {
  const colors = StatusPalette[tone];
  const conBorde = bordered || tone === 'neutral';

  return (
    <View
      style={[
        s.badge,
        size === 'sm' ? s.badgeSm : s.badgeMd,
        {
          backgroundColor: colors.bg,
          borderWidth: conBorde ? Sizes.hairline : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <View style={[s.punto, { backgroundColor: colors.fg }]} />
      {/* Texto oscuro del tono sobre su tinte: ≥ 4,5:1 (WCAG AA). */}
      <Text variant="caption" size="badge" weight="semibold" color={colors.text} compact numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

// ─── Status badge ────────────────────────────────────────────────────────────

export function StatusBadge({
  dominio,
  estado,
  size = 'sm',
  bordered,
  style,
}: {
  dominio: EstadoDominio;
  estado?: string | null;
  size?: 'sm' | 'md';
  bordered?: boolean;
  style?: ViewStyle;
}) {
  const visual = getEstadoVisual(dominio, estado);
  return (
    <Badge tone={visual.tone} size={size} bordered={bordered} style={style}>
      {visual.label}
    </Badge>
  );
}

// ─── Count pill ──────────────────────────────────────────────────────────────

/** Small numeric counter shown next to a tab or section title. */
export function CountPill({ value, active }: { value: number; active?: boolean }) {
  if (value <= 0) return null;
  return (
    <View style={[s.count, active && s.countActive]}>
      <Text
        variant="caption"
        size="micro"
        weight="bold"
        color={active ? 'inverse' : 'foreground'}
        compact
      >
        {value > 99 ? '99+' : String(value)}
      </Text>
    </View>
  );
}

// ─── Selectable chip ─────────────────────────────────────────────────────────

/** Filter pill (cooperativa, sort order, date shortcut). Selected = solid `accentStrong`. */
export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
  fullWidth,
  sobre = 'background',
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ComponentType<IconProps>;
  fullWidth?: boolean;
  /**
   * Fondo sobre el que va el chip: dentro de algo blanco (por defecto) el chip sin
   * elegir es `surface`; sobre `canvas` o dentro de un pozo, blanco.
   */
  sobre?: 'background' | 'surface';
  /** Cuando `label` solo no basta, p. ej. "Asiento 14, Soy yo" o "Categoría: Pago" */
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.chip}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        s.chip,
        selected ? s.chipSelected : sobre === 'surface' ? s.chipIdleOnSurface : s.chipIdle,
        fullWidth ? s.chipFull : null,
      ]}
    >
      {Icon && (
        <Icon
          size={Sizes.icon.sm}
          color={selected ? Colors.accentStrongForeground : Colors.foreground}
          weight="bold"
        />
      )}
      <Text variant="label" weight={selected ? 'semibold' : 'medium'} color={selected ? 'inverse' : 'foreground'} compact>
        {label}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs + Sizes.hairline,
    borderRadius: Radius.full,
  },
  badgeSm: {
    minHeight: Sizes.badge.sm,
    paddingHorizontal: Spacing.sm + Spacing.xs / 2,
  },
  badgeMd: {
    minHeight: Sizes.badge.md,
    paddingHorizontal: Spacing.md,
  },
  punto: {
    width: Sizes.dot,
    height: Sizes.dot,
    borderRadius: Radius.full,
  },
  count: {
    minWidth: Sizes.counter,
    height: Sizes.counter,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: {
    backgroundColor: Colors.accentStrong,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: Sizes.control.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
  },
  chipFull: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  chipIdle: {
    backgroundColor: Colors.surface,
  },
  chipIdleOnSurface: {
    backgroundColor: Colors.background,
    ...Shadows.subtle,
  },
  chipSelected: {
    backgroundColor: Colors.accentStrong,
    ...Shadows.sky,
  },
});
