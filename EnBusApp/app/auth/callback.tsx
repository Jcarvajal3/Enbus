/**
 * `enbus://auth/callback` (#23, #24): a esta ruta vuelven todos los enlaces de
 * autenticación (confirmar correo, recuperar contraseña y, en Android, a veces
 * también Google). Canjea el código por la sesión y redirige:
 *   - `tipo=recuperar` → "Crea una contraseña nueva".
 *   - lo demás → Inicio.
 * Si el enlace venció o ya se usó, lo dice y ofrece cómo seguir.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { LinkBreak } from 'phosphor-react-native';
import { supabase } from '@/src/utils/supabase';
import { completarSesionDesdeUrl } from '@/src/utils/authLinks';
import { humanizeError } from '@/src/utils/errores';
import { Button, LoadingState, Screen, Text } from '@/src/components/ui';
import { Colors, Layout, Radius, Sizes, Spacing } from '@/src/theme';

type Params = {
  code?: string;
  tipo?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
};

const CLAVES: (keyof Params)[] = ['code', 'tipo', 'error', 'error_code', 'error_description'];

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  // Trae también el fragmento (#access_token=…) que el router no expone.
  const linkingUrl = Linking.useLinkingURL();

  const [error, setError] = useState<string | null>(null);
  const procesada = useRef<string | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const query = CLAVES.map((k) => {
    const v = params[k];
    return typeof v === 'string' && v ? `${k}=${encodeURIComponent(v)}` : '';
  })
    .filter(Boolean)
    .join('&');

  /**
   * La URL del enlace. Los parámetros del router mandan: `useLinkingURL` puede
   * traer un enlace anterior (el que abrió la app la primera vez) y canjearlo de
   * nuevo llevaría a otra pantalla. Solo se usa la URL nativa si es la misma
   * (mismo `code`) o si el enlace trae la sesión en el fragmento (`#access_token`),
   * que el router no expone.
   */
  const url = useMemo(() => {
    const code = typeof params.code === 'string' ? params.code : '';
    const nativa = linkingUrl && linkingUrl.includes('auth/callback') ? linkingUrl : null;
    if (code) {
      return nativa && nativa.includes(`code=${code}`) ? nativa : `enbus://auth/callback?${query}`;
    }
    if (query && (params.error || params.error_code || params.error_description)) {
      return `enbus://auth/callback?${query}`;
    }
    if (nativa && nativa.includes('access_token=')) return nativa;
    // Sin código ni error (p. ej. `?tipo=google` cuando el login ya canjeó): se
    // mira si ya hay sesión.
    return null;
  }, [linkingUrl, query, params.code, params.error, params.error_code, params.error_description]);

  const tipo = typeof params.tipo === 'string' ? params.tipo : undefined;

  useEffect(() => {
    const clave = url ?? 'sin-url';
    if (procesada.current === clave) return;
    procesada.current = clave;

    const irA = (t: string | null | undefined) =>
      router.replace(t === 'recuperar' ? '/restablecer' : '/(tabs)');

    (async () => {
      if (!url) {
        // Sin código: puede que la sesión ya se haya completado en el login (Google).
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session) return irA(tipo);
        } catch {
          // Se informa abajo como enlace no válido.
        }
        if (montado.current) setError(humanizeError(null, 'auth'));
        return;
      }

      const resultado = await completarSesionDesdeUrl(url);
      if (!montado.current) return;
      if (resultado.ok) irA(resultado.tipo ?? tipo);
      // Rechazó el acceso en Google: de vuelta al login, sin mensaje.
      else if (resultado.cancelado) router.replace('/login');
      else setError(resultado.error);
    })();
  }, [url, tipo, router]);

  if (!error) {
    return (
      <Screen>
        <LoadingState label="Entrando…" />
      </Screen>
    );
  }

  const esRecuperar = tipo === 'recuperar';

  return (
    <Screen>
      <View style={s.body} accessibilityRole="alert">
        <View style={s.icono}>
          <LinkBreak size={Sizes.icon['2xl']} color={Colors.dangerText} weight="regular" />
        </View>
        <Text variant="heading" align="center" accessibilityRole="header">
          No pudimos abrir el enlace
        </Text>
        <Text variant="body" color="muted" align="center" style={s.texto}>
          {error}
        </Text>
        {tipo === 'registro' ? (
          // Supabase confirma el correo antes de volver a la app: si el enlace se
          // abrió en otro navegador o ya se usó, la cuenta puede estar confirmada.
          <Text variant="secondary" color="muted" align="center" style={s.texto}>
            Si ya confirmaste tu correo, inicia sesión con tu correo y contraseña.
          </Text>
        ) : null}

        <View style={s.acciones}>
          {esRecuperar ? (
            <Button variant="accent" fullWidth onPress={() => router.replace('/recuperar')}>
              Pedir otro enlace
            </Button>
          ) : null}
          <Button
            variant={esRecuperar ? 'outline' : 'accent'}
            fullWidth
            onPress={() => router.replace('/login')}
          >
            Volver a iniciar sesión
          </Button>
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding,
  },
  icono: {
    alignSelf: 'center',
    width: Sizes.iconBox['2xl'],
    height: Sizes.iconBox['2xl'],
    borderRadius: Radius.full,
    backgroundColor: Colors.destructiveLight,
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
