import React, { useEffect } from 'react';
import { DimensionValue, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors } from '@/src/theme';

interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
}

/**
 * SkeletonLoader con shimmer pulse animado (P1).
 * Usa Reanimated withRepeat para hacer loop opacity 0.4 → 0.85 → 0.4.
 * Cada instancia tiene un delay aleatorio para que los skeletons no pulsen en sincronía.
 */
export function SkeletonLoader({
  width = '100%',
  height = 14,
  borderRadius = 7,
}: SkeletonLoaderProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    // Delay aleatorio entre 0-400ms para que los distintos skeletons se desfasen
    const delay = Math.random() * 400;
    const timer = setTimeout(() => {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.85, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.ease) })
        ),
        -1,  // infinite
        false
      );
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: Colors.surfaceDark },
        animatedStyle,
      ]}
      accessibilityLabel="Cargando contenido..."
      accessibilityRole="progressbar"
    />
  );
}
