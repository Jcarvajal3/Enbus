import { SafeAreaView, View, Text } from '@/tw';
import { useState, useEffect } from 'react';
import { StyleSheet, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/utils/supabase';
import { Spinner } from '@/src/components/Spinner';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { GoogleLogo, Eye, EyeSlash } from 'phosphor-react-native';
import * as Linking from 'expo-linking';
import { PressableScale } from '@/src/components/PressableScale';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Radius, Shadows, Spacing } from '@/src/theme';

type Mode = 'login' | 'register';

function Field({
  label,
  secureTextEntry,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = secureTextEntry;
  const actualSecureTextEntry = isPassword ? !showPassword : false;

  return (
    <View style={s.fieldWrapper}>
      <Text style={s.fieldLabel}>
        {label}
      </Text>
      <View style={s.inputContainer}>
        <TextInput
          placeholderTextColor={Colors.mutedForeground}
          style={s.fieldInput}
          secureTextEntry={actualSecureTextEntry}
          {...props}
        />
        {isPassword && (
          <PressableScale
            onPress={() => {
              Haptics.selectionAsync();
              setShowPassword(!showPassword);
            }}
            style={s.eyeButton}
            accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            accessibilityRole="button"
          >
            {showPassword ? (
              <EyeSlash color={Colors.mutedForeground} size={20} />
            ) : (
              <Eye color={Colors.mutedForeground} size={20} />
            )}
          </PressableScale>
        )}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    nombre_completo: '',
    telefono: '',
    cedula_rif: '',
  });
  const [loading, setLoading] = useState(false);
  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // ── P2: Stagger entry animation ──────────────────────────────────────────
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.88);
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(10);
  const cardOpacity = useSharedValue(0);
  const cardY = useSharedValue(16);

  useEffect(() => {
    const easeOut = Easing.out(Easing.cubic);
    // 1. Logo
    logoOpacity.value = withTiming(1, { duration: 320, easing: easeOut });
    logoScale.value = withSpring(1, { damping: 14, stiffness: 140 });
    // 2. Título
    titleOpacity.value = withDelay(80, withTiming(1, { duration: 300, easing: easeOut }));
    titleY.value = withDelay(80, withTiming(0, { duration: 300, easing: easeOut }));
    // 3. Card formulario
    cardOpacity.value = withDelay(160, withTiming(1, { duration: 340, easing: easeOut }));
    cardY.value = withDelay(160, withTiming(0, { duration: 340, easing: easeOut }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mode === 'login') {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) {
        toast.show('error', error.message);
      } else {
        toast.show('success', 'Sesión iniciada con éxito');
      }
      setLoading(false);
    } else {
      if (
        !form.nombre_completo ||
        !form.telefono ||
        !form.cedula_rif ||
        !form.email ||
        !form.password
      ) {
        toast.show('error', 'Todos los campos son obligatorios');
        return;
      }
      if (form.password !== form.confirmPassword) {
        toast.show('error', 'Las contraseñas no coinciden');
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            nombre_completo: form.nombre_completo,
            telefono: form.telefono,
            cedula_rif: form.cedula_rif,
          },
        },
      });
      if (error) {
        toast.show('error', error.message);
      } else if (data.session) {
        toast.show('success', 'Cuenta creada e iniciada automáticamente');
      } else {
        toast.show('success', 'Se ha enviado un enlace de confirmación a su correo');
      }
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setLoading(true);
      toast.show('info', 'Iniciando sesión con Google...');
      const redirectUrl = Linking.createURL('/(tabs)');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('Google Sign-In Error:', err.message);
      toast.show('error', 'Error al conectar con Google: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
        >
          {/* Logo animado */}
          <Animated.View style={[s.logoAnimatedWrapper, logoStyle]}>
            <View style={s.logoBubble}>
              <Text style={s.logoText}>
                EB
              </Text>
            </View>
          </Animated.View>

          {/* Título animado */}
          <Animated.View style={[s.titleAnimatedWrapper, titleStyle]}>
            <Text style={s.appTitle}>
              EnBus App
            </Text>
            <Text style={s.appSubtitle}>
              Rastreo y Compra de Boletos
            </Text>
          </Animated.View>

          {/* Card formulario animada */}
          <Animated.View style={cardStyle}>
            <View style={s.card}>
              {/* Toggle login/register */}
              <View style={s.toggleRow}>
                <PressableScale
                  onPress={() => {
                    Haptics.selectionAsync();
                    setMode('login');
                  }}
                  style={[
                    s.toggleTab,
                    { backgroundColor: mode === 'login' ? Colors.white : 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      s.toggleTabText,
                      {
                        fontWeight: mode === 'login' ? Typography.weights.bold : Typography.weights.semibold,
                        color: mode === 'login' ? Colors.foreground : Colors.mutedForeground,
                      },
                    ]}
                  >
                    Iniciar Sesión
                  </Text>
                </PressableScale>
                <PressableScale
                  onPress={() => {
                    Haptics.selectionAsync();
                    setMode('register');
                  }}
                  style={[
                    s.toggleTab,
                    { backgroundColor: mode === 'register' ? Colors.white : 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      s.toggleTabText,
                      {
                        fontWeight: mode === 'register' ? Typography.weights.bold : Typography.weights.semibold,
                        color: mode === 'register' ? Colors.foreground : Colors.mutedForeground,
                      },
                    ]}
                  >
                    Registrarse
                  </Text>
                </PressableScale>
              </View>

              {mode === 'register' && (
                <>
                  <Field
                    label="Nombre Completo"
                    placeholder="Juan Pérez"
                    value={form.nombre_completo}
                    onChangeText={(v) => update('nombre_completo', v)}
                  />
                  <Field
                    label="Teléfono"
                    placeholder="04141234567"
                    keyboardType="phone-pad"
                    value={form.telefono}
                    onChangeText={(v) => update('telefono', v)}
                  />
                  <Field
                    label="Cédula o RIF"
                    placeholder="V-12345678"
                    value={form.cedula_rif}
                    onChangeText={(v) => update('cedula_rif', v)}
                  />
                </>
              )}

              <Field
                label="Correo Electrónico"
                placeholder="tu@correo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.email}
                onChangeText={(v) => update('email', v)}
              />
              <Field
                label="Contraseña"
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                value={form.password}
                onChangeText={(v) => update('password', v)}
              />

              {mode === 'register' && (
                <Field
                  label="Confirmar Contraseña"
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  value={form.confirmPassword}
                  onChangeText={(v) => update('confirmPassword', v)}
                />
              )}

              {mode === 'login' && (
                <PressableScale
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push('/(auth)/recuperar' as any);
                  }}
                  style={s.forgotPasswordBtn}
                >
                  <Text style={s.forgotPasswordText}>
                    ¿Olvidaste tu contraseña?
                  </Text>
                </PressableScale>
              )}

              {/* Botón principal */}
              <PressableScale
                onPress={handleSubmit}
                disabled={loading}
                haptic
                hapticType="medium"
                style={[s.submitBtn, { opacity: loading ? 0.6 : 1 }]}
              >
                {loading ? (
                  <Spinner />
                ) : (
                  <Text style={s.submitBtnText}>
                    {mode === 'login' ? 'Entrar' : 'Crear Cuenta'}
                  </Text>
                )}
              </PressableScale>

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>
                  O continuar con
                </Text>
                <View style={s.dividerLine} />
              </View>

              {/* Google */}
              <PressableScale
                onPress={handleGoogleSignIn}
                disabled={loading}
                haptic
                style={s.googleBtn}
              >
                <GoogleLogo size={20} color={Colors.foreground} weight="bold" />
                <Text style={s.googleBtnText}>
                  Google
                </Text>
              </PressableScale>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // ── Field component ────────────────────────────────────────────────────────
  fieldWrapper: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.foreground,
    fontFamily: Typography.family,
    marginBottom: 6,
    marginLeft: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    height: 48,
    paddingLeft: 20,
    paddingRight: 8,
  },
  fieldInput: {
    flex: 1,
    height: '100%',
    fontSize: Typography.sizes.base,
    color: Colors.foreground,
    fontFamily: Typography.family,
  },
  eyeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Screen layout ──────────────────────────────────────────────────────────
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing['5xl'],
  },

  // ── Logo ───────────────────────────────────────────────────────────────────
  logoAnimatedWrapper: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBubble: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: Typography.sizes['2xl'],
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },

  // ── Title block ────────────────────────────────────────────────────────────
  titleAnimatedWrapper: {
    alignItems: 'center',
    marginBottom: 28,
  },
  appTitle: {
    fontSize: Typography.sizes['3xl'],
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
  appSubtitle: {
    fontSize: 16,
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Form card ──────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    padding: 20,
  },

  // ── Login / Register toggle ────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceDark,
    borderRadius: Radius.full,
    padding: 4,
    marginBottom: 20,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  toggleTabText: {
    fontSize: 14,
    fontFamily: Typography.family,
  },

  // ── Forgot password link ───────────────────────────────────────────────────
  forgotPasswordBtn: {
    alignSelf: 'flex-end',
    marginTop: 4,
    marginBottom: 16,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.accent,
  },

  // ── Submit button ──────────────────────────────────────────────────────────
  submitBtn: {
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    backgroundColor: Colors.accent,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.white,
  },

  // ── Divider ────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: Typography.sizes.xs,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  // ── Google button ──────────────────────────────────────────────────────────
  googleBtn: {
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    gap: 12,
  },
  googleBtnText: {
    fontSize: Typography.sizes.base,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
});
