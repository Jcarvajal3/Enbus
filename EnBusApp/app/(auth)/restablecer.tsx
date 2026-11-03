/**
 * Crear una contraseña nueva (#23, M-01, APP-06). Se llega desde el enlace de
 * "Recuperar contraseña": `auth/callback` canjea el código (queda una sesión
 * de recuperación) y trae aquí. Sin sesión, explica cómo volver a intentarlo.
 */

import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinkBreak } from 'phosphor-react-native';
import { supabase } from '@/src/utils/supabase';
import { humanizeError } from '@/src/utils/errores';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Screen,
  ScreenHeader,
  Text,
} from '@/src/components/ui';
import { Layout, Spacing } from '@/src/theme';

const MIN_CLAVE = 6;

export default function RestablecerScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();

  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState<{ clave?: string; repetir?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const repetirRef = useRef<TextInput>(null);

  async function guardar() {
    if (guardando) return;
    const next: typeof errores = {};
    if (clave.length < MIN_CLAVE) next.clave = `Usa al menos ${MIN_CLAVE} caracteres.`;
    if (clave !== repetir) next.repetir = 'Las contraseñas no coinciden.';
    setErrores(next);
    if (Object.keys(next).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setGuardando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: clave });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Listo. Ya puedes entrar con tu nueva contraseña.');
      router.replace('/(tabs)');
    } catch (err) {
      if (__DEV__) console.error('[restablecer] updateUser:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', humanizeError(err, 'recuperar'));
    } finally {
      setGuardando(false);
    }
  }

  if (!session) {
    return (
      <Screen>
        <ScreenHeader
          variant="compact"
          title="Contraseña nueva"
          onBack={() => router.replace('/login')}
        />
        <EmptyState
          icon={LinkBreak}
          title="Abre el enlace desde este teléfono"
          description="Abre el enlace del correo desde este teléfono para cambiar tu contraseña."
          action={{
            children: 'Pedir otro enlace',
            variant: 'accent',
            onPress: () => router.replace('/recuperar'),
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        variant="compact"
        title="Contraseña nueva"
        onBack={() => {
          if (!guardando) router.replace('/(tabs)');
        }}
      />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="title" accessibilityRole="header">
            Crea una contraseña nueva
          </Text>
          <Text variant="secondary" color="muted" style={s.intro}>
            La usarás para entrar a EnBus desde ahora.
          </Text>

          <Card tone="sunken" padding="md" elevated={false}>
            <Field
              label="Contraseña nueva"
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              value={clave}
              onChangeText={(v) => {
                setClave(v);
                if (errores.clave) setErrores((p) => ({ ...p, clave: undefined }));
              }}
              error={errores.clave}
              helper={`Mínimo ${MIN_CLAVE} caracteres.`}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => repetirRef.current?.focus()}
              editable={!guardando}
            />

            <Field
              ref={repetirRef}
              label="Repite la contraseña"
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              value={repetir}
              onChangeText={(v) => {
                setRepetir(v);
                if (errores.repetir) setErrores((p) => ({ ...p, repetir: undefined }));
              }}
              error={errores.repetir}
              returnKeyType="done"
              onSubmitEditing={guardar}
              editable={!guardando}
            />

            <Button variant="accent" fullWidth loading={guardando} onPress={guardar}>
              Guardar contraseña
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
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
});
