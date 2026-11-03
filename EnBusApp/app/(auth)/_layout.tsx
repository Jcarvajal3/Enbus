import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="recuperar" />
      <Stack.Screen name="revisa-correo" options={{ gestureEnabled: false }} />
      <Stack.Screen name="restablecer" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
