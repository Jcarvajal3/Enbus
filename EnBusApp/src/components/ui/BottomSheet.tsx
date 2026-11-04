/**
 * BottomSheet — the swipe-to-dismiss sheet.
 *
 * Written three times before (LocationSelector, the filters sheet in
 * boletos/buscar, the bank picker in PaymentFlow used a full-screen pageSheet
 * instead). Each had its own drag handle size, close-threshold and spring, so
 * the same gesture behaved differently in each place. One implementation now
 * owns the gesture, the scrim, the entrance and the header.
 *
 * La hoja anima sola su fondo y su deslizamiento: el `Modal` no lleva animación
 * propia, porque dos animaciones sobre la misma ventana parpadean en Android. El
 * `Modal` sigue montado hasta que termina la salida, también cuando quien la usa
 * cierra con `visible={false}` sin pasar por `onClose`.
 *
 * Con "reducir movimiento" la hoja aparece y se cierra sin deslizarse.
 *
 * Subpasos (p. ej. la forma de pago dentro de "Registrar pago"): `onBack`
 * dibuja la ← a la izquierda del título y cierra el subpaso; el título cambia
 * con el paso. El pie respeta el área segura inferior (AU-45).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing as RNEasing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { ArrowLeft, X } from 'phosphor-react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { Colors, Layout, Motion, Radius, Shadows, Spacing } from '@/src/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Drag distance (or fling velocity) past which the sheet dismisses. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.4;
/** Curvas de `Motion.easing` para el `Animated` de React Native (no Reanimated). */
const EASE_OUT = RNEasing.out(RNEasing.cubic);
const EASE_IN = RNEasing.in(RNEasing.cubic);

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Fixed height as a percentage; omit to size to content (capped at 85%). */
  height?: ViewStyle['height'];
  /** Pinned area at the bottom of the sheet — e.g. an "Apply" button */
  footer?: React.ReactNode;
  /** Flecha ← a la izquierda del título: vuelve al subpaso anterior. */
  onBack?: () => void;
  children: React.ReactNode;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  height,
  footer,
  onBack,
  children,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const [montado, setMontado] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fondo = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();
  // El PanResponder se crea una vez: lee estos valores por ref.
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const settle = useCallback(() => {
    fondo.stopAnimation();
    if (reduceMotionRef.current) {
      fondo.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(fondo, {
        toValue: 1,
        duration: Motion.duration.base,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: Motion.duration.slow,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fondo, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(reduceMotionRef.current ? 0 : SCREEN_HEIGHT);
      fondo.setValue(0);
      setMontado(true);
      settle();
      return;
    }
    if (reduceMotionRef.current) {
      setMontado(false);
      return;
    }
    // La salida es más rápida que la entrada. Si la hoja se reabre a medias,
    // `finished` llega en falso y sigue montada.
    Animated.parallel([
      Animated.timing(fondo, {
        toValue: 0,
        duration: Motion.duration.base,
        easing: EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: Motion.duration.base,
        easing: EASE_IN,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMontado(false);
    });
  }, [visible, fondo, translateY, settle]);

  /** Pide cerrar. Si quien la usa no la cierra (p. ej. una acción en curso), vuelve a su sitio. */
  const pedirCierre = useCallback(() => {
    onCloseRef.current();
    requestAnimationFrame(() => {
      if (visibleRef.current) settle();
    });
  }, [settle]);

  // El PanResponder se crea una vez: llama a la versión más reciente.
  const pedirCierreRef = useRef(pedirCierre);
  pedirCierreRef.current = pedirCierre;
  const settleRef = useRef(settle);
  settleRef.current = settle;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 5,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          pedirCierreRef.current();
        } else {
          settleRef.current();
        }
      },
    })
  ).current;

  return (
    <Modal
      visible={montado}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={pedirCierre}
    >
      <View style={s.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, s.scrim, { opacity: fondo }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={pedirCierre}
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
          />
        </Animated.View>

        <Animated.View
          style={[
            s.sheet,
            height ? { height } : { maxHeight: Layout.sheetMaxHeight as ViewStyle['maxHeight'] },
            { transform: [{ translateY }] },
          ]}
        >
          <View {...panResponder.panHandlers} style={s.header}>
            <View style={s.handle} />
            {title ? (
              <View style={s.headerRow}>
                {onBack ? (
                  <IconButton icon={ArrowLeft} label="Atrás" onPress={onBack} size="md" variant="surface" />
                ) : null}
                <Text variant="heading" numberOfLines={1} style={s.headerTitle} accessibilityRole="header">
                  {title}
                </Text>
                <IconButton icon={X} label="Cerrar" onPress={pedirCierre} size="md" variant="surface" />
              </View>
            ) : null}
          </View>

          <View style={[s.body, height ? s.bodyFill : null, footer ? null : { paddingBottom: insets.bottom }]}>
            {children}
          </View>

          {footer ? (
            <View style={[s.footer, { paddingBottom: Spacing['2xl'] + insets.bottom }]}>{footer}</View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: Colors.scrim,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius['3xl'],
    borderTopRightRadius: Radius['3xl'],
    borderCurve: 'continuous',
    overflow: 'hidden',
    ...Shadows.overlay,
  },
  header: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.sm,
  },
  handle: {
    width: Spacing['4xl'],
    height: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceDark,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  headerTitle: {
    flex: 1,
  },
  body: {
    flexShrink: 1,
  },
  /** Con `height` fijo el cuerpo ocupa el resto y el pie queda abajo. */
  bodyFill: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
    backgroundColor: Colors.background,
    ...Shadows.subtle,
  },
});
