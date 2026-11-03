import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '@/src/utils/supabase';
import { anotarTokenPush } from '@/src/utils/sesionLocal';
import { Colors } from '@/src/theme';

// ── Configurar handler global de notificaciones ───────────────────────────────
// Determina cómo se muestran las notificaciones cuando la app está en PRIMER PLANO.
// Esta llamada es idempotente y debe hacerse fuera del hook para que solo
// se ejecute una vez al importar el módulo, no en cada render.
//
// #49: en primer plano la app muestra su propio aviso con "Ver" (ver
// `app/_layout.tsx`), así que no se muestra además el banner del sistema; la
// notificación queda en el centro de notificaciones y suena.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: true,
  }),
});

/** Estado del registro del token en este teléfono. */
export type EstadoRegistroPush = 'sin-usuario' | 'registrando' | 'activo' | 'denegado' | 'error';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PushNotificationHandlers {
  /**
   * Callback disparado cuando llega una notificación mientras la app está en PRIMER PLANO.
   * Úsalo para mostrar un Toast personalizado o actualizar estado local.
   */
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  /**
   * Callback disparado cuando el usuario TOCA una notificación (desde cualquier estado de app).
   * Úsalo para navegar a la pantalla correspondiente al contenido de la notificación.
   */
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Registra el dispositivo para recibir notificaciones push y guarda el token
 * en la tabla `profiles` de Supabase.
 *
 * m1 Fix: Añadidos listeners para notificaciones recibidas en primer plano y
 * para respuestas del usuario (tap). Ambos se limpian correctamente al desmontar
 * para evitar memory leaks y listeners duplicados.
 *
 * @param userId   ID del usuario autenticado. El hook no hace nada si es undefined.
 * @param handlers Callbacks opcionales para recibir/responder notificaciones.
 * @returns `estadoRegistro`: si este teléfono quedó registrado para recibir
 *          avisos ('activo'), si el usuario no dio permiso ('denegado') o si
 *          falló ('error': sin red o sin `projectId`; se reintenta con la
 *          próxima sesión).
 */
export function usePushNotifications(
  userId: string | undefined,
  handlers: PushNotificationHandlers = {}
): { estadoRegistro: EstadoRegistroPush } {
  const router = useRouter();
  const [estadoRegistro, setEstadoRegistro] = useState<EstadoRegistroPush>('sin-usuario');

  // Usar refs para los handlers para que los listeners no queden con closures stale
  // si los callbacks cambian entre renders (ej. si el consumidor pasa lambdas inline).
  const onReceivedRef = useRef(handlers.onNotificationReceived);
  const onResponseRef = useRef(handlers.onNotificationResponse);
  onReceivedRef.current = handlers.onNotificationReceived;
  onResponseRef.current = handlers.onNotificationResponse;

  // ── Registro de token push ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setEstadoRegistro('sin-usuario');
      return;
    }
    let vigente = true;
    setEstadoRegistro('registrando');

    async function registerForPushNotificationsAsync() {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: Colors.primary,
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          if (vigente) setEstadoRegistro('denegado');
          return;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) {
          throw new Error('EAS projectId no configurado en app.json');
        }

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

        // Guardar token en perfiles de Supabase
        const { error } = await supabase
          .from('profiles')
          .update({ expo_push_token: token })
          .eq('id', userId);

        if (error) throw error;
        // Para quitarlo del perfil al cerrar la sesión (`AuthContext.signOut`).
        anotarTokenPush(token);
        if (vigente) setEstadoRegistro('activo');
      } catch (err: unknown) {
        if (vigente) setEstadoRegistro('error');
        if (__DEV__) {
          console.warn('[Push] Error al registrar notificaciones push:', err instanceof Error ? err.message : err);
        }
      }
    }

    registerForPushNotificationsAsync();
    return () => {
      vigente = false;
    };
  }, [userId]);

  // ── Listeners de notificaciones en primer plano y respuesta del usuario ──────
  //
  // m1 Fix: sin estos listeners, las notificaciones llegadas mientras la app está
  // abierta sólo se muestran como alertas del sistema (controlado por setNotificationHandler).
  // Con los listeners, podemos:
  //   - Mostrar un Toast personalizado en lugar de (o además de) la alerta del sistema.
  //   - Navegar a la pantalla correcta cuando el usuario toca la notificación.
  //
  // Usamos refs para los handlers para evitar re-suscripciones innecesarias cuando
  // el componente padre re-renderiza con nuevas lambdas inline.
  useEffect(() => {
    // Listener A: notificación recibida mientras la app está ACTIVA (primer plano)
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        onReceivedRef.current?.(notification);
      }
    );

    // Listener B: usuario tocó la notificación (desde primer plano, segundo plano, o cerrada)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        // Navegación por defecto: ir a /notificaciones si no hay handler personalizado
        if (onResponseRef.current) {
          onResponseRef.current(response);
        } else {
          // Fallback inteligente: intentar navegar al link de datos de la notificación,
          // o a la pantalla de notificaciones como destino seguro.
          const data = response.notification.request.content.data as { url?: string } | undefined;
          if (data?.url) {
            router.push(data.url as any);
          } else {
            router.push('/notificaciones');
          }
        }
      }
    );

    // Cleanup: remover listeners al desmontar para evitar memory leaks
    // y registros duplicados si el hook se re-monta.
    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [router]);

  return { estadoRegistro };
}
