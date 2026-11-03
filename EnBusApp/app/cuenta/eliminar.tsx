/**
 * Eliminar mi cuenta (#50, M-56, APP-52; requisito de Google Play).
 *
 * 1. `fn_eliminar_mi_cuenta(p_motivo)`: si hay boletos por usar, pagos en
 *    verificación, encomiendas en curso o reembolsos pendientes devuelve
 *    `EB_CUENTA_CON_ACTIVIDAD` (se muestra el `hint` con enlaces); si no,
 *    anonimiza el perfil.
 * 2. La edge function `eliminar-cuenta` borra la identidad de Auth. Si falla no
 *    se muestra error: el administrador completa la baja (paso manual 7).
 * 3. Se cierra la sesión en este teléfono y se vuelve al inicio de sesión.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Package, Ticket, WarningCircle } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { errorDeFuncion, esErrorEB, humanizeError, parseDetalleEB } from '@/src/utils/errores';
import { useToast } from '@/src/components/Toast';
import { PageTransition } from '@/src/components/PageTransition';
import {
  Button,
  Card,
  Chip,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  scrollContent,
} from '@/src/components/ui';
import type { ResultadoEliminarCuenta } from '@/src/types';
import { Colors, Opacity, Radius, Sizes, Spacing, StatusPalette } from '@/src/theme';

const MOTIVOS = ['Ya no la uso', 'Tengo otra cuenta', 'Problemas con la app', 'Otro'] as const;
type Motivo = (typeof MOTIVOS)[number];

/** Qué falta por terminar, según el detalle de `EB_CUENTA_CON_ACTIVIDAD`. */
interface Actividad {
  mensaje: string;
  verBoletos: boolean;
  verEncomiendas: boolean;
}

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function leerActividad(err: unknown): Actividad {
  const d = parseDetalleEB(err) as Record<string, unknown>;
  const boletos = numero(d.boletos) + numero(d.reembolsos);
  const encomiendas = numero(d.encomiendas_enviadas) + numero(d.encomiendas_por_recibir);
  const pagos = numero(d.pagos);
  const sinDetalle = boletos + encomiendas + pagos === 0;
  return {
    mensaje: humanizeError(err),
    // Un pago en verificación puede ser de un boleto o de un envío: ambos enlaces.
    verBoletos: sinDetalle || boletos > 0 || pagos > 0,
    verEncomiendas: sinDetalle || encomiendas > 0 || pagos > 0,
  };
}

export default function EliminarCuentaScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, limpiarAvisoSesion } = useAuth();
  const correo = user?.email ?? 'tu correo';

  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [entiendo, setEntiendo] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [actividad, setActividad] = useState<Actividad | null>(null);

  const puntos = [
    'Borramos tu nombre, tu cédula, tu teléfono y tus notificaciones.',
    'Tus boletos y envíos anteriores se guardan sin tus datos personales, porque las cooperativas los necesitan para su contabilidad.',
    `Ya no podrás entrar con ${correo}. Si quieres volver a usar EnBus, crea una cuenta nueva.`,
    'No se puede deshacer.',
  ];

  async function eliminar() {
    if (eliminando || !entiendo) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setEliminando(true);
    setActividad(null);
    try {
      const { data, error } = await supabase.rpc('fn_eliminar_mi_cuenta', { p_motivo: motivo });
      if (error) throw error;
      const resultado = data as ResultadoEliminarCuenta | null;
      if (!resultado?.eliminada_at) throw new Error('Respuesta sin eliminada_at');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (esErrorEB(err, 'EB_CUENTA_CON_ACTIVIDAD')) {
        setActividad(leerActividad(err));
      } else {
        toast.show('error', `No pudimos eliminar tu cuenta. ${humanizeError(err)}`);
      }
      setEliminando(false);
      return;
    }

    // La baja ya quedó hecha: lo que sigue no puede deshacerla ni debe asustar.
    /** Texto del servidor si el acceso aún no se cerró del todo (`EB_BAJA_PENDIENTE`). */
    let avisoPendiente: string | null = null;
    try {
      // Borra la identidad de Auth (necesita el token, antes de cerrar la sesión).
      // `invoke` no lanza: devuelve `{ error }` con el cuerpo `{ error, hint }` sin leer.
      const { error } = await supabase.functions.invoke('eliminar-cuenta', { method: 'POST' });
      if (error) {
        const detalle = await errorDeFuncion(error);
        if (__DEV__) console.warn('[eliminar] eliminar-cuenta:', detalle);
        if (esErrorEB(detalle, 'EB_BAJA_PENDIENTE')) avisoPendiente = humanizeError(detalle);
      }
    } catch {
      // Sin la edge function la completa el administrador (Bajas por completar).
    }
    try {
      const claves = await AsyncStorage.getAllKeys();
      const cache = claves.filter((k) => k.startsWith('cache:'));
      if (cache.length) await AsyncStorage.multiRemove(cache);
    } catch {
      // La caché se reemplaza con la próxima cuenta que entre en este teléfono.
    }
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // `AuthContext` cierra la sesión de un perfil con `eliminada_at`.
    }

    // No mostrar "Esta cuenta fue eliminada." en el login: la despedida lo dice.
    limpiarAvisoSesion();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(auth)/login');
    if (avisoPendiente) toast.show('info', avisoPendiente);
    else toast.show('success', 'Eliminamos tu cuenta. Gracias por usar EnBus.');
  }

  const avisoPaleta = StatusPalette.pending;

  return (
    <Screen>
      <PageTransition>
        <ScreenHeader
          variant="compact"
          title="Eliminar mi cuenta"
          onBack={() => router.back()}
        />

        <ScrollView
          contentContainerStyle={scrollContent()}
          showsVerticalScrollIndicator={false}
        >
          {actividad ? (
            <View
              style={[s.actividad, { backgroundColor: avisoPaleta.bg, borderColor: avisoPaleta.border }]}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              <View style={s.actividadHead}>
                <WarningCircle color={avisoPaleta.text} weight="fill" size={Sizes.icon.lg} />
                <Text variant="secondary" color={avisoPaleta.text} style={s.flex}>
                  {actividad.mensaje}
                </Text>
              </View>
              <View style={s.actividadLinks}>
                {actividad.verBoletos ? (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Ticket}
                    onPress={() => router.dismissTo('/(tabs)/boletos')}
                  >
                    Ver mis boletos
                  </Button>
                ) : null}
                {actividad.verEncomiendas ? (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Package}
                    onPress={() => router.dismissTo('/(tabs)/encomiendas')}
                  >
                    Ver mis encomiendas
                  </Button>
                ) : null}
              </View>
            </View>
          ) : null}

          <Card tone="sunken" padding="md" elevated={false}>
            <Text variant="bodyStrong" style={s.lead}>
              Esto es lo que pasa:
            </Text>
            {puntos.map((p) => (
              <View key={p} style={s.punto}>
                <Text variant="secondary" importantForAccessibility="no" accessibilityElementsHidden>
                  •
                </Text>
                <Text variant="secondary" style={s.flex}>
                  {p}
                </Text>
              </View>
            ))}
          </Card>

          <View style={s.section}>
            <SectionLabel>¿Por qué te vas? (opcional)</SectionLabel>
            <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="¿Por qué te vas? (opcional)">
              {MOTIVOS.map((m) => (
                <Chip
                  key={m}
                  label={m}
                  selected={motivo === m}
                  onPress={() => setMotivo((prev) => (prev === m ? null : m))}
                />
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setEntiendo((v) => !v);
            }}
            disabled={eliminando}
            style={({ pressed }) => [s.casilla, pressed && s.presionada]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: entiendo, disabled: eliminando }}
            accessibilityLabel="Entiendo que no se puede deshacer"
          >
            <View style={[s.caja, entiendo && s.cajaMarcada]}>
              {entiendo ? <Check size={Sizes.icon.sm} color={Colors.white} weight="bold" /> : null}
            </View>
            <Text variant="body" style={s.flex}>
              Entiendo que no se puede deshacer
            </Text>
          </Pressable>

          <Button
            variant="danger"
            fullWidth
            disabled={!entiendo || eliminando}
            onPress={eliminar}
            style={s.boton}
          >
            {eliminando ? 'Eliminando…' : 'Eliminar mi cuenta'}
          </Button>
          {!entiendo ? (
            <Text variant="caption" color="muted" align="center" style={s.ayudaBoton}>
              Marca la casilla para continuar.
            </Text>
          ) : null}
        </ScrollView>
      </PageTransition>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  actividad: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: Sizes.hairline,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  actividadHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  actividadLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  lead: {
    marginBottom: Spacing.sm,
  },
  punto: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  section: {
    marginTop: Spacing['2xl'],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  casilla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Sizes.touchTarget,
    marginTop: Spacing['2xl'],
  },
  presionada: {
    opacity: Opacity.muted,
  },
  caja: {
    width: Sizes.icon.xl,
    height: Sizes.icon.xl,
    borderRadius: Radius.xs,
    borderWidth: Sizes.borderStrong,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cajaMarcada: {
    backgroundColor: Colors.destructive,
    borderColor: Colors.destructive,
  },
  boton: {
    marginTop: Spacing.xl,
  },
  ayudaBoton: {
    marginTop: Spacing.sm,
  },
});
