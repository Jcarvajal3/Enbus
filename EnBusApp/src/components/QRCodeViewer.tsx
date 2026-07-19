import { View, Text } from '@/tw';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, Radius } from '@/src/theme';

interface QRCodeViewerProps {
  data: string;
  size?: number;
  autoMaxBrightness?: boolean;
}

/**
 * QRCodeViewer con reveal animation (P2).
 * Al montar: scale 0.90 → 1.0 (spring) + opacity 0 → 1 (200ms).
 */
export function QRCodeViewer({ data, size = 200, autoMaxBrightness = true }: QRCodeViewerProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    if (autoMaxBrightness) {
      // expo-brightness: subida de brillo aquí en producción
    }
    // Reveal animation
    opacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
    scale.value = withSpring(1, { damping: 14, stiffness: 160 });

    return () => {
      // restauración brillo
    };
  }, [autoMaxBrightness]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, animatedStyle]}
      accessibilityLabel={`Código QR con valor: ${data}`}
      accessibilityRole="image"
    >
      <View style={styles.qrWrapper}>
        <QRCode
          value={data}
          size={size}
          color={Colors.foreground}
          backgroundColor={Colors.white}
        />
      </View>
      <Text style={styles.codeText}>{data}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  qrWrapper: {
    padding: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    marginTop: Spacing.md + 2,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
