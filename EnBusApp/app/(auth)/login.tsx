import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GoogleLogo } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { supabase } from '@/src/utils/supabase';
import { useToast } from '@/src/components/Toast';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import {
  Button,
  Card,
  Field,
  Screen,
  SegmentedControl,
  Text,
} from '@/src/components/ui';
import { Colors, Layout, Radius, Sizes, Spacing } from '@/src/theme';

type Mode = 'login' | 'register';

const EMPTY_FORM = {
  email: '',
  password: '',
  confirmPassword: '',
  nombre_completo: '',
  telefono: '',
  cedula_rif: '',
};

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  };

  /** Inline validation so the user sees which field is wrong, not just a toast. */
  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!form.email.trim()) next.email = 'Ingresa tu correo.';
    if (!form.password) next.password = 'Ingresa tu contraseña.';

    if (mode === 'register') {
      if (!form.nombre_completo.trim()) next.nombre_completo = 'Ingresa tu nombre completo.';
      if (!form.telefono.trim()) next.telefono = 'Ingresa tu teléfono.';
      if (!form.cedula_rif.trim()) next.cedula_rif = 'Ingresa tu cédula o RIF.';
      if (form.password.length < 6) next.password = 'Usa al menos 6 caracteres.';
      if (form.password !== form.confirmPassword) {
        next.confirmPassword = 'Las contraseñas no coinciden.';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  async function handleSubmit() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        });
        if (error) throw error;
        toast.show('success', 'Sesión iniciada con éxito');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: {
              nombre_completo: form.nombre_completo.trim(),
              telefono: form.telefono.trim(),
              cedula_rif: form.cedula_rif.trim(),
            },
          },
        });
        if (error) throw error;

        toast.show(
          'success',
          data.session
            ? 'Cuenta creada e iniciada automáticamente'
            : 'Te enviamos un enlace de confirmación a tu correo'
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo completar la operación.';
      toast.show('error', message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: Linking.createURL('/(tabs)'),
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (__DEV__) console.error('[login] Google Sign-In:', message);
      toast.show('error', `No se pudo conectar con Google: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === 'register';

  return (
    <Screen>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <StaggerItem index={0} style={s.brand}>
            <View style={s.logo}>
              <Text variant="heading" size="2xl" weight="heavy" color="primary" compact>
                EB
              </Text>
            </View>
          </StaggerItem>

          <StaggerItem index={1} style={s.titles}>
            <Text variant="title" align="center">
              EnBus App
            </Text>
            <Text variant="body" color="muted" align="center" style={s.tagline}>
              Rastreo y compra de boletos
            </Text>
          </StaggerItem>

          <StaggerItem index={2}>
            <Card tone="sunken" padding="md" elevated={false}>
              <SegmentedControl<Mode>
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setErrors({});
                }}
                tone="raised"
                options={[
                  { value: 'login', label: 'Iniciar Sesión' },
                  { value: 'register', label: 'Registrarse' },
                ]}
                style={s.modeToggle}
              />

              {isRegister && (
                <>
                  <Field
                    label="Nombre completo"
                    placeholder="Juan Pérez"
                    value={form.nombre_completo}
                    onChangeText={(v) => update('nombre_completo', v)}
                    error={errors.nombre_completo}
                    textContentType="name"
                  />
                  <Field
                    label="Teléfono"
                    placeholder="04141234567"
                    keyboardType="phone-pad"
                    value={form.telefono}
                    onChangeText={(v) => update('telefono', v)}
                    error={errors.telefono}
                    textContentType="telephoneNumber"
                  />
                  <Field
                    label="Cédula o RIF"
                    placeholder="V-12345678"
                    value={form.cedula_rif}
                    onChangeText={(v) => update('cedula_rif', v)}
                    error={errors.cedula_rif}
                  />
                </>
              )}

              <Field
                label="Correo electrónico"
                placeholder="tu@correo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                value={form.email}
                onChangeText={(v) => update('email', v)}
                error={errors.email}
              />

              <Field
                label="Contraseña"
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                value={form.password}
                onChangeText={(v) => update('password', v)}
                error={errors.password}
                helper={isRegister && !errors.password ? 'Mínimo 6 caracteres.' : undefined}
              />

              {isRegister && (
                <Field
                  label="Confirmar contraseña"
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  value={form.confirmPassword}
                  onChangeText={(v) => update('confirmPassword', v)}
                  error={errors.confirmPassword}
                />
              )}

              {!isRegister && (
                <PressableScale
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push('/(auth)/recuperar');
                  }}
                  style={s.forgot}
                  accessibilityRole="button"
                  accessibilityLabel="Recuperar contraseña"
                >
                  <Text variant="label" color="accent">
                    ¿Olvidaste tu contraseña?
                  </Text>
                </PressableScale>
              )}

              <Button variant="accent" fullWidth loading={loading} onPress={handleSubmit}>
                {isRegister ? 'Crear Cuenta' : 'Entrar'}
              </Button>

              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text variant="overline" color="muted" uppercase>
                  O continuar con
                </Text>
                <View style={s.dividerLine} />
              </View>

              <Button
                variant="outline"
                icon={GoogleLogo}
                fullWidth
                disabled={loading}
                onPress={handleGoogleSignIn}
              >
                Google
              </Button>
            </Card>
          </StaggerItem>
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
    paddingVertical: Spacing['5xl'],
  },
  brand: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logo: {
    width: Sizes.iconBox.xl + Spacing.lg,
    height: Sizes.iconBox.xl + Spacing.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    marginBottom: Spacing['3xl'],
  },
  tagline: {
    marginTop: Spacing.xs,
  },
  modeToggle: {
    marginBottom: Spacing.xl,
  },
  forgot: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: Sizes.hairline,
    backgroundColor: Colors.border,
  },
});
