import React, { useEffect } from 'react';
import { View, StyleSheet, DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  className?: string;
}

export function SkeletonLoader({ width = '100%', height = 20, borderRadius = 8, className }: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      true
    );

    // m3 Fix: las animaciones withRepeat(-1) corren en el hilo de UI de Reanimated
    // y continúan incluso cuando el componente se desmonta (React no puede pararlas
    // automáticamente). Sin cancelAnimation(), generan overhead innecesario de
    // CPU/GPU en el UI thread para componentes ya inexistentes en el árbol.
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius },
        animatedStyle,
      ]}
      className={className}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#e4e4e7', // Tailwind zinc-200 / neutral background shimmer
  },
});
