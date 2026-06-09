import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { Text, View } from '@/tw';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { CheckCircle, XCircle, Info } from 'phosphor-react-native';

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

  // Cancelar el timer de auto-dismiss si el provider se desmonta.
  // Sin este cleanup, el setTimeout intenta llamar hide() en un componente
  // ya desmontado, causando memory leaks en hot-reload y tests.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const hide = useCallback(() => {
    translateY.value = withTiming(-100, { duration: 300 });
    opacity.value = withTiming(0, { duration: 250 }, (finished) => {
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

    translateY.value = withSpring(40, { damping: 15 });
    opacity.value = withTiming(1, { duration: 200 });

    timeoutRef.current = setTimeout(() => {
      hide();
    }, 3500);
  }, [hide, translateY, opacity]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View style={[styles.container, animatedStyle]}>
          <Pressable onPress={hide} className="flex-row items-center bg-card border border-border p-4 rounded-xl shadow-lg w-[90%] self-center gap-3">
            {type === 'success' && <CheckCircle size={22} color="#22c55e" weight="fill" />}
            {type === 'error' && <XCircle size={22} color="#dc2626" weight="fill" />}
            {type === 'info' && <Info size={22} color="#3b82f6" weight="fill" />}
            
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground leading-5">{message}</Text>
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
});
