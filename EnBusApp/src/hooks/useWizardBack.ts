/**
 * useWizardBack – "Atrás" coherente en los wizards de varios pasos (APP-08).
 *
 * Sin este hook, el botón/gesto atrás de Android (y el swipe de iOS) cerraba la
 * pantalla completa y se perdía el formulario. Con él:
 *   - En el paso > 1, "atrás" retrocede un paso.
 *   - En el paso 1 con datos, pide confirmación antes de salir.
 *   - En el paso 1 sin datos, sale como siempre.
 *
 * Cubre las tres vías: botón físico de Android (BackHandler), la flecha del
 * header (`handleBack`) y cualquier `goBack`/gesto de la pila (`usePreventRemove`).
 * Las navegaciones que no son "atrás" (p. ej. `router.replace` tras guardar o la
 * redirección de sesión) no se bloquean.
 *
 * Con `bloqueado` (p. ej. mientras se envía el pago) ninguna vía de "atrás"
 * hace nada y el swipe de iOS queda desactivado.
 *
 * Uso:
 *   const { handleBack, allowLeave } = useWizardBack({ step, setStep, isDirty, bloqueado });
 *   <ScreenHeader onBack={handleBack} … />
 *   // tras completar con éxito:
 *   allowLeave();
 *   router.replace(…);
 */

import { useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler } from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';

interface UseWizardBackOptions<S extends number> {
  /** Paso actual (empieza en 1). */
  step: S;
  /** Setter del paso; recibe el paso anterior al retroceder. */
  setStep: (step: S) => void;
  /** Hay datos que se perderían al salir desde el paso 1. */
  isDirty: boolean;
  /**
   * Hay una operación en curso que no se debe interrumpir (p. ej. el checkout
   * enviando el pago): el swipe de iOS se desactiva (`gestureEnabled: false`),
   * y el botón físico, la flecha del header y `goBack` no hacen nada.
   */
  bloqueado?: boolean;
}

interface UseWizardBack {
  /** Para la flecha del header: mismo comportamiento que el back de Android. */
  handleBack: () => void;
  /** Deja salir sin confirmación (llamar antes de navegar tras completar). */
  allowLeave: () => void;
}

/** Acciones de la pila que equivalen a "atrás". */
const BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);

export function useWizardBack<S extends number>({
  step,
  setStep,
  isDirty,
  bloqueado = false,
}: UseWizardBackOptions<S>): UseWizardBack {
  const router = useRouter();
  const navigation = useNavigation();
  const leavingRef = useRef(false);
  const bloqueadoRef = useRef(bloqueado);
  // Solo se toca `gestureEnabled` si este hook lo desactivó: así no pisa la
  // opción que la pantalla tenga en su `Stack.Screen` mientras no hay bloqueo.
  const gestoDesactivadoRef = useRef(false);

  // ── Swipe de iOS: se desactiva mientras hay una operación en curso ───────
  useEffect(() => {
    bloqueadoRef.current = bloqueado;
    if (bloqueado) {
      gestoDesactivadoRef.current = true;
      navigation.setOptions({ gestureEnabled: false });
    } else if (gestoDesactivadoRef.current) {
      gestoDesactivadoRef.current = false;
      navigation.setOptions({ gestureEnabled: true });
    }
  }, [navigation, bloqueado]);

  const goToPreviousStep = useCallback(() => {
    setStep((step - 1) as S);
  }, [step, setStep]);

  const confirmExit = useCallback((onExit: () => void) => {
    Alert.alert(
      '¿Salir sin terminar?',
      'Perderás los datos que ingresaste.',
      [
        { text: 'Seguir editando', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: () => {
            leavingRef.current = true;
            onExit();
          },
        },
      ],
      { cancelable: true }
    );
  }, []);

  const exit = useCallback(() => {
    leavingRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const handleBack = useCallback(() => {
    if (bloqueadoRef.current) return;
    if (step > 1) goToPreviousStep();
    else if (isDirty) confirmExit(exit);
    else exit();
  }, [step, isDirty, goToPreviousStep, confirmExit, exit]);

  const allowLeave = useCallback(() => {
    leavingRef.current = true;
  }, []);

  // ── Botón físico de Android (sólo mientras la pantalla tiene el foco) ────
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        // Bloqueado: se consume el evento sin hacer nada (no sale ni retrocede).
        if (bloqueadoRef.current) return true;
        if (leavingRef.current) return false;
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  // ── goBack de la pila y swipe de iOS ─────────────────────────────────────
  usePreventRemove(step > 1 || isDirty || bloqueado, ({ data }) => {
    const proceed = () => navigation.dispatch(data.action);

    if (leavingRef.current || !BACK_ACTIONS.has(data.action.type)) {
      proceed();
      return;
    }
    if (bloqueadoRef.current) return;
    if (step > 1) goToPreviousStep();
    else confirmExit(proceed);
  });

  return { handleBack, allowLeave };
}
