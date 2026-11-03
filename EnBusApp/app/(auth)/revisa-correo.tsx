/**
 * "Revisa tu correo" (#23, M-04): lo que ve el usuario después de registrarse
 * (con "Confirmar correo" activo) o de pedir un enlace para recuperar la
 * contraseña. Misma composición que el resto del acceso (AU-44): cabecera
 * `compact` con ← al login y el mensaje con `EmptyState`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { EnvelopeSimple } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/src/utils/supabase';
import { humanizeError } from '@/src/utils/errores';
import { redirectAuth } from '@/src/utils/authLinks';
import { useVolver } from '@/src/hooks/useVolver';
import { useToast } from '@/src/components/Toast';
import { EmptyState, Screen, ScreenHeader, scrollContent } from '@/src/components/ui';

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
  const params = useLocalSearchParams<{
    email?: string;
    tipo?: string;
    enviado?: string;
    volver?: string;
  }>();

  const email = typeof params.email === 'string' ? params.email.trim() : '';
  const tipo: TipoCorreo = params.tipo === 'recuperar' ? 'recuperar' : 'registro';
  const volver = typeof params.volver === 'string' ? params.volver : undefined;
  const login = useMemo<Href>(
    () => (volver ? { pathname: '/login', params: { volver } } : '/login'),
    [volver]
  );
  const atras = useVolver(login);
  const destino = email ? enmascararCorreo(email) : 'tu correo';

  const [espera, setEspera] = useState(params.enviado === '0' ? 0 : ESPERA_REENVIO_S);
  const [reenviando, setReenviando] = useState(false);
  /** Anti doble toque (Supabase limita los correos por hora). */
  const enviandoRef = useRef(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function reenviar() {
    if (!email || espera > 0 || reenviando || enviandoRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    enviandoRef.current = true;
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
      toast.show('success', 'Te enviamos otro enlace.');
    } catch (err) {
      if (__DEV__) console.error('[revisa-correo] reenviar:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', humanizeError(err, 'recuperar'));
    } finally {
      enviandoRef.current = false;
      setReenviando(false);
    }
  }

  const texto =
    tipo === 'registro'
      ? `Abre el enlace que enviamos a ${destino} para confirmar tu cuenta. Mira también en Spam.`
      : `Abre desde este teléfono el enlace que enviamos a ${destino}.`;

  const usarOtroCorreo = () =>
    tipo === 'recuperar'
      ? router.replace({ pathname: '/recuperar', params: volver ? { volver } : {} })
      : router.replace({
          pathname: '/login',
          params: { modo: 'registro', ...(volver ? { volver } : {}) },
        });

  return (
    <Screen>
      <ScreenHeader
        variant="compact"
        title={tipo === 'recuperar' ? 'Recuperar contraseña' : 'Crear cuenta'}
        onBack={atras}
      />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <EmptyState
          icon={EnvelopeSimple}
          title="Revisa tu correo"
          description={texto}
          action={
            email
              ? {
                  children: espera > 0 ? `Reenviar en ${mmss(espera)}` : 'Reenviar correo',
                  onPress: reenviar,
                  loading: reenviando,
                  disabled: espera > 0,
                  accessibilityLabel:
                    espera > 0 ? `Podrás reenviar el correo en ${espera} segundos` : 'Reenviar correo',
                }
              : undefined
          }
          secondaryAction={{ children: 'Usar otro correo', onPress: usarOtroCorreo }}
        />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: scrollContent({ top: 0 }),
});
