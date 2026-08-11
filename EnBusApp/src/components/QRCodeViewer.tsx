import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/src/components/ui';
import { Colors, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

interface QRCodeViewerProps {
  data: string;
  size?: number;
  /** Reserved for `expo-brightness`: raise screen brightness while scanning. */
  autoMaxBrightness?: boolean;
}

/** QR with a spring reveal — it should feel like the code "arrives", not blink in. */
export function QRCodeViewer({ data, size = 200 }: QRCodeViewerProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: Motion.duration.base, easing: Motion.easing.out });
    scale.value = withSpring(1, Motion.spring.soft);
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[s.container, animatedStyle]}
      accessibilityLabel={`Código QR: ${data}`}
      accessibilityRole="image"
    >
      <View style={s.frame}>
        <QRCode value={data} size={size} color={Colors.foreground} backgroundColor={Colors.white} />
      </View>
      <Text variant="overline" color="muted" uppercase align="center" style={s.code}>
        {data}
      </Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  frame: {
    padding: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  code: {
    marginTop: Spacing.md,
    letterSpacing: 2,
  },
});
