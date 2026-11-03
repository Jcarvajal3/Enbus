/**
 * Text — the only way text is rendered in the app.
 *
 * Replaces ~270 hand-written `{ fontFamily: Typography.family, fontSize: 14,
 * fontWeight: '700', color: … }` blocks. A screen picks a *role* (`variant`)
 * and, when needed, overrides one axis (`size`, `weight`, `color`).
 *
 *   <Text variant="title">Mis boletos</Text>
 *   <Text variant="secondary" color="muted">Mérida → Caracas</Text>
 *   <Text variant="caption" color="muted">Total a pagar</Text>
 *   <TextLink onPress={…}>¿Olvidaste tu contraseña?</TextLink>
 */
import React, { useMemo } from 'react';
import { Text as RNText, StyleSheet, TextProps as RNTextProps, TextStyle } from 'react-native';
import { PressableScale } from '../PressableScale';
import {
  Colors,
  Motion,
  Sizes,
  Typography,
  type FontSizeToken,
  type FontWeightToken,
  type TextVariant,
} from '@/src/theme';

type TrackingToken = keyof typeof Typography.tracking;

/**
 * Text colours only. The vivid surface colours (`primary`, `secondary`,
 * `accent`, `success`, `warning`) fail WCAG contrast as text on white
 * (1.6–3.7:1), so they are not tokens here: use the `*Text` variants and
 * `link` (all ≥ 4.5:1 on white/surface).
 */
export type TextColorToken =
  | 'foreground'
  | 'muted'
  | 'primaryText'
  | 'successText'
  | 'warningText'
  | 'infoText'
  | 'link'
  | 'dangerText'
  | 'inverse'
  /** @deprecated D25 → `link` (el azul vivo no llega a 4,5:1 como texto) */
  | 'accent'
  /** @deprecated D25 → `foreground` (el coral no llega a 4,5:1 como texto) */
  | 'secondary'
  /** @deprecated D25 → `dangerText` */
  | 'danger';

const COLOR_MAP: Record<TextColorToken, string> = {
  foreground: Colors.foreground,
  muted: Colors.mutedForeground,
  primaryText: Colors.primaryText,
  successText: Colors.successText,
  warningText: Colors.warningText,
  infoText: Colors.infoText,
  link: Colors.link,
  dangerText: Colors.dangerText,
  inverse: Colors.white,
  // Alias D25: ya se pintan con el color legible.
  accent: Colors.link,
  secondary: Colors.foreground,
  danger: Colors.dangerText,
};

export interface TextProps extends RNTextProps {
  /** Named typographic role. Defaults to `body`. */
  variant?: TextVariant;
  /** Override the variant's size */
  size?: FontSizeToken;
  /** Override the variant's weight */
  weight?: FontWeightToken;
  /** Semantic colour token, or any raw colour string */
  color?: TextColorToken | (string & {});
  /** Override the variant's letter spacing */
  tracking?: TrackingToken;
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
  /** Drop the preset line height (for tightly packed single lines) */
  compact?: boolean;
}

function resolveColor(color?: TextProps['color']): string {
  if (!color) return Colors.foreground;
  return (COLOR_MAP as Record<string, string>)[color] ?? color;
}

export function Text({
  variant = 'body',
  size,
  weight,
  color,
  tracking,
  align,
  uppercase,
  compact,
  style,
  ...rest
}: TextProps) {
  const composed = useMemo<TextStyle>(() => {
    const preset = Typography.presets[variant];
    const sizeToken: FontSizeToken = size ?? (preset.size as FontSizeToken);
    const weightToken: FontWeightToken = weight ?? (preset.weight as FontWeightToken);
    const trackingToken: TrackingToken = tracking ?? (preset.tracking as TrackingToken);

    return {
      fontFamily: Typography.family,
      fontSize: Typography.sizes[sizeToken],
      fontWeight: Typography.weights[weightToken],
      lineHeight: compact ? undefined : Typography.lineHeights[sizeToken],
      letterSpacing: Typography.tracking[trackingToken],
      color: resolveColor(color),
      textAlign: align,
      textTransform: uppercase ? 'uppercase' : undefined,
    };
  }, [variant, size, weight, color, tracking, align, uppercase, compact]);

  return <RNText {...rest} style={[composed, style]} />;
}

Text.displayName = 'Text';

// ─── Text link ───────────────────────────────────────────────────────────────

/**
 * Enlace de texto ("¿Olvidaste tu contraseña?", "Copiar", "Ver detalle"):
 * `link` semibold y subrayado, con área táctil de 44 pt aunque el texto sea
 * pequeño. Es la única forma de pintar un enlace (D1).
 */
export function TextLink({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: string;
  onPress(): void;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.chip}
      style={textStyles.linkBox}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? children}
    >
      <Text variant="label" color="link" style={textStyles.link} compact>
        {children}
      </Text>
    </PressableScale>
  );
}

/**
 * Escape hatch for places that need the raw font declaration inside a
 * StyleSheet (e.g. `TextInput`), without repeating the family string.
 */
export const fontStyle = (
  size: FontSizeToken = 'base',
  weight: FontWeightToken = 'regular'
): TextStyle => ({
  fontFamily: Typography.family,
  fontSize: Typography.sizes[size],
  fontWeight: Typography.weights[weight],
});

export const textStyles = StyleSheet.create({
  /** Restores the family on third-party components that render raw strings */
  inherit: { fontFamily: Typography.family },
  link: { textDecorationLine: 'underline' },
  linkBox: {
    minHeight: Sizes.touchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
