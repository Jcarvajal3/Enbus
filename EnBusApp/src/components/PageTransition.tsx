import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * PageTransition – Wraps screen content to provide a smooth, hardware-accelerated
 * transition on mount.
 *
 * Emil Kowalski Principles:
 *   - Snappy entering animation: 220ms (under 300ms limit).
 *   - Custom ease-out curve (Easing.out(Easing.cubic)) for immediate visual responsiveness.
 *   - Subtle entry: offset is only 24px, avoiding scaling from 0 or long sweeps.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(24); // Subtle right offset

  useEffect(() => {
    const easeOut = Easing.out(Easing.cubic);
    opacity.value = withTiming(1, { duration: 220, easing: easeOut });
    translateX.value = withTiming(0, { duration: 220, easing: easeOut });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
}
