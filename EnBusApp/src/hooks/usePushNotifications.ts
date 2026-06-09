import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '@/src/utils/supabase';

// ── Configurar handler global de notificaciones ───────────────────────────────
// Determina cómo se muestran las notificaciones cuando la app está en PRIMER PLANO.
// Esta llamada es idempotente y debe hacerse fuera del hook para que solo
// se ejecute una vez al importar el módulo, no en cada render.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
 */
export function usePushNotifications(
  userId: string | undefined,
  handlers: PushNotificationHandlers = {}
) {
  const router = useRouter();

  // Usar refs para los handlers para que los listeners no queden con closures stale
  // si los callbacks cambian entre renders (ej. si el consumidor pasa lambdas inline).
  const onReceivedRef = useRef(handlers.onNotificationReceived);
  const onResponseRef = useRef(handlers.onNotificationResponse);
  onReceivedRef.current = handlers.onNotificationReceived;
  onResponseRef.current = handlers.onNotificationResponse;

  // ── Registro de token push ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    async function registerForPushNotificationsAsync() {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#e2b714',
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.warn('[Push] Permiso para notificaciones push denegado.');
          return;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) {
          throw new Error('EAS projectId no configurado en app.json');
        }

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log('[Push] Token obtenido:', token);

        // Guardar token en perfiles de Supabase
        const { error } = await supabase
          .from('profiles')
          .update({ expo_push_token: token })
          .eq('id', userId);

        if (error) throw error;
      } catch (err: any) {
        console.warn('[Push] Error al registrar notificaciones push:', err.message);
      }
    }

    registerForPushNotificationsAsync();
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
        console.log('[Push] Notificación recibida en primer plano:', notification.request.identifier);
        onReceivedRef.current?.(notification);
      }
    );

    // Listener B: usuario tocó la notificación (desde primer plano, segundo plano, o cerrada)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[Push] Usuario interactuó con notificación:', response.notification.request.identifier);

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
}
