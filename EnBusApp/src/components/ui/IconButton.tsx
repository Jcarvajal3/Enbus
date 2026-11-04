/**
 * IconButton — circular icon-only control (back, close, notifications, edit).
 *
 * Guarantees a 44pt touch target even when the glyph is small.
 */
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import type { IconProps } from 'phosphor-react-native';
import { PressableScale } from '../PressableScale';
import { Text } from './Text';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

export type IconButtonVariant = 'plain' | 'surface' | 'raised' | 'tinted' | 'inverse';

export interface IconButtonProps {
  icon: React.ComponentType<IconProps>;
  onPress?: () => void;
  /** Required — icon-only controls are invisible to screen readers otherwise */
  label: string;
  variant?: IconButtonVariant;
  size?: 'md' | 'lg';
  iconWeight?: IconProps['weight'];
  /** Unread counter rendered as a corner badge */
  badgeCount?: number;
  disabled?: boolean;
  color?: string;
  style?: ViewStyle;
  children?: React.ReactNode;
}

const BACKGROUNDS: Record<IconButtonVariant, string> = {
  plain: Colors.transparent,
  surface: Colors.surface,
  /** Blanco con sombra: sobre `canvas` o la atmósfera (cabeceras). */
  raised: Colors.background,
  tinted: Colors.primaryLight,
  inverse: Colors.white,
};

export function IconButton({
  icon: Icon,
  onPress,
  label,
  variant = 'plain',
  size = 'lg',
  iconWeight = 'bold',
  badgeCount = 0,
  disabled,
  color,
  style,
  children,
}: IconButtonProps) {
  const box = size === 'lg' ? Sizes.touchTarget : Sizes.iconBox.md;
  const glyph = size === 'lg' ? Sizes.icon.lg : Sizes.icon.md;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.icon}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        s.base,
        { width: box, height: box, backgroundColor: BACKGROUNDS[variant] },
        variant === 'raised' || variant === 'inverse' ? Shadows.subtle : null,
        style,
      ]}
    >
      {children ?? <Icon size={glyph} color={color ?? Colors.foreground} weight={iconWeight} />}

      {badgeCount > 0 && (
        <View style={s.badge}>
          <Text variant="caption" size="micro" weight="bold" color="inverse" compact>
            {badgeCount > 9 ? '9+' : String(badgeCount)}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // Contador con aro blanco: se ve sobre cualquier fondo.
  badge: {
    position: 'absolute',
    top: -Spacing.xs / 2,
    right: -Spacing.xs / 2,
    minWidth: Sizes.counter,
    height: Sizes.counter,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.dangerText,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Sizes.borderStrong,
    borderColor: Colors.background,
  },
});
