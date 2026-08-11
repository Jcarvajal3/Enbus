import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, Info, XCircle, type IconProps } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/src/components/ui';
import {
  Colors,
  Layout,
  Motion,
  Radius,
  Shadows,
  Sizes,
  Spacing,
  StatusPalette,
  alpha,
} from '@/src/theme';

type ToastType = 'success' | 'error' | 'info';

interface ToastContextType {
  show: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}

const VISUALS: Record<ToastType, { icon: React.ComponentType<IconProps>; color: string }> = {
  success: { icon: CheckCircle, color: StatusPalette.success.fg },
  error: { icon: XCircle, color: StatusPalette.danger.fg },
  info: { icon: Info, color: StatusPalette.progress.fg },
};

const AUTO_HIDE_MS = 3500;
const HIDDEN_OFFSET = -120;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();

  const [message, setMessage] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(HIDDEN_OFFSET);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const hide = useCallback(() => {
    // The exit must feel instant — it is deliberately faster than the entrance.
    translateY.value = withTiming(HIDDEN_OFFSET, { duration: Motion.duration.fast });
    opacity.value = withTiming(0, { duration: Motion.duration.instant }, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
  }, [translateY, opacity]);

  const show = useCallback(
    (toastType: ToastType, toastMessage: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      setType(toastType);
      setMessage(toastMessage);
      setVisible(true);

      translateY.value = HIDDEN_OFFSET;
      opacity.value = 0;

      if (toastType === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (toastType === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      translateY.value = withSpring(0, Motion.spring.snappy);
      opacity.value = withTiming(1, { duration: Motion.duration.base });

      timeoutRef.current = setTimeout(hide, AUTO_HIDE_MS);
    },
    [hide, translateY, opacity]
  );

  const visual = VISUALS[type];
  const Icon = visual.icon;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}

      {visible && (
        <Animated.View
          style={[s.container, { top: insets.top + Spacing.sm }, animatedStyle]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={message}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={hide}
            style={s.toast}
            accessibilityLabel="Cerrar notificación"
            accessibilityRole="button"
          >
            <View style={[s.iconBox, { backgroundColor: alpha(visual.color, 0.12) }]}>
              <Icon size={Sizes.icon.md} color={visual.color} weight="fill" />
            </View>
            <Text variant="label" style={s.message} numberOfLines={3}>
              {message}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Layout.screenPadding,
    padding: Spacing.md,
    paddingRight: Spacing.lg,
    backgroundColor: Colors.white,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    ...Shadows.elevated,
  },
  iconBox: {
    width: Sizes.iconBox.sm,
    height: Sizes.iconBox.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
  },
});
