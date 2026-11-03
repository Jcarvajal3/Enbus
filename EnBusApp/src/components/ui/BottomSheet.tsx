/**
 * BottomSheet — the swipe-to-dismiss sheet.
 *
 * Written three times before (LocationSelector, the filters sheet in
 * boletos/buscar, the bank picker in PaymentFlow used a full-screen pageSheet
 * instead). Each had its own drag handle size, close-threshold and spring, so
 * the same gesture behaved differently in each place. One implementation now
 * owns the gesture, the scrim, the entrance and the header.
 *
 * Con "reducir movimiento" la hoja aparece y se cierra sin deslizarse (solo el
 * fundido del fondo).
 *
 * Subpasos (p. ej. la forma de pago dentro de "Registrar pago"): `onBack`
 * dibuja la ← a la izquierda del título y cierra el subpaso; el título cambia
 * con el paso. El pie respeta el área segura inferior (AU-45).
 */
import React, { useCallback, useEffect, useRef } from 'react';
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
import { Colors, Layout, Motion, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

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
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const reduceMotion = useReducedMotion();
  // El PanResponder se crea una vez: lee la preferencia por ref.
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  const settle = useCallback(() => {
    if (reduceMotionRef.current) {
      translateY.setValue(0);
      return;
    }
    Animated.timing(translateY, {
      toValue: 0,
      duration: Motion.duration.slow,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const animateOut = useCallback(() => {
    if (reduceMotionRef.current) {
      onClose();
      return;
    }
    // La salida es más rápida que la entrada.
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: Motion.duration.base,
      easing: EASE_IN,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [onClose, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(reduceMotionRef.current ? 0 : SCREEN_HEIGHT);
      settle();
    }
  }, [visible, translateY, settle]);

  // El PanResponder se crea una vez: llama a la versión más reciente.
  const animateOutRef = useRef(animateOut);
  animateOutRef.current = animateOut;
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
          animateOutRef.current();
        } else {
          settleRef.current();
        }
      },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={animateOut}
    >
      <View style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={animateOut}
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
        />

        <Animated.View
          style={[
            s.sheet,
            height ? { height } : { maxHeight: Layout.sheetMaxHeight as ViewStyle['maxHeight'] },
            { transform: [{ translateY }] },
          ]}
        >
          <View {...panResponder.panHandlers} style={[s.header, title ? s.headerDivided : null]}>
            <View style={s.handle} />
            {title ? (
              <View style={s.headerRow}>
                {onBack ? (
                  <IconButton icon={ArrowLeft} label="Atrás" onPress={onBack} size="md" variant="surface" />
                ) : null}
                <Text variant="heading" numberOfLines={1} style={s.headerTitle} accessibilityRole="header">
                  {title}
                </Text>
                <IconButton icon={X} label="Cerrar" onPress={animateOut} size="md" variant="surface" />
              </View>
            ) : null}
          </View>

          <View style={[s.body, footer ? null : { paddingBottom: insets.bottom }]}>{children}</View>

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
    backgroundColor: Colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius['3xl'],
    borderTopRightRadius: Radius['3xl'],
    overflow: 'hidden',
    ...Shadows.overlay,
  },
  header: {
    paddingTop: Spacing.md,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.sm,
  },
  headerDivided: {
    paddingBottom: Spacing.lg,
    borderBottomWidth: Sizes.hairline,
    borderBottomColor: Colors.borderLight,
  },
  handle: {
    width: Spacing['4xl'],
    height: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
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
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.borderLight,
  },
});
