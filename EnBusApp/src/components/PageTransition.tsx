import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '@/src/theme';

/**
 * PageTransition — mount animation for stacked screens.
 *
 * A short fade + 24pt horizontal slide, decelerating. Kept under
 * `Motion.duration.base` so it reads as responsiveness rather than as an
 * animation the user has to wait through.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: Motion.duration.base,
      easing: Motion.easing.out,
    });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * 24 }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
