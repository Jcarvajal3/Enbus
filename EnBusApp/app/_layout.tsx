import "./global.css";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";
import { useEffect } from "react";
import { View } from "@/tw";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, initialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    // Verificar si estamos dentro del grupo de rutas de autenticación
    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Si no hay sesión iniciada y no estamos en Login, obligar a ir al Login.
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Si ya hay sesión iniciada y estamos en Login, mandar a Home.
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments]);

  if (!initialized) {
    return (
      <View className="flex-1 bg-background" />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="perfil" options={{ headerShown: false }} />
      <Stack.Screen name="notificaciones" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Lora-SemiBold': Lora_600SemiBold,
    'Lora-Bold': Lora_700Bold,
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
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
