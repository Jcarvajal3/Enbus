import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
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
} from 'react-native-reanimated';
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/src/components/Toast';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';
import { Text } from '@/src/components/ui';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

SplashScreen.preventAutoHideAsync();

/** Branded splash shown while the session is being restored. */
function LoadingScreen() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.duration.ambient, easing: Motion.easing.inOut }),
        withTiming(0, { duration: Motion.duration.ambient, easing: Motion.easing.inOut })
      ),
      -1,
      false
    );
  }, [pulse]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + pulse.value * 0.4,
    transform: [{ scale: 0.95 + pulse.value * 0.09 }],
  }));

  return (
    <View style={s.splash}>
      <Animated.View style={[s.splashLogo, animStyle]}>
        <Text variant="title" size="2xl" weight="heavy" color="primary" compact>
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

function RootLayoutNav() {
  const { session, initialized, isOffline } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const toast = useToast();

  usePushNotifications(session?.user?.id, {
    onNotificationReceived: (notification) => {
      const title = notification.request.content.title ?? 'Notificación';
      const body = notification.request.content.body ?? '';
      toast.show('info', body ? `${title}: ${body}` : title);
    },
    onNotificationResponse: () => router.push('/notificaciones'),
  });

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments, router]);

  if (!initialized) return <LoadingScreen />;

  return (
    <>
      {isOffline && <OfflineBanner />}
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="perfil" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="notificaciones" options={{ animation: 'slide_from_bottom' }} />
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
