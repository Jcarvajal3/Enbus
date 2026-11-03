/**
 * Cambiar contraseña (#50, M-56, APP-52). Se abre desde Perfil › Cuenta.
 *
 * - Cuenta con contraseña (proveedor `email`): pide la actual y la verifica con
 *   `signInWithPassword` antes de `updateUser` (Supabase no la pide, y así nadie
 *   la cambia con el teléfono desbloqueado de otro).
 * - Cuenta solo de Google: "Crear una contraseña", para entrar también con el
 *   correo.
 */
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';
import { GoogleLogo } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { tieneContrasena } from '@/src/hooks/usePerfil';
import { MSG, humanizeError } from '@/src/utils/errores';
import { CLAVE_AYUDA, CLAVE_ERROR, CLAVE_MINIMO } from '@/src/utils/formatters';
import { useVolver } from '@/src/hooks/useVolver';
import { useToast } from '@/src/components/Toast';
import {
  Button,
  Card,
  Field,
  Screen,
  ScreenHeader,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { Colors, Sizes, Spacing } from '@/src/theme';

type Campo = 'actual' | 'nueva' | 'repetir';
type Errores = Partial<Record<Campo, string>>;

/** Código de un error de Supabase Auth (`invalid_credentials`, `same_password`…). */
function codigoAuth(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function esCredencialIncorrecta(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return codigoAuth(err) === 'invalid_credentials' || msg.includes('invalid login credentials');
}

export default function ContrasenaScreen() {
  const atras = useVolver('/perfil');
  const toast = useToast();
  const { user } = useAuth();

  const conContrasena = tieneContrasena(user);
  const correo = user?.email ?? '';
  const titulo = conContrasena ? 'Cambiar contraseña' : 'Crear una contraseña';

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [guardando, setGuardando] = useState(false);

  const nuevaRef = useRef<TextInput>(null);
  const repetirRef = useRef<TextInput>(null);

  const limpiar = (campo: Campo) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

  const validar = (): boolean => {
    const next: Errores = {};
    if (conContrasena && !actual) next.actual = 'Escribe tu contraseña actual.';
    if (!nueva) next.nueva = 'Escribe la contraseña nueva.';
    else if (nueva.length < CLAVE_MINIMO) next.nueva = CLAVE_ERROR;
    if (nueva && repetir !== nueva) next.repetir = 'Las contraseñas no coinciden.';
    setErrores(next);
    return Object.keys(next).length === 0;
  };

  async function guardar() {
    if (guardando) return;
    if (!validar()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (!correo) {
      toast.show('error', MSG.sesionVencida);
      return;
    }

    setGuardando(true);
    try {
      if (conContrasena) {
        const { error } = await supabase.auth.signInWithPassword({ email: correo, password: actual });
        if (error) {
          if (esCredencialIncorrecta(error)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setErrores({ actual: 'La contraseña actual no es correcta.' });
            return;
          }
          throw error;
        }
      }

      const { error } = await supabase.auth.updateUser({ password: nueva });
      if (error) {
        const code = codigoAuth(error);
        if (code === 'same_password' || code === 'weak_password') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setErrores({ nueva: humanizeError(error, 'contrasena') });
          return;
        }
        if (code === 'reauthentication_needed') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          toast.show(
            'error',
            'Por seguridad, cierra sesión y vuelve a entrar con Google; después crea tu contraseña.'
          );
          return;
        }
        throw error;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(
        'success',
        conContrasena
          ? 'Listo. Tu contraseña cambió.'
          : 'Listo. Ya puedes entrar también con tu correo y tu contraseña.'
      );
      atras();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No pudimos guardar la contraseña. ${humanizeError(err, 'contrasena')}`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader variant="compact" title={titulo} onBack={atras} />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={scrollContent({ top: Spacing['2xl'] })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!conContrasena ? (
            <Card tone="outline" padding="md" style={s.intro}>
              <View style={s.introRow}>
                <GoogleLogo size={Sizes.icon.lg} color={Colors.foreground} weight="bold" />
                <Text variant="secondary" style={s.introText}>
                  {`Entras con Google. Con una contraseña también podrás entrar con ${correo}.`}
                </Text>
              </View>
            </Card>
          ) : null}

          <Card tone="sunken" padding="md">
            {conContrasena ? (
              <Field
                label="Contraseña actual"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                value={actual}
                onChangeText={(v) => {
                  setActual(v);
                  limpiar('actual');
                }}
                error={errores.actual}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => nuevaRef.current?.focus()}
                editable={!guardando}
              />
            ) : null}

            <Field
              ref={nuevaRef}
              label="Contraseña nueva"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              value={nueva}
              onChangeText={(v) => {
                setNueva(v);
                limpiar('nueva');
              }}
              error={errores.nueva}
              helper={CLAVE_AYUDA}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => repetirRef.current?.focus()}
              editable={!guardando}
            />

            <Field
              ref={repetirRef}
              label="Repite la contraseña nueva"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              value={repetir}
              onChangeText={(v) => {
                setRepetir(v);
                limpiar('repetir');
              }}
              error={errores.repetir}
              returnKeyType="go"
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
  intro: {
    marginBottom: Spacing.lg,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  introText: {
    flex: 1,
  },
});
