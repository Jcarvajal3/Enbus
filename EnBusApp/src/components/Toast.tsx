import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { Text, View } from '@/tw';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { CheckCircle, XCircle, Info } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, Radius, Shadows } from '@/src/theme';

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

/** Icon color map — maps toast type to theme semantic colors */
const ICON_COLORS: Record<ToastType, string> = {
  success: Colors.success,
  error: Colors.destructive,
  info: Colors.info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const hide = useCallback(() => {
    // Emil: exit DEBE ser más rápido que entry
    translateY.value = withTiming(-100, { duration: 150 });
    opacity.value = withTiming(0, { duration: 120 }, (finished) => {
      if (finished) {
        runOnJS(setVisible)(false);
      }
    });
  }, [translateY, opacity]);

  const show = useCallback((toastType: ToastType, toastMessage: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setType(toastType);
    setMessage(toastMessage);
    setVisible(true);

    translateY.value = -100;
    opacity.value = 0;

    // Haptic feedback según tipo
    if (toastType === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (toastType === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    // Entry: spring natural
    translateY.value = withSpring(40, { damping: 15, stiffness: 200 });
    opacity.value = withTiming(1, { duration: 200 });

    timeoutRef.current = setTimeout(() => {
      hide();
    }, 3500);
  }, [hide, translateY, opacity]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View
          style={[styles.container, animatedStyle]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={message}
        >
          <Pressable
            onPress={hide}
            style={styles.pressable}
            accessibilityLabel="Cerrar notificación"
            accessibilityRole="button"
          >
            {type === 'success' && <CheckCircle size={22} color={ICON_COLORS.success} weight="fill" />}
            {type === 'error' && <XCircle size={22} color={ICON_COLORS.error} weight="fill" />}
            {type === 'info' && <Info size={22} color={ICON_COLORS.info} weight="fill" />}
            <View style={styles.textContainer}>
              <Text style={styles.message}>{message}</Text>
            </View>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg - 2,
    borderRadius: Radius.md - 2,
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm + 2,
    ...Shadows.elevated,
  },
  textContainer: {
    flex: 1,
  },
  message: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.foreground,
    lineHeight: 20,
  },
});
