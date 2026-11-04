/**
 * Button — every tappable action label in the app.
 *
 *   <Button size="lg" fullWidth icon={Ticket} onPress={…}>Buscar viaje</Button>   // primary
 *   <Button variant="secondary" size="md" onPress={…}>Ver detalle</Button>
 *   <Button variant="dangerGhost" onPress={pedirConfirmacion}>Cancelar reserva</Button>
 *   <Button variant="danger" onPress={cancelar}>Cancelar reserva</Button>          // solo en la confirmación
 *
 * Reglas: la acción principal es el sol (gradiente amarillo con texto tinta y su
 * resplandor), una por pantalla; `lg` en pantalla y `FloatingBar`, `md` en tarjetas
 * y vacíos. `danger` solo confirma; `dangerGhost` abre la confirmación. Deshabilitado
 * = relleno `surfaceDark` + texto apagado, sin sombra ni opacidad. Etiqueta ≤ 3
 * palabras.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { IconProps } from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import { Colors, Gradients, Motion, Radius, Shadows, Sizes, Spacing, type FontSizeToken } from '@/src/theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'dangerGhost';

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
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

interface VariantSpec {
  background: string;
  foreground: string;
  border?: string;
  shadow?: ViewStyle;
}

const VARIANTS: Record<ButtonVariant, VariantSpec> = {
  primary: { background: Colors.primary, foreground: Colors.primaryForeground, shadow: Shadows.sun },
  // Blanco con relieve: pesa menos que el sol y se ve igual sobre fondo o tarjeta.
  secondary: {
    background: Colors.background,
    foreground: Colors.foreground,
    border: Colors.borderControl,
    shadow: Shadows.subtle,
  },
  outline: {
    background: Colors.background,
    foreground: Colors.foreground,
    border: Colors.borderControl,
  },
  ghost: { background: Colors.transparent, foreground: Colors.foreground },
  // Blanco sobre rojo oscuro: 6,5:1.
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
  lg: { height: Sizes.control.lg, paddingX: Spacing['2xl'], text: 'lg', icon: Sizes.icon.md },
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
  const base = VARIANTS[variant];
  const dims = SIZES[size];
  const isInert = disabled || loading;
  // Mientras carga se conserva el color (la acción está en curso, no prohibida).
  const sinRelleno = variant === 'ghost' || variant === 'dangerGhost';
  const spec: VariantSpec = disabled
    ? sinRelleno
      ? { ...base, foreground: Colors.mutedForeground }
      : DISABLED
    : base;
  const conSol = variant === 'primary' && !disabled;

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
      style={[s.shell, shell, spec.shadow ?? s.sinSombra, ...(Array.isArray(style) ? style : [style])]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: isInert, busy: loading }}
    >
      {conSol ? (
        <LinearGradient colors={[...Gradients.sun]} style={[StyleSheet.absoluteFill, s.relleno]} />
      ) : null}
      <View style={s.row}>
        {loading ? (
          <ActivityIndicator size="small" color={spec.foreground} />
        ) : (
          <>
            {Icon && <Icon size={dims.icon} color={spec.foreground} weight={conSol ? 'fill' : 'bold'} />}
            <Text
              variant="button"
              size={dims.text}
              color={spec.foreground}
              tracking={size === 'lg' ? 'snug' : 'normal'}
              numberOfLines={1}
              compact
            >
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
    borderCurve: 'continuous',
  },
  sinSombra: {},
  relleno: {
    borderRadius: Radius.full,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
});
