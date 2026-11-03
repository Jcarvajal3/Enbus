import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { WifiSlash } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/src/components/Toast';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';
import { abrirRecurso } from '@/src/utils/notificaciones';
import { Text } from '@/src/components/ui';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

SplashScreen.preventAutoHideAsync();

/** Branded splash shown while the session is being restored. */
function LoadingScreen() {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    // Con "reducir movimiento" el logo queda quieto.
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.duration.ambient, easing: Motion.easing.inOut }),
        withTiming(0, { duration: Motion.duration.ambient, easing: Motion.easing.inOut })
      ),
      -1,
      false
    );
  }, [pulse, reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + pulse.value * 0.4,
    transform: [{ scale: 0.95 + pulse.value * 0.09 }],
  }));

  return (
    <View style={s.splash}>
      <Animated.View style={[s.splashLogo, animStyle]}>
        <Text variant="title" size="2xl" weight="heavy" color="foreground" compact>
          EB
        </Text>
      </Animated.View>
    </View>
  );
}

function OfflineBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[s.offline, { paddingTop: insets.top + Spacing.sm }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <WifiSlash size={Sizes.icon.sm} color={Colors.foreground} weight="bold" />
      <Text variant="caption" weight="bold">
        Sin conexión — mostrando datos guardados
      </Text>
    </View>
  );
}

/** `data` de la push (`enviar-push`): `{ recurso_tipo, recurso_id, tipo }`; `url` en las antiguas. */
type DatosPush = { recurso_tipo?: unknown; recurso_id?: unknown; tipo?: unknown; url?: unknown };

const texto = (v: unknown) => (typeof v === 'string' ? v : null);

/** Identifica una respuesta a una push para no abrirla dos veces. */
const claveRespuesta = (r: Notifications.NotificationResponse) =>
  `${r.notification.request.identifier}:${r.actionIdentifier}`;

function RootLayoutNav() {
  const { session, initialized, isOffline } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const toast = useToast();

  const userId = session?.user?.id;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  /** Abre el boleto, la encomienda o el viaje de una push; sin recurso, la lista. */
  const abrirDesdePush = useCallback(
    async (datos: DatosPush | undefined) => {
      if (!userIdRef.current) return; // sin sesión, el login se encarga
      const abierto = await abrirRecurso(
        router,
        { recurso_tipo: texto(datos?.recurso_tipo), recurso_id: texto(datos?.recurso_id) },
        userIdRef.current
      );
      if (abierto) return;
      const url = texto(datos?.url);
      if (url?.startsWith('/')) {
        // Pushes antiguas con un enlace interno.
        router.push(url as Parameters<typeof router.push>[0]);
      } else {
        router.push('/notificaciones');
      }
    },
    [router]
  );

  // Respuestas ya abiertas: el listener y `getLastNotificationResponseAsync`
  // pueden entregar la misma al abrir la app desde una push.
  const respuestasAbiertasRef = useRef(new Set<string>());
  const abrirRespuesta = useCallback(
    (response: Notifications.NotificationResponse) => {
      // Sin sesión todavía (arranque en frío) no se marca: la abre
      // `getLastNotificationResponseAsync` cuando la sesión esté lista.
      if (!userIdRef.current) return;
      const clave = claveRespuesta(response);
      if (respuestasAbiertasRef.current.has(clave)) return;
      respuestasAbiertasRef.current.add(clave);
      void abrirDesdePush(response.notification.request.content.data as DatosPush | undefined);
    },
    [abrirDesdePush]
  );

  usePushNotifications(userId, {
    // En primer plano: aviso propio con "Ver" (no el banner del sistema).
    onNotificationReceived: (notification) => {
      const title = notification.request.content.title ?? 'Notificación';
      const body = notification.request.content.body ?? '';
      const datos = notification.request.content.data as DatosPush | undefined;
      toast.show('info', body ? `${title}: ${body}` : title, {
        accion: { label: 'Ver', onPress: () => void abrirDesdePush(datos) },
      });
    },
    onNotificationResponse: abrirRespuesta,
  });

  // App abierta desde una push estando cerrada: se mira una sola vez, cuando
  // la sesión está lista (antes no hay a quién abrirle el boleto).
  const ultimaRespuestaRevisadaRef = useRef(false);
  useEffect(() => {
    if (!initialized || !userId || ultimaRespuestaRevisadaRef.current) return;
    ultimaRespuestaRevisadaRef.current = true;
    let vigente = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!vigente || !response) return;
        // Después de la redirección inicial (login → pestañas).
        setTimeout(() => abrirRespuesta(response), 0);
      })
      .catch(() => {
        // Sin acceso al módulo nativo (p. ej. en web) no hay push que abrir.
      });
    return () => {
      vigente = false;
    };
  }, [initialized, userId, abrirRespuesta]);

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === '(auth)';
    // `auth/callback` canjea el enlace del correo o de Google: nunca se le saca
    // de ahí (empieza sin sesión y termina con ella; él mismo redirige).
    const enCallback = segments[0] === 'auth';
    // Con la sesión de recuperación hay que poder crear la contraseña nueva.
    const pantallaAuth = (segments as string[])[1];
    const permitidaConSesion = inAuthGroup && pantallaAuth === 'restablecer';

    if (enCallback) return;
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup && !permitidaConSesion) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments, router]);

  if (!initialized) return <LoadingScreen />;

  return (
    <>
      {isOffline && <OfflineBanner />}
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="perfil" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="notificaciones" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ayuda" options={{ animation: 'slide_from_bottom' }} />
        {/* Fase 4 (#50): las pantallas las crea W2-APP-CUENTA */}
        <Stack.Screen name="cuenta/contrasena" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="cuenta/eliminar" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Roobert: require('../assets/fonts/Roobert.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <ErrorBoundary>
          <ToastProvider>
            <RootLayoutNav />
          </ToastProvider>
        </ErrorBoundary>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: Sizes.iconBox.xl + Spacing.lg,
    height: Sizes.iconBox.xl + Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
});
