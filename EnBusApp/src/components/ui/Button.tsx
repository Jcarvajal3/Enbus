/**
 * Button — every tappable action label in the app.
 *
 * Replaces ~12 bespoke button implementations that disagreed on height
 * (48 / 52 / 54), radius (pill vs 10), disabled treatment (opacity 0.5 vs a
 * hardcoded translucent fill) and label size. One component, one contract.
 *
 *   <Button variant="accent" size="lg" fullWidth onPress={…}>Continuar</Button>
 *   <Button variant="gradient" icon={Bus} onPress={…}>Buscar Viaje</Button>
 *   <Button variant="dangerSoft" onPress={…}>Cancelar Reserva</Button>
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { IconProps } from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import {
  Colors,
  Gradients,
  Motion,
  Radius,
  Shadows,
  Sizes,
  Spacing,
  type FontSizeToken,
} from '@/src/theme';

export type ButtonVariant =
  | 'accent'
  | 'primary'
  | 'gradient'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'dangerSoft';

export type ButtonSize = 'sm' | 'md' | 'lg';

type PhosphorIcon = React.ComponentType<IconProps>;

export interface ButtonProps {
  children: string;
  onPress?: () => void;
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
  /** Adds a coloured glow — reserve it for the single primary action on screen */
  glow?: boolean;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

interface VariantSpec {
  background: string;
  foreground: string;
  border?: string;
  gradient?: readonly [string, string, ...string[]];
}

const VARIANTS: Record<ButtonVariant, VariantSpec> = {
  accent: { background: Colors.accent, foreground: Colors.accentForeground },
  primary: { background: Colors.primary, foreground: Colors.primaryForeground },
  gradient: {
    background: Colors.transparent,
    foreground: Colors.white,
    gradient: Gradients.warm,
  },
  secondary: { background: Colors.surface, foreground: Colors.foreground },
  outline: {
    background: Colors.white,
    foreground: Colors.foreground,
    border: Colors.border,
  },
  ghost: { background: Colors.transparent, foreground: Colors.foreground },
  danger: { background: Colors.destructive, foreground: Colors.white },
  dangerSoft: {
    background: Colors.destructiveSoft,
    foreground: Colors.destructive,
    border: Colors.destructiveBorder,
  },
};

const SIZES: Record<ButtonSize, { height: number; paddingX: number; text: FontSizeToken; icon: number }> = {
  sm: { height: Sizes.control.sm, paddingX: Spacing.lg, text: 'sm', icon: Sizes.icon.sm },
  md: { height: Sizes.control.md, paddingX: Spacing.xl, text: 'base', icon: Sizes.icon.md },
  lg: { height: Sizes.control.lg, paddingX: Spacing['2xl'], text: 'base', icon: Sizes.icon.lg },
};

export function Button({
  children,
  onPress,
  variant = 'accent',
  size = 'lg',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = true,
  glow = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const spec = VARIANTS[variant];
  const dims = SIZES[size];
  const isInert = disabled || loading;

  const shell: ViewStyle = {
    height: dims.height,
    paddingHorizontal: dims.paddingX,
    borderRadius: Radius.full,
    backgroundColor: spec.gradient ? Colors.transparent : spec.background,
    borderWidth: spec.border ? Sizes.hairline : 0,
    borderColor: spec.border,
    width: fullWidth ? '100%' : undefined,
    // The disabled treatment is uniform — `PressableScale` dims the whole
    // control — rather than a bespoke translucent fill per button.
  };

  const content = (
    <>
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
    </>
  );

  return (
    <PressableScale
      onPress={onPress}
      disabled={isInert}
      haptic={haptic && !isInert}
      hapticType="medium"
      scaleValue={Motion.press.button}
      style={[
        s.shell,
        shell,
        glow && !isInert ? Shadows.glow(spec.gradient ? Colors.secondary : spec.background) : null,
        ...(Array.isArray(style) ? style : [style]),
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: isInert, busy: loading }}
    >
      {spec.gradient ? (
        <LinearGradient
          colors={[...spec.gradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: Radius.full }]}
        />
      ) : null}
      <View style={s.row}>{content}</View>
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
    gap: Spacing.sm + 2,
  },
});
