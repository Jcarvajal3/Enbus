import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
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
import { BrandMark } from '@/src/components/BrandMark';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/src/components/Toast';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';
import { abrirRecurso } from '@/src/utils/notificaciones';
import { ConfirmProvider, Text } from '@/src/components/ui';
import { Colors, Motion, Sizes, Spacing, StatusPalette } from '@/src/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Con un enlace o una push en frío, la pantalla abierta tiene debajo las
 * pestañas: la ← siempre tiene adónde volver (AN-01).
 */
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

/** Solo rutas internas ("/boletos/…"): nunca "//otro-sitio" ni una URL completa. */
function volverValido(v: unknown): string | null {
  const ruta = Array.isArray(v) ? v[0] : v;
  if (typeof ruta !== 'string') return null;
  if (!ruta.startsWith('/') || ruta.startsWith('//')) return null;
  if (ruta === '/' || ruta.startsWith('/login') || ruta.startsWith('/auth')) return null;
  return ruta;
}

/**
 * La ruta pedida con su consulta, sin repetir los parámetros que ya van en el
 * camino (`[id]` de `/boletos/[id]`).
 */
function rutaPedida(
  pathname: string,
  segments: string[],
  params: Record<string, string | string[] | undefined>
): string {
  const delCamino = new Set(
    segments
      .map((seg) => /^\[(?:\.\.\.)?(.+)\]$/.exec(seg)?.[1])
      .filter((n): n is string => !!n)
  );
  const consulta = Object.entries(params)
    .filter(([k, v]) => !delCamino.has(k) && v != null && k !== 'volver')
    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v as string]).map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`))
    .join('&');
  return consulta ? `${pathname}?${consulta}` : pathname;
}

/** Duración del aviso "Conexión restaurada". */
const AVISO_CONEXION_MS = 3000;

/** Arranque mientras se recupera la sesión: la marca, con un pulso suave. */
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
      <Animated.View style={animStyle}>
        <BrandMark size={56} />
      </Animated.View>
    </View>
  );
}

/** Aviso ámbar sin conexión (SY-09): el mismo tono que el panel. */
function OfflineBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[s.offline, { paddingTop: insets.top + Spacing.sm }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <WifiSlash size={Sizes.icon.sm} color={StatusPalette.pending.text} weight="bold" />
      <Text variant="caption" weight="semibold" color={StatusPalette.pending.text}>
        Sin conexión. Ves lo último guardado.
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
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  const toast = useToast();

  // Al volver la conexión, un aviso verde de 3 s (SY-09).
  const estabaSinConexionRef = useRef(isOffline);
  useEffect(() => {
    if (estabaSinConexionRef.current && !isOffline) {
      toast.show('success', 'Conexión restaurada', { duracionMs: AVISO_CONEXION_MS });
    }
    estabaSinConexionRef.current = isOffline;
  }, [isOffline, toast]);

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
      // Un enlace sin sesión vuelve a su destino después de entrar (AN-16).
      const volver = volverValido(rutaPedida(pathname, segments as string[], params));
      router.replace(volver ? { pathname: '/(auth)/login', params: { volver } } : '/(auth)/login');
    } else if (session && inAuthGroup && !permitidaConSesion) {
      const volver = volverValido(params.volver);
      router.replace((volver ?? '/(tabs)') as Parameters<typeof router.replace>[0]);
    }
    // `pathname` y `params` se leen al decidir; no deben disparar la redirección solos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, initialized, segments, router]);

  if (!initialized) return <LoadingScreen />;

  return (
    <>
      {isOffline && <OfflineBanner />}
      {/* Una sola transición por tipo (AN-11): toda pantalla empujada entra desde
          la derecha; lo que sube desde abajo es una hoja (`BottomSheet`). Acceso,
          retorno de enlaces y pestañas cambian con un fundido. */}
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
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
            <ConfirmProvider>
              <RootLayoutNav />
            </ConfirmProvider>
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
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warningLight,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
});
