import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ArrowsOut, SunDim, X } from 'phosphor-react-native';
import { Button, IconButton, Text } from '@/src/components/ui';
import { Colors, Layout, Motion, Radius, Sizes, Spacing, Typography } from '@/src/theme';

/** Tamaño del QR en pantalla completa: lo bastante grande para cualquier lector. */
const QR_GRANDE = 280;

interface QRCodeViewerProps {
  /** Lo que codifica el QR (p. ej. `PASS-BOL-…` o el código de seguimiento). */
  data: string;
  size?: number;
  /**
   * Código que la persona puede dictar si el lector falla (p. ej.
   * `BOL-7CAB-E4AD` o `EB-261003-12345`). Se muestra bajo el QR; el contenido
   * técnico del QR nunca se muestra.
   */
  codigoLegible?: string;
  /** Añade "Mostrar QR en grande": pantalla blanca con el QR de 280 pt. */
  ampliable?: boolean;
}

/** QR with a spring reveal — it should feel like the code "arrives", not blink in. */
export function QRCodeViewer({ data, size = 200, codigoLegible, ampliable }: QRCodeViewerProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const scale = useSharedValue(reduceMotion ? 1 : 0.9);
  const [grande, setGrande] = useState(false);

  useEffect(() => {
    // Con "reducir movimiento" el QR aparece sin escalar ni fundirse.
    if (reduceMotion) {
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    opacity.value = withTiming(1, { duration: Motion.duration.base, easing: Motion.easing.out });
    scale.value = withSpring(1, Motion.spring.soft);
  }, [opacity, scale, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const etiqueta = codigoLegible ? `Código QR ${codigoLegible}` : 'Código QR';

  return (
    <Animated.View style={[s.container, animatedStyle]}>
      <View style={s.frame} accessible accessibilityLabel={etiqueta} accessibilityRole="image">
        <QRCode value={data} size={size} color={Colors.foreground} backgroundColor={Colors.white} />
      </View>

      {codigoLegible ? (
        <Text variant="bodyStrong" align="center" selectable style={s.code}>
          {codigoLegible}
        </Text>
      ) : null}

      {ampliable ? (
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowsOut}
          onPress={() => setGrande(true)}
          style={s.ampliar}
        >
          Mostrar QR en grande
        </Button>
      ) : null}

      {ampliable ? (
        <Modal
          visible={grande}
          animationType="fade"
          onRequestClose={() => setGrande(false)}
          statusBarTranslucent
          presentationStyle="fullScreen"
        >
          <SafeAreaView style={s.fullscreen} edges={['top', 'bottom']}>
            <View style={s.fullscreenHeader}>
              <IconButton icon={X} label="Cerrar" onPress={() => setGrande(false)} variant="surface" />
            </View>
            <View style={s.fullscreenBody}>
              <View accessible accessibilityLabel={etiqueta} accessibilityRole="image">
                <QRCode
                  value={data}
                  size={QR_GRANDE}
                  color={Colors.black}
                  backgroundColor={Colors.white}
                  quietZone={Spacing.lg}
                />
              </View>
              {codigoLegible ? (
                <Text variant="heading" align="center" selectable style={s.fullscreenCode}>
                  {codigoLegible}
                </Text>
              ) : null}
              <View style={s.ayuda}>
                <SunDim size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />
                <Text variant="secondary" color="muted" align="center" style={s.ayudaTexto}>
                  Sube el brillo de tu pantalla para que lo lean más rápido.
                </Text>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
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
  },
  code: {
    marginTop: Spacing.md,
    letterSpacing: Typography.tracking.wide,
  },
  ampliar: {
    marginTop: Spacing.sm,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  fullscreenBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding,
  },
  fullscreenCode: {
    marginTop: Spacing.xl,
    letterSpacing: Typography.tracking.wider,
  },
  ayuda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    maxWidth: 320,
  },
  ayudaTexto: {
    flexShrink: 1,
  },
  fullscreenHeader: {
    alignItems: 'flex-end',
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.sm,
  },
});
