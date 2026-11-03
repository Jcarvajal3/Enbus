/**
 * "Revisa tu correo" (#23, M-04): lo que ve el usuario después de registrarse
 * (con "Confirmar correo" activo) o de pedir un enlace para recuperar la
 * contraseña. Antes solo había un toast que desaparecía en 3 segundos.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EnvelopeSimple } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/src/utils/supabase';
import { humanizeError } from '@/src/utils/errores';
import { redirectAuth } from '@/src/utils/authLinks';
import { useToast } from '@/src/components/Toast';
import { Button, Screen, Text } from '@/src/components/ui';
import { Colors, Layout, Radius, Sizes, Spacing } from '@/src/theme';

type TipoCorreo = 'registro' | 'recuperar';

/** Espera entre reenvíos (Supabase limita los correos por minuto). */
const ESPERA_REENVIO_S = 60;

/** "javier@gmail.com" → "j•••@gmail.com" */
function enmascararCorreo(email: string): string {
  const [usuario, dominio] = email.split('@');
  if (!usuario || !dominio) return email;
  return `${usuario.charAt(0)}•••@${dominio}`;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function RevisaCorreoScreen() {
  const router = useRouter();
  const toast = useToast();
  // `enviado=0`: no acabamos de mandar el correo (p. ej. entró con una cuenta sin
  // confirmar), así que puede reenviarlo enseguida, sin esperar.
  const params = useLocalSearchParams<{ email?: string; tipo?: string; enviado?: string }>();

  const email = typeof params.email === 'string' ? params.email.trim() : '';
  const tipo: TipoCorreo = params.tipo === 'recuperar' ? 'recuperar' : 'registro';
  const destino = email ? enmascararCorreo(email) : 'tu correo';

  const [espera, setEspera] = useState(params.enviado === '0' ? 0 : ESPERA_REENVIO_S);
  const [reenviando, setReenviando] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function reenviar() {
    if (!email || espera > 0 || reenviando) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReenviando(true);
    try {
      const { error } =
        tipo === 'registro'
          ? await supabase.auth.resend({
              type: 'signup',
              email,
              options: { emailRedirectTo: redirectAuth('registro') },
            })
          : await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: redirectAuth('recuperar'),
            });
      if (error) throw error;
      setEspera(ESPERA_REENVIO_S);
      toast.show('success', 'Te enviamos otro enlace. Revisa también Spam o Promociones.');
    } catch (err) {
      if (__DEV__) console.error('[revisa-correo] reenviar:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', humanizeError(err, 'recuperar'));
    } finally {
      setReenviando(false);
    }
  }

  const texto =
    tipo === 'registro'
      ? `Te enviamos un enlace a ${destino} para confirmar tu cuenta. Puede tardar unos minutos y llegar a Spam o Promociones.`
      : `Te enviamos un enlace a ${destino} para crear una contraseña nueva. Ábrelo desde este teléfono.`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.icono}>
          <EnvelopeSimple size={Sizes.icon['2xl']} color={Colors.foreground} weight="regular" />
        </View>

        <Text variant="title" align="center" accessibilityRole="header">
          Revisa tu correo
        </Text>
        <Text variant="body" color="muted" align="center" style={s.texto}>
          {texto}
        </Text>

        <View style={s.acciones}>
          {email ? (
            <Button
              variant="accent"
              fullWidth
              loading={reenviando}
              disabled={espera > 0}
              onPress={reenviar}
              accessibilityLabel={
                espera > 0 ? `Podrás reenviar el correo en ${espera} segundos` : 'Reenviar correo'
              }
            >
              {espera > 0 ? `Reenviar en ${mmss(espera)}` : 'Reenviar correo'}
            </Button>
          ) : null}

          <Button variant="outline" fullWidth onPress={() => router.replace('/login')}>
            Volver a iniciar sesión
          </Button>

          <Button
            variant="ghost"
            fullWidth
            onPress={() =>
              tipo === 'recuperar'
                ? router.replace('/recuperar')
                : router.replace({ pathname: '/login', params: { modo: 'registro' } })
            }
          >
            Usar otro correo
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing['5xl'],
  },
  icono: {
    alignSelf: 'center',
    width: Sizes.iconBox['2xl'],
    height: Sizes.iconBox['2xl'],
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  texto: {
    marginTop: Spacing.md,
  },
  acciones: {
    marginTop: Spacing['3xl'],
    gap: Spacing.md,
  },
});
