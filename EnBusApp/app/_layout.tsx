import "./global.css";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";
import { useEffect } from "react";
import { View, Text } from "@/tw";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useToast } from "@/src/components/Toast";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { ToastProvider } from "@/src/components/Toast";
import { usePushNotifications } from "@/src/hooks/usePushNotifications";
import { Colors, Typography } from "@/src/theme";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

SplashScreen.preventAutoHideAsync();

/** Pantalla de carga animada con branding actualizado */
function LoadingScreen() {
  const opacity = useSharedValue(0.6);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    const easeInOut = Easing.inOut(Easing.ease);
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: easeInOut }),
        withTiming(0.6, { duration: 800, easing: easeInOut })
      ),
      -1,
      false
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 800, easing: easeInOut }),
        withTiming(0.95, { duration: 800, easing: easeInOut })
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={ls.container}>
      <Animated.View style={[ls.logoBox, animStyle]}>
        <Text style={ls.logoText}>EB</Text>
      </Animated.View>
    </View>
  );
}

const ls = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 28,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },
});

function RootLayoutNav() {
  const { session, initialized, isOffline } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const firstSegment = segments[0];

  const toast = useToast();

  usePushNotifications(session?.user?.id, {
    onNotificationReceived: (notification) => {
      const title = notification.request.content.title ?? 'Notificación';
      const body = notification.request.content.body ?? '';
      const message = body ? `${title}: ${body}` : title;
      toast.show('info', message);
    },
    onNotificationResponse: () => {
      router.push('/notificaciones');
    },
  });

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = firstSegment === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, firstSegment]);

  if (!initialized) {
    return <LoadingScreen />;
  }

  return (
    <>
      {isOffline && (
        <View style={{
          backgroundColor: Colors.warning,
          paddingVertical: 6,
          paddingHorizontal: 16,
          alignItems: 'center',
        }}>
          <Text style={{ color: Colors.foreground, fontSize: 12, fontWeight: '700', fontFamily: Typography.family }}>
            Sin conexión — mostrando datos guardados
          </Text>
        </View>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="perfil" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="notificaciones" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Roobert': require('../assets/fonts/Roobert.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
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
