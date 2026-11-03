/**
 * PressableScale — the app's touch feedback primitive.
 *
 * Architecture:
 *   Animated.Pressable (scale transform) → children
 *
 * Rules encoded here (so no caller has to re-derive them):
 *   - Scale factors come from `Motion.press`; nothing goes below 0.9.
 *   - Press-in uses `Motion.duration.fast`, release is faster — a slow release
 *     reads as lag.
 *   - Only `transform` animates: no layout property is touched, so the whole
 *     interaction stays on the UI thread.
 *   - Con "reducir movimiento" no hay escala: el toque solo da la vibración
 *     (si se pidió) y el resultado.
 */
import React from 'react';
import { Pressable as RNPressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Motion, Opacity, Sizes } from '@/src/theme';

interface PressableScaleProps {
  /** Minimum scale while pressed. Defaults to `Motion.press.button` (0.97). */
  scaleValue?: number;
  /** Press-in duration in ms. Defaults to `Motion.duration.fast`. */
  duration?: number;
  haptic?: boolean;
  hapticType?: 'selection' | 'light' | 'medium';
  onPress?: (e: unknown) => void;
  onPressIn?: (e: unknown) => void;
  onPressOut?: (e: unknown) => void;
  onLongPress?: (e: unknown) => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[] | (ViewStyle | false | undefined | null)[];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'radio' | 'link' | 'tab' | 'tablist' | 'none';
  accessibilityState?: object;
  children?: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

const HAPTIC_ACTION: Record<NonNullable<PressableScaleProps['hapticType']>, () => void> = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
};

export function PressableScale({
  scaleValue = Motion.press.button,
  duration = Motion.duration.fast,
  haptic = false,
  hapticType = 'selection',
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  disabled,
  style,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: unknown) => {
    if (disabled) return;
    if (!reduceMotion) {
      scale.value = withTiming(scaleValue, { duration, easing: Motion.easing.out });
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: unknown) => {
    scale.value = reduceMotion
      ? 1
      : withTiming(1, {
          duration: Math.round(duration * 0.65),
          easing: Motion.easing.out,
        });
    onPressOut?.(e);
  };

  const handlePress = (e: unknown) => {
    if (haptic && !disabled) HAPTIC_ACTION[hapticType]();
    onPress?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      hitSlop={Sizes.hitSlop}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLongPress={onLongPress}
      style={[style, animatedStyle, disabled ? styles.disabled : null]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: Opacity.disabled,
  },
});
