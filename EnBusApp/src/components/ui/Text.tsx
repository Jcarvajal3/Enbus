/**
 * Text — the only way text is rendered in the app.
 *
 * Replaces ~270 hand-written `{ fontFamily: Typography.family, fontSize: 14,
 * fontWeight: '700', color: … }` blocks. A screen picks a *role* (`variant`)
 * and, when needed, overrides one axis (`size`, `weight`, `color`).
 *
 *   <Text variant="title">Mis Viajes</Text>
 *   <Text variant="secondary">Gestiona y consulta tus pasajes</Text>
 *   <Text variant="overline" color="muted">Total a pagar</Text>
 */
import React, { useMemo } from 'react';
import { Text as RNText, StyleSheet, TextProps as RNTextProps, TextStyle } from 'react-native';
import {
  Colors,
  Typography,
  type FontSizeToken,
  type FontWeightToken,
  type TextVariant,
} from '@/src/theme';

type TrackingToken = keyof typeof Typography.tracking;

/**
 * Text colours only. The vivid surface colours (`primary`, `success`,
 * `warning`) fail WCAG contrast as text on white (1.6–2.3:1), so they are not
 * tokens here: use the `*Text` variants (all ≥ 4.5:1 on white/surface).
 */
export type TextColorToken =
  | 'foreground'
  | 'muted'
  | 'primaryText'
  | 'secondary'
  | 'accent'
  | 'successText'
  | 'warningText'
  | 'infoText'
  | 'danger'
  | 'dangerText'
  | 'inverse';

const COLOR_MAP: Record<TextColorToken, string> = {
  foreground: Colors.foreground,
  muted: Colors.mutedForeground,
  primaryText: Colors.primaryText,
  secondary: Colors.secondary,
  accent: Colors.accent,
  successText: Colors.successText,
  warningText: Colors.warningText,
  infoText: Colors.infoText,
  danger: Colors.destructive,
  dangerText: Colors.dangerText,
  inverse: Colors.white,
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
});
