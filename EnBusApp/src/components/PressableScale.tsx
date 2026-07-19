/**
 * PressableScale – Wrapper de Pressable con feedback táctil animado (P0).
 *
 * Arquitectura:
 *   Animated.View (scale transform + layout) → Pressable (visual + press handlers)
 *
 * Principios Emil Kowalski:
 *   - scale(0.97) en botones funcionales, nunca menos de 0.95
 *   - 160ms ease-out: feedback inmediato, entrada suave
 *   - El restore (press out) es más rápido que el press-in
 *   - Solo transform en GPU, sin cambiar layout properties
 */
import React from 'react';
import { Pressable as RNPressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface PressableScaleProps {
  /** Escala mínima al presionar. Default 0.97 */
  scaleValue?: number;
  /** Duración del press-in en ms. Default 160 */
  duration?: number;
  /** Dispara haptic feedback al presionar. Default false */
  haptic?: boolean;
  /** Tipo de haptic. Default 'selection' */
  hapticType?: 'selection' | 'light' | 'medium';
  onPress?: (e: any) => void;
  onPressIn?: (e: any) => void;
  onPressOut?: (e: any) => void;
  onLongPress?: (e: any) => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[] | (ViewStyle | false | undefined | null)[];
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'radio' | 'link' | 'tab' | 'none';
  accessibilityState?: any;
  children?: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export function PressableScale({
  scaleValue = 0.97,
  duration = 160,
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
  const easeOut = Easing.out(Easing.cubic);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: any) => {
    if (disabled) return;
    scale.value = withTiming(scaleValue, { duration, easing: easeOut });
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    scale.value = withTiming(1, {
      duration: Math.round(duration * 0.65),
      easing: easeOut,
    });
    onPressOut?.(e);
  };

  const handlePress = (e: any) => {
    if (haptic && !disabled) {
      switch (hapticType) {
        case 'light':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        default:
          Haptics.selectionAsync();
      }
    }
    onPress?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLongPress={onLongPress}
      style={[style, animatedStyle, disabled && styles.disabled]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
});

