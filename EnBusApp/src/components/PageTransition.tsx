import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { Motion } from '@/src/theme';

/**
 * PageTransition — mount animation for stacked screens.
 *
 * A short fade + 24pt horizontal slide, decelerating. Kept under
 * `Motion.duration.base` so it reads as responsiveness rather than as an
 * animation the user has to wait through. Con "reducir movimiento" la pantalla
 * aparece sin desplazarse ni fundirse.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, {
      duration: Motion.duration.base,
      easing: Motion.easing.out,
    });
  }, [progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * 24 }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
