import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { supabase } from '@/src/utils/supabase';
import { useToast } from '@/src/components/Toast';
import { Button, Card, Field, Screen, ScreenHeader, Text } from '@/src/components/ui';
import { Layout, Spacing } from '@/src/theme';

export default function RecuperarPasswordScreen() {
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleResetPassword() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!email.trim()) {
      setError('Ingresa el correo de tu cuenta.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    try {
      setLoading(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: Linking.createURL('recuperar'),
      });
      if (resetError) throw resetError;

      toast.show('success', 'Te enviamos un enlace para restablecer tu contraseña.');
      router.back();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo enviar el correo de recuperación.';
      if (__DEV__) console.error('[recuperar] Error:', message);
      toast.show('error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader variant="compact" title="Recuperar contraseña" onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Card tone="sunken" padding="md" elevated={false}>
            <Text variant="secondary" color="muted" style={s.intro}>
              Ingresa el correo electrónico asociado a tu cuenta de EnBus. Te enviaremos un enlace
              para que puedas restablecer tu contraseña.
            </Text>

            <Field
              label="Correo electrónico"
              placeholder="tu@correo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (error) setError(undefined);
              }}
              editable={!loading}
              error={error}
            />

            <Button variant="accent" fullWidth loading={loading} onPress={handleResetPassword}>
              Enviar enlace
            </Button>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing['5xl'],
  },
  intro: {
    marginBottom: Spacing.xl,
  },
});
