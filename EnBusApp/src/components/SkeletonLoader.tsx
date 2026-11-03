import React, { useEffect } from 'react';
import { DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { Colors, Motion, Radius } from '@/src/theme';

interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  /** Offsets the pulse so stacked skeletons don't breathe in unison. */
  index?: number;
}

/**
 * Pulsing placeholder block. Opacity only — no layout work while loading.
 * Con "reducir movimiento" el bloque queda fijo, sin pulso.
 */
export function SkeletonLoader({
  width = '100%',
  height = 14,
  borderRadius = Radius.xs,
  index = 0,
}: SkeletonLoaderProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 0.5 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0.5;
      return;
    }
    // Deterministic offset per index (a random delay made re-renders jitter).
    const offset = (index % 4) * 120;
    const timer = setTimeout(() => {
      progress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Motion.easing.inOut }),
          withTiming(0, { duration: 700, easing: Motion.easing.inOut })
        ),
        -1,
        false
      );
    }, offset);

    return () => clearTimeout(timer);
  }, [index, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + progress.value * 0.45,
  }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: Colors.surfaceDark }, animatedStyle]}
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando contenido"
    />
  );
}
