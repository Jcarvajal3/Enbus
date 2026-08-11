/**
 * BottomSheet — the swipe-to-dismiss sheet.
 *
 * Written three times before (LocationSelector, the filters sheet in
 * boletos/buscar, the bank picker in PaymentFlow used a full-screen pageSheet
 * instead). Each had its own drag handle size, close-threshold and spring, so
 * the same gesture behaved differently in each place. One implementation now
 * owns the gesture, the scrim, the entrance and the header.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { X } from 'phosphor-react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { Colors, Layout, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Drag distance (or fling velocity) past which the sheet dismisses. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.4;

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Fixed height as a percentage; omit to size to content (capped at 85%). */
  height?: ViewStyle['height'];
  /** Pinned area at the bottom of the sheet — e.g. an "Apply" button */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  height,
  footer,
  children,
}: BottomSheetProps) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const animateOut = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [onClose, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 45,
        friction: 9,
      }).start();
    }
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 5,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          animateOut();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 45,
            friction: 9,
          }).start();
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
          <View {...panResponder.panHandlers} style={s.header}>
            <View style={s.handle} />
            {title ? (
              <View style={s.headerRow}>
                <Text variant="heading" numberOfLines={1} style={s.headerTitle}>
                  {title}
                </Text>
                <IconButton icon={X} label="Cerrar" onPress={animateOut} size="md" variant="surface" />
              </View>
            ) : null}
          </View>

          <View style={s.body}>{children}</View>

          {footer ? <View style={s.footer}>{footer}</View> : null}
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
    paddingBottom: Spacing.lg,
    borderBottomWidth: Sizes.hairline,
    borderBottomColor: Colors.borderLight,
  },
  handle: {
    width: Spacing['4xl'],
    height: Spacing.xs + 1,
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
    paddingBottom: Spacing['2xl'],
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.borderLight,
  },
});
