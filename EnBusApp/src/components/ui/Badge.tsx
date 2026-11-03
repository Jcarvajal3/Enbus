/**
 * Badge / StatusBadge / Chip — the small tinted pills.
 *
 * `StatusBadge` is the only correct way to show an `estado`: it resolves the
 * label through `getEstadoVisual` and the colour through `StatusPalette`, so a
 * new backend state can never render as an unstyled raw enum string again.
 */
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import type { IconProps } from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import { Colors, Motion, Radius, Sizes, Spacing, StatusPalette, type StatusTone } from '@/src/theme';
import { getEstadoVisual, type EstadoDominio } from '@/src/utils/estados';

export interface BadgeProps {
  children: string;
  tone?: StatusTone;
  icon?: React.ComponentType<IconProps>;
  size?: 'sm' | 'md';
  bordered?: boolean;
  style?: ViewStyle;
}

export function Badge({ children, tone = 'neutral', icon: Icon, size = 'sm', bordered, style }: BadgeProps) {
  const colors = StatusPalette[tone];
  const isSm = size === 'sm';

  return (
    <View
      style={[
        s.badge,
        {
          backgroundColor: colors.bg,
          borderWidth: bordered ? Sizes.hairline : 0,
          borderColor: colors.border,
          paddingHorizontal: isSm ? Spacing.sm + 2 : Spacing.md,
          paddingVertical: isSm ? Spacing.xs - 1 : Spacing.xs + 1,
        },
        style,
      ]}
    >
      {Icon && <Icon size={Sizes.icon.xs} color={colors.text} weight="fill" />}
      {/* 11pt bold sentence case on the dark tone foreground — the badge is the
          main state signal, so it must pass WCAG AA (≥ 4.5:1) on its tint. */}
      <Text variant="caption" size="xs" weight="bold" color={colors.text} compact>
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
        size="xs"
        weight="bold"
        color={active ? 'inverse' : 'muted'}
        compact
      >
        {value > 99 ? '99+' : String(value)}
      </Text>
    </View>
  );
}

// ─── Selectable chip ─────────────────────────────────────────────────────────

/** Filter pill (cooperativa, sort order). Selected state is a solid accent fill. */
export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
  fullWidth,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ComponentType<IconProps>;
  fullWidth?: boolean;
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
      style={[s.chip, selected ? s.chipSelected : s.chipIdle, fullWidth ? s.chipFull : null]}
    >
      {Icon && (
        <Icon
          size={Sizes.icon.sm}
          color={selected ? Colors.white : Colors.mutedForeground}
          weight="bold"
        />
      )}
      <Text variant="label" color={selected ? 'inverse' : 'foreground'} weight="bold" compact>
        {label}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    borderRadius: Radius.full,
  },
  count: {
    minWidth: Spacing.lg + 2,
    height: Spacing.lg + 2,
    paddingHorizontal: Spacing.xs + 1,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: {
    backgroundColor: Colors.accent,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: Sizes.control.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
  },
  chipFull: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  chipIdle: {
    backgroundColor: Colors.white,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.accent,
    borderWidth: Sizes.hairline,
    borderColor: Colors.accent,
  },
});
