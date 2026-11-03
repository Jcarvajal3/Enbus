/**
 * Button — every tappable action label in the app.
 *
 * Replaces ~12 bespoke button implementations that disagreed on height
 * (48 / 52 / 54), radius (pill vs 10), disabled treatment (opacity 0.5 vs a
 * hardcoded translucent fill) and label size. One component, one contract.
 *
 *   <Button size="lg" fullWidth icon={Ticket} onPress={…}>Buscar viaje</Button>   // primary
 *   <Button variant="secondary" size="md" onPress={…}>Ver detalle</Button>
 *   <Button variant="dangerGhost" onPress={pedirConfirmacion}>Cancelar reserva</Button>
 *   <Button variant="danger" onPress={cancelar}>Cancelar reserva</Button>          // solo en la confirmación
 *
 * Reglas (§2.3, D1): la acción principal es amarilla con texto `ink` (una por
 * pantalla; `lg` en pantalla y `FloatingBar`, `md` en tarjetas y vacíos).
 * `danger` (relleno `dangerText` + blanco) solo confirma; `dangerGhost` abre la
 * confirmación. Deshabilitado = relleno `surfaceDark` + texto `mutedForeground`,
 * sin opacidad. Etiqueta ≤ 3 palabras.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';
import type { IconProps } from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import { Colors, Motion, Radius, Sizes, Spacing, type FontSizeToken } from '@/src/theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'dangerGhost'
  /** @deprecated D25 → `primary` */
  | 'accent'
  /** @deprecated D25 → `primary` (texto blanco sobre amarillo→coral no llega a AA) */
  | 'gradient'
  /** @deprecated D25 → `dangerGhost` */
  | 'dangerSoft';

export type ButtonSize = 'sm' | 'md' | 'lg';

type PhosphorIcon = React.ComponentType<IconProps>;

export interface ButtonProps {
  children: string;
  onPress?: () => void;
  /** Por defecto `primary`. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon */
  icon?: PhosphorIcon;
  /** Trailing icon */
  iconRight?: PhosphorIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  /** @deprecated D25: ya no hace nada (la sombra de color se retiró). */
  glow?: boolean;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

type VarianteReal = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerGhost';

/** Las variantes retiradas se pintan como su sustituta (D25). */
const ALIAS: Record<ButtonVariant, VarianteReal> = {
  primary: 'primary',
  secondary: 'secondary',
  outline: 'outline',
  ghost: 'ghost',
  danger: 'danger',
  dangerGhost: 'dangerGhost',
  accent: 'primary',
  gradient: 'primary',
  dangerSoft: 'dangerGhost',
};

interface VariantSpec {
  background: string;
  foreground: string;
  border?: string;
}

const VARIANTS: Record<VarianteReal, VariantSpec> = {
  // Amarillo + tinta: 10,5:1.
  primary: { background: Colors.primary, foreground: Colors.primaryForeground },
  secondary: { background: Colors.surface, foreground: Colors.foreground },
  outline: {
    background: Colors.background,
    foreground: Colors.foreground,
    border: Colors.borderStrong,
  },
  ghost: { background: Colors.transparent, foreground: Colors.foreground },
  // Blanco sobre rojo oscuro: 6,5:1 (SY-24).
  danger: { background: Colors.dangerText, foreground: Colors.white },
  dangerGhost: { background: Colors.transparent, foreground: Colors.dangerText },
};

/** Deshabilitado: el mismo para todas las variantes que tienen relleno. */
const DISABLED: VariantSpec = {
  background: Colors.surfaceDark,
  foreground: Colors.mutedForeground,
};

const SIZES: Record<ButtonSize, { height: number; paddingX: number; text: FontSizeToken; icon: number }> = {
  sm: { height: Sizes.control.sm, paddingX: Spacing.lg, text: 'sm', icon: Sizes.icon.sm },
  md: { height: Sizes.control.md, paddingX: Spacing.xl, text: 'base', icon: Sizes.icon.md },
  lg: { height: Sizes.control.lg, paddingX: Spacing['2xl'], text: 'base', icon: Sizes.icon.lg },
};

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = true,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const real = ALIAS[variant];
  const base = VARIANTS[real];
  const dims = SIZES[size];
  const isInert = disabled || loading;
  // Mientras carga se conserva el color (la acción está en curso, no prohibida).
  const sinRelleno = real === 'ghost' || real === 'dangerGhost';
  const spec: VariantSpec = disabled
    ? sinRelleno
      ? { ...base, foreground: Colors.mutedForeground }
      : DISABLED
    : base;

  const shell: ViewStyle = {
    height: dims.height,
    paddingHorizontal: dims.paddingX,
    borderRadius: Radius.full,
    backgroundColor: spec.background,
    borderWidth: spec.border ? Sizes.hairline : 0,
    borderColor: spec.border,
    width: fullWidth ? '100%' : undefined,
  };

  return (
    <PressableScale
      onPress={onPress}
      disabled={isInert}
      dimWhenDisabled={false}
      haptic={haptic && !isInert}
      hapticType="medium"
      scaleValue={Motion.press.button}
      style={[s.shell, shell, ...(Array.isArray(style) ? style : [style])]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: isInert, busy: loading }}
    >
      <View style={s.row}>
        {loading ? (
          <ActivityIndicator size="small" color={spec.foreground} />
        ) : (
          <>
            {Icon && <Icon size={dims.icon} color={spec.foreground} weight="bold" />}
            <Text variant="button" size={dims.text} color={spec.foreground} compact>
              {children}
            </Text>
            {IconRight && <IconRight size={dims.icon} color={spec.foreground} weight="bold" />}
          </>
        )}
      </View>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
});
