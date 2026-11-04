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
import { CLAVE_AYUDA, CLAVE_ERROR, CLAVE_MINIMO } from '@/src/utils/formatters';
import { useAuth } from '@/src/contexts/AuthContext';
import { useVolver } from '@/src/hooks/useVolver';
import { useToast } from '@/src/components/Toast';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Screen,
  ScreenHeader,
  scrollContent,
} from '@/src/components/ui';
import { Spacing } from '@/src/theme';

export default function RestablecerScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  // Con la sesión de recuperación, ← sale a Inicio (ya está dentro); sin ella, al login.
  const salirConSesion = useVolver('/(tabs)');
  const salirSinSesion = useVolver('/login');

  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState<{ clave?: string; repetir?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const repetirRef = useRef<TextInput>(null);

  async function guardar() {
    if (guardando) return;
    const next: typeof errores = {};
    if (clave.length < CLAVE_MINIMO) next.clave = CLAVE_ERROR;
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
      toast.show('success', 'Listo. Guardamos tu contraseña nueva.');
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
        <ScreenHeader variant="compact" title="Contraseña nueva" onBack={salirSinSesion} />
        <ScrollView
          contentContainerStyle={scrollContent({ top: 0 })}
          showsVerticalScrollIndicator={false}
        >
          <EmptyState
            icon={LinkBreak}
            title="Abre el enlace desde este teléfono"
            description="El enlace del correo solo funciona en el teléfono donde lo pediste."
            action={{ children: 'Pedir otro enlace', onPress: () => router.replace('/recuperar') }}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        variant="compact"
        title="Contraseña nueva"
        onBack={() => {
          if (!guardando) salirConSesion();
        }}
      />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={scrollContent({ top: Spacing['2xl'] })}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Card padding="md">
            <Field
              label="Contraseña nueva"
              placeholder="Mínimo 8 caracteres"
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
              helper={CLAVE_AYUDA}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => repetirRef.current?.focus()}
              editable={!guardando}
            />

            <Field
              ref={repetirRef}
              label="Repite la contraseña"
              placeholder="Escríbela otra vez"
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

            <Button fullWidth loading={guardando} onPress={guardar}>
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
});
