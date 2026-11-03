/**
 * Toast — avisos breves en la parte superior.
 *
 *   const toast = useToast();
 *   toast.show('success', 'Listo. Tu contraseña cambió.');
 *   toast.show('error', humanizeError(err), { accion: { label: 'Reintentar', onPress: guardar } });
 *   toast.show('info', `${titulo}: ${mensaje}`, { accion: { label: 'Ver', onPress: abrir } });
 *
 * Duraciones (APP-51, WCAG 2.2.1): un error no se va solo, queda hasta que se
 * toca "Cerrar" o su acción; un éxito dura 3 s; un aviso informativo dura según
 * lo largo del texto (60 ms por carácter, mínimo 4 s). `duracionMs` fuerza otra
 * duración (0 = no se va solo). Cada aviso se anuncia al lector de pantalla y,
 * con "reducir movimiento", aparece y se va sin desplazarse.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, Info, X, XCircle, type IconProps } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { IconButton, Text } from '@/src/components/ui';
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

export interface ToastOpciones {
  /** Botón de texto dentro del aviso ("Ver", "Reintentar"). Al tocarlo, el aviso se cierra. */
  accion?: { label: string; onPress(): void };
  /** Duración en ms; 0 = queda hasta que se cierre. Por defecto según el tipo. */
  duracionMs?: number;
}

interface ToastContextType {
  show: (type: ToastType, message: string, opciones?: ToastOpciones) => void;
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

const DURACION_EXITO_MS = 3000;
const DURACION_INFO_MIN_MS = 4000;
const MS_POR_CARACTER = 60;
const HIDDEN_OFFSET = -120;

/** ms hasta ocultarse; 0 = no se oculta solo. */
function duracionPorDefecto(type: ToastType, message: string): number {
  if (type === 'error') return 0;
  if (type === 'success') return DURACION_EXITO_MS;
  return Math.max(DURACION_INFO_MIN_MS, MS_POR_CARACTER * message.length);
}

interface ToastState {
  type: ToastType;
  message: string;
  accion?: ToastOpciones['accion'];
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(HIDDEN_OFFSET);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const hide = useCallback(() => {
    clearTimer();
    if (reduceMotion) {
      opacity.value = 0;
      setToast(null);
      return;
    }
    // The exit must feel instant — it is deliberately faster than the entrance.
    translateY.value = withTiming(HIDDEN_OFFSET, { duration: Motion.duration.fast });
    opacity.value = withTiming(0, { duration: Motion.duration.instant }, (finished) => {
      if (finished) runOnJS(setToast)(null);
    });
  }, [clearTimer, translateY, opacity, reduceMotion]);

  const show = useCallback(
    (toastType: ToastType, toastMessage: string, opciones?: ToastOpciones) => {
      clearTimer();

      setToast({ type: toastType, message: toastMessage, accion: opciones?.accion });

      if (toastType === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else if (toastType === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      }

      if (reduceMotion) {
        translateY.value = 0;
        opacity.value = 1;
      } else {
        translateY.value = HIDDEN_OFFSET;
        opacity.value = 0;
        translateY.value = withSpring(0, Motion.spring.snappy);
        opacity.value = withTiming(1, { duration: Motion.duration.base });
      }

      // El lector de pantalla lo dice aunque el foco esté en otro sitio.
      const prefijo = toastType === 'error' ? 'Error: ' : '';
      AccessibilityInfo.announceForAccessibility(`${prefijo}${toastMessage}`);

      const duracion = opciones?.duracionMs ?? duracionPorDefecto(toastType, toastMessage);
      if (duracion > 0) timeoutRef.current = setTimeout(hide, duracion);
    },
    [clearTimer, hide, translateY, opacity, reduceMotion]
  );

  const value = useMemo(() => ({ show }), [show]);

  const visual = VISUALS[toast?.type ?? 'info'];
  const Icon = visual.icon;
  const accion = toast?.accion;

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast && (
        <Animated.View
          style={[s.container, { top: insets.top + Spacing.sm }, animatedStyle]}
          pointerEvents="box-none"
        >
          <View style={s.toast} accessibilityRole="alert">
            <Pressable
              onPress={toast.type === 'error' ? undefined : hide}
              style={s.body}
              accessible
              accessibilityLabel={toast.message}
              accessibilityHint={toast.type === 'error' ? undefined : 'Toca para cerrar'}
            >
              <View style={[s.iconBox, { backgroundColor: alpha(visual.color, 0.12) }]}>
                <Icon size={Sizes.icon.md} color={visual.color} weight="fill" />
              </View>
              <Text variant="label" style={s.message} numberOfLines={5}>
                {toast.message}
              </Text>
            </Pressable>

            {accion ? (
              <PressableScale
                onPress={() => {
                  hide();
                  accion.onPress();
                }}
                scaleValue={Motion.press.chip}
                style={s.action}
                accessibilityRole="button"
                accessibilityLabel={accion.label}
              >
                <Text variant="label" color="link" style={s.actionText} compact>
                  {accion.label}
                </Text>
              </PressableScale>
            ) : null}

            <IconButton icon={X} label="Cerrar" onPress={hide} size="md" color={Colors.mutedForeground} />
          </View>
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
    gap: Spacing.xs,
    marginHorizontal: Layout.screenPadding,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    backgroundColor: Colors.white,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    ...Shadows.elevated,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Sizes.touchTarget,
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
  actionText: {
    textDecorationLine: 'underline',
  },
  action: {
    minHeight: Sizes.touchTarget,
    minWidth: Sizes.touchTarget,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
