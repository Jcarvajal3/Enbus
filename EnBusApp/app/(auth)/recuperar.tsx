import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/src/utils/supabase';
import { humanizeError } from '@/src/utils/errores';
import { redirectAuth } from '@/src/utils/authLinks';
import { useVolver } from '@/src/hooks/useVolver';
import { useToast } from '@/src/components/Toast';
import { Button, Card, Field, Screen, ScreenHeader, scrollContent } from '@/src/components/ui';
import { Spacing } from '@/src/theme';

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecuperarPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  // Si viene del login con el correo escrito, no hay que escribirlo otra vez.
  const params = useLocalSearchParams<{ email?: string; volver?: string }>();
  const volver = typeof params.volver === 'string' ? params.volver : undefined;
  const login = useMemo<Href>(
    () => (volver ? { pathname: '/login', params: { volver } } : '/login'),
    [volver]
  );
  const atras = useVolver(login);

  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  /** Anti doble toque: Supabase limita los correos por hora; un segundo envío falla. */
  const enviandoRef = useRef(false);

  async function handleResetPassword() {
    if (loading || enviandoRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const correo = email.trim();
    if (!correo || !CORREO_RE.test(correo)) {
      setError(correo ? 'Ese correo no parece válido. Revísalo.' : 'Escribe el correo de tu cuenta.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    enviandoRef.current = true;
    try {
      setLoading(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(correo, {
        redirectTo: redirectAuth('recuperar'),
      });
      if (resetError) throw resetError;

      router.replace({
        pathname: '/revisa-correo',
        params: { email: correo, tipo: 'recuperar', ...(volver ? { volver } : {}) },
      });
    } catch (err) {
      if (__DEV__) console.error('[recuperar] Error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', humanizeError(err, 'recuperar'));
    } finally {
      enviandoRef.current = false;
      setLoading(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader variant="compact" title="Recuperar contraseña" onBack={atras} />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={scrollContent({ top: Spacing['2xl'] })}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Card tone="sunken" padding="md">
            <Field
              label="Correo"
              placeholder="Ej. tu@correo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (error) setError(undefined);
              }}
              returnKeyType="send"
              onSubmitEditing={handleResetPassword}
              editable={!loading}
              error={error}
            />

            <Button fullWidth loading={loading} onPress={handleResetPassword}>
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
});
