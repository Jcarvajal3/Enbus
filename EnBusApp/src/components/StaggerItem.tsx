import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '@/src/theme';

interface StaggerItemProps {
  /** Position in the sequence. Determines the delay. */
  index: number;
  /** Delay between consecutive items, in ms. */
  delayStep?: number;
  duration?: number;
  /** Initial vertical offset. */
  translateYStart?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}

/**
 * StaggerItem — fade-in + slide-up entrance, offset by position.
 *
 * Used both for list rows and for staged reveals inside a screen:
 *
 *   ({ item, index }) => <StaggerItem index={index}><Card … /></StaggerItem>
 *
 * Only opacity and transform are animated (GPU, no layout thrash), the delay
 * runs on the UI thread via `withDelay`, and items past
 * `Motion.stagger.maxIndex` all share the same delay so off-screen rows don't
 * wait a second to appear.
 */
export function StaggerItem({
  index,
  delayStep = Motion.stagger.step,
  duration = Motion.duration.slow,
  translateYStart = 14,
  style,
  children,
}: StaggerItemProps) {
  const progress = useSharedValue(0);
  const delay = Math.min(index, Motion.stagger.maxIndex) * delayStep;

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Motion.easing.out })
    );
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * translateYStart }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
