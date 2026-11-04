import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GoogleLogo, WarningCircle, X } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { codigoEB, humanizeError, isNetworkError } from '@/src/utils/errores';
import { completarSesionDesdeUrl, redirectAuth } from '@/src/utils/authLinks';
import {
  MENSAJE_CEDULA,
  MENSAJE_TELEFONO,
  cedulaParaGuardar,
  cedulaValida,
  nombreValido,
  sanitizeText,
  telefonoParaGuardar,
  telefonoValido,
} from '@/src/utils/validation';
import { useToast } from '@/src/components/Toast';
import { StaggerItem } from '@/src/components/StaggerItem';
import { BrandMark } from '@/src/components/BrandMark';
import { CedulaField } from '@/src/components/CedulaField';
import { TelefonoField } from '@/src/components/TelefonoField';
import {
  Atmosfera,
  Button,
  Card,
  Field,
  IconButton,
  Screen,
  SegmentedControl,
  Text,
  TextLink,
} from '@/src/components/ui';
import { CLAVE_AYUDA, CLAVE_ERROR, CLAVE_MINIMO } from '@/src/utils/formatters';
import { Colors, Layout, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

// Cierra la ventana del navegador si la app se abrió desde la redirección (web).
WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'register';

const EMPTY_FORM = {
  email: '',
  password: '',
  confirmPassword: '',
  nombre_completo: '',
  telefono: '',
  cedula_rif: '',
};

const ERROR_GOOGLE = 'No pudimos entrar con Google. Intenta de nuevo o usa tu correo y contraseña.';

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `?volver=` (AN-16): la ruta interna que se pidió sin sesión. Solo rutas que
 * empiezan por "/" (nunca "//otro-sitio" ni una URL completa). Tras entrar,
 * `app/_layout.tsx` hace `replace(volver ?? '/(tabs)')`; aquí se conserva al
 * pasar por recuperar o "Revisa tu correo".
 */
function leerVolver(v: string | string[] | undefined): string | undefined {
  const ruta = Array.isArray(v) ? v[0] : v;
  if (typeof ruta !== 'string' || !ruta.startsWith('/') || ruta.startsWith('//')) return undefined;
  return ruta;
}

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();
  // "Usar otro correo" desde "Revisa tu correo" vuelve directo a "Crear cuenta".
  const params = useLocalSearchParams<{ modo?: string; volver?: string }>();
  const volver = leerVolver(params.volver);

  const [mode, setMode] = useState<Mode>(params.modo === 'registro' ? 'register' : 'login');
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const cedulaRef = useRef<TextInput>(null);
  const telefonoRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const busy = loading || googleLoading;
  /** Anti doble toque: el estado `busy` llega un render tarde; la ref no. */
  const enCursoRef = useRef(false);

  // Fase 4 (#50): por qué se cerró la sesión sin pedirlo ("Esta cuenta fue
  // eliminada."). Se copia aquí y se limpia del contexto para no repetirlo.
  const { avisoSesion, limpiarAvisoSesion } = useAuth();
  const [aviso, setAviso] = useState<string | null>(avisoSesion);
  useEffect(() => {
    if (!avisoSesion) return;
    setAviso(avisoSesion);
    limpiarAvisoSesion();
  }, [avisoSesion, limpiarAvisoSesion]);

  const update = (key: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  };

  /** Inline validation so the user sees which field is wrong, not just a toast. */
  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const email = form.email.trim();

    if (!email) next.email = 'Escribe tu correo.';
    else if (!CORREO_RE.test(email)) next.email = 'Ese correo no parece válido. Revísalo.';
    if (!form.password) next.password = 'Escribe tu contraseña.';

    if (mode === 'register') {
      if (!nombreValido(form.nombre_completo)) next.nombre_completo = 'Escribe tu nombre y apellido.';
      if (!cedulaValida(form.cedula_rif)) next.cedula_rif = MENSAJE_CEDULA;
      if (!telefonoValido(form.telefono)) next.telefono = MENSAJE_TELEFONO;
      if (form.password && form.password.length < CLAVE_MINIMO) next.password = CLAVE_ERROR;
      if (form.password !== form.confirmPassword) {
        next.confirmPassword = 'Las contraseñas no coinciden.';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  async function handleSubmit() {
    if (busy || enCursoRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const email = form.email.trim();
    enCursoRef.current = true;
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        });
        if (error) throw error;
        // Sin toast: el cambio de sesión lleva a Inicio, y eso ya lo dice todo.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: form.password,
          options: {
            emailRedirectTo: redirectAuth('registro'),
            data: {
              nombre_completo: sanitizeText(form.nombre_completo),
              telefono: telefonoParaGuardar(form.telefono),
              cedula_rif: cedulaParaGuardar(form.cedula_rif),
            },
          },
        });
        if (error) throw error;

        // Con "Confirmar correo" activo no hay sesión: hay que abrir el enlace.
        if (!data.session) {
          router.replace({
            pathname: '/revisa-correo',
            params: { email, tipo: 'registro', ...(volver ? { volver } : {}) },
          });
        }
      }
    } catch (err) {
      if (__DEV__) console.error(`[login] ${mode}:`, err);
      const code = (err as { code?: string } | null)?.code;
      if (mode === 'login' && code === 'email_not_confirmed') {
        // Sin confirmar: llevarlo a la pantalla que permite reenviar el enlace.
        // `enviado: '0'`: el correo se mandó al registrarse; puede reenviarlo ya.
        router.push({
          pathname: '/revisa-correo',
          params: { email, tipo: 'registro', enviado: '0', ...(volver ? { volver } : {}) },
        });
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', humanizeError(err, mode === 'login' ? 'login' : 'registro'));
    } finally {
      enCursoRef.current = false;
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (busy || enCursoRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    enCursoRef.current = true;
    setGoogleLoading(true);
    try {
      const redirectTo = redirectAuth('google');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Sin URL de Google');

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      // Cerró la ventana o volvió atrás: no es un error, no decimos nada.
      if (res.type !== 'success') return;

      const resultado = await completarSesionDesdeUrl(res.url);
      if (!resultado.ok && !resultado.cancelado) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.show('error', resultado.error);
      }
      // Con sesión, el guard de `app/_layout.tsx` lleva a Inicio.
    } catch (err) {
      if (__DEV__) console.error('[login] Google:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(
        'error',
        isNetworkError(err) || codigoEB(err) ? humanizeError(err, 'login') : ERROR_GOOGLE
      );
    } finally {
      enCursoRef.current = false;
      setGoogleLoading(false);
    }
  }

  const isRegister = mode === 'register';

  return (
    <Screen atmosfera={null}>
      <Atmosfera variante="amanecer" style={s.portada} />
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
            <BrandMark size={56} conNombre />
          </StaggerItem>

          {aviso ? (
            <View
              style={s.aviso}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <WarningCircle color={Colors.warningText} weight="fill" size={Sizes.icon.lg} />
              <Text variant="secondary" style={s.avisoTexto}>
                {aviso}
              </Text>
              <IconButton
                icon={X}
                label="Cerrar aviso"
                onPress={() => setAviso(null)}
                color={Colors.mutedForeground}
              />
            </View>
          ) : null}

          <StaggerItem index={1}>
            <Card padding="md" style={s.tarjeta}>
              <SegmentedControl<Mode>
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setErrors({});
                }}
                options={[
                  { value: 'login', label: 'Entrar' },
                  { value: 'register', label: 'Crear cuenta' },
                ]}
                style={s.modeToggle}
              />

              {isRegister && (
                <>
                  <Field
                    label="Nombre y apellido"
                    placeholder="Ej. María Pérez"
                    value={form.nombre_completo}
                    onChangeText={(v) => update('nombre_completo', v)}
                    error={errors.nombre_completo}
                    autoComplete="name"
                    textContentType="name"
                    autoCapitalize="words"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => cedulaRef.current?.focus()}
                    editable={!busy}
                  />
                  <CedulaField
                    ref={cedulaRef}
                    value={form.cedula_rif}
                    onChangeText={(v) => update('cedula_rif', v)}
                    error={errors.cedula_rif}
                    returnKeyType="next"
                    onSubmitEditing={() => telefonoRef.current?.focus()}
                    editable={!busy}
                  />
                  <TelefonoField
                    ref={telefonoRef}
                    value={form.telefono}
                    onChangeText={(v) => update('telefono', v)}
                    error={errors.telefono}
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    editable={!busy}
                  />
                </>
              )}

              <Field
                ref={emailRef}
                label="Correo"
                placeholder="Ej. tu@correo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                value={form.email}
                onChangeText={(v) => update('email', v)}
                error={errors.email}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!busy}
              />

              <Field
                ref={passwordRef}
                label="Contraseña"
                placeholder={isRegister ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                textContentType={isRegister ? 'newPassword' : 'password'}
                value={form.password}
                onChangeText={(v) => update('password', v)}
                error={errors.password}
                helper={isRegister ? CLAVE_AYUDA : undefined}
                returnKeyType={isRegister ? 'next' : 'go'}
                submitBehavior={isRegister ? 'submit' : 'blurAndSubmit'}
                onSubmitEditing={() =>
                  isRegister ? confirmRef.current?.focus() : handleSubmit()
                }
                editable={!busy}
              />

              {isRegister && (
                <Field
                  ref={confirmRef}
                  label="Repite la contraseña"
                  placeholder="Escríbela otra vez"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={form.confirmPassword}
                  onChangeText={(v) => update('confirmPassword', v)}
                  error={errors.confirmPassword}
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                  editable={!busy}
                />
              )}

              {!isRegister && (
                <View style={s.forgot}>
                  <TextLink
                    onPress={() => {
                      const email = form.email.trim();
                      router.push({
                        pathname: '/recuperar',
                        params: { ...(email ? { email } : {}), ...(volver ? { volver } : {}) },
                      });
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </TextLink>
                </View>
              )}

              <Button
                fullWidth
                loading={loading}
                disabled={googleLoading}
                onPress={handleSubmit}
              >
                {isRegister ? 'Crear cuenta' : 'Entrar'}
              </Button>

              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text variant="caption" color="muted">
                  o
                </Text>
                <View style={s.dividerLine} />
              </View>

              <Button
                variant="outline"
                icon={GoogleLogo}
                fullWidth
                loading={googleLoading}
                disabled={loading}
                onPress={handleGoogleSignIn}
              >
                Continuar con Google
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
  portada: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 620,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing['3xl'],
  },
  brand: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  tarjeta: {
    ...Shadows.raised,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingLeft: Spacing.lg,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.warningLight,
  },
  avisoTexto: {
    flex: 1,
  },
  modeToggle: {
    marginBottom: Spacing.xl,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.sm,
    marginBottom: Spacing.xs,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: Sizes.hairline,
    backgroundColor: Colors.border,
  },
});
