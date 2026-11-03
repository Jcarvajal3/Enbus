/**
 * Mi perfil (#50, M-55, M-56, APP-52), en secciones:
 *
 * - **Cuenta**: datos personales ("Editar"), contraseña ("Cambiar contraseña",
 *   o "Crear una contraseña" si la cuenta es solo de Google) y "Cerrar sesión"
 *   (con `ConfirmSheet`, D3).
 * - **Avisos que recibes**: las tres preferencias `notif_*`; guardan al cambiar
 *   y vuelven atrás si falla. (No es la bandeja "Notificaciones" de la campana.)
 * - **Ayuda**, **Legal** (solo con `SITIO_URL`), "Eliminar mi cuenta" (el único
 *   rojo de la pantalla) y la versión.
 *
 * Todas las filas son el mismo `ListRow` (icono en círculo, relleno 16), AU-37.
 */
import { useCallback, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CaretRight,
  EnvelopeSimple,
  FileText,
  IdentificationCard,
  Key,
  Lifebuoy,
  Phone,
  ShieldCheck,
  SignOut,
  User,
  WarningCircle,
  type IconProps,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  tieneContrasena,
  usePerfil,
  type CampoPerfil,
  type PreferenciaNotificacion,
} from '@/src/hooks/usePerfil';
import { useVolver } from '@/src/hooks/useVolver';
import { humanizeError } from '@/src/utils/errores';
import { supabase } from '@/src/utils/supabase';
import { SITIO_URL, abrirPaginaLegal } from '@/src/utils/soporte';
import { useToast } from '@/src/components/Toast';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { ScreenSkeleton } from '@/src/components/SkeletonLoader';
import { CompletarPerfilSheet } from '@/src/components/CompletarPerfilSheet';
import { CedulaField } from '@/src/components/CedulaField';
import { TelefonoField } from '@/src/components/TelefonoField';
import {
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  Field,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  scrollContent,
} from '@/src/components/ui';
import {
  formatCedula,
  formatTelefono,
  nombreValido,
  validateCedula,
  validatePhone,
} from '@/src/utils/validation';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

/** Versión real de la app (app.json / EAS), no un texto fijo (APP-52). */
const APP_VERSION = Constants.expoConfig?.version ?? null;

const NOMBRE_CAMPO: Record<CampoPerfil, string> = {
  nombre: 'tu nombre',
  cedula: 'tu cédula',
  telefono: 'tu teléfono',
};

/** "tu cédula y tu teléfono", "tu nombre, tu cédula y tu teléfono" */
function listaCampos(faltan: CampoPerfil[]): string {
  const nombres = faltan.map((c) => NOMBRE_CAMPO[c]);
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

const PREFERENCIAS: { clave: PreferenciaNotificacion; titulo: string; detalle: string }[] = [
  {
    clave: 'notif_boletos',
    titulo: 'Boletos y pagos',
    detalle: 'Pagos y cambios de tus viajes',
  },
  {
    clave: 'notif_encomiendas',
    titulo: 'Encomiendas',
    detalle: 'Cuando un envío cambia de estado',
  },
  {
    clave: 'notif_recordatorios',
    titulo: 'Recordatorios de viaje',
    detalle: 'Un aviso antes de la salida',
  },
];

/**
 * En la web, `Switch` pinta el pulgar activo turquesa si no se le da color
 * (SY-35, AU-38): `activeThumbColor` solo existe en react-native-web.
 */
const SWITCH_WEB = Platform.OS === 'web' ? { activeThumbColor: Colors.white } : {};

export default function PerfilScreen() {
  const router = useRouter();
  const atras = useVolver('/(tabs)');
  const { user, signOut } = useAuth();
  const toast = useToast();
  const { perfil, completo, faltan, loading, error, recargar, guardar, guardarNotificaciones } =
    usePerfil();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [completarPerfil, setCompletarPerfil] = useState(false);

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cedulaRif, setCedulaRif] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Valor elegido mientras se guarda (o `undefined`: se muestra el del perfil). */
  const [prefLocal, setPrefLocal] = useState<Partial<Record<PreferenciaNotificacion, boolean>>>({});

  const telefonoRef = useRef<TextInput>(null);
  const cedulaRef = useRef<TextInput>(null);

  const conContrasena = tieneContrasena(user);

  const empezarEdicion = useCallback(() => {
    Haptics.selectionAsync();
    setNombreCompleto(nombreValido(perfil?.nombre_completo) ? (perfil?.nombre_completo ?? '') : '');
    setTelefono(perfil?.telefono ?? '');
    setCedulaRif(perfil?.cedula_rif ?? '');
    setErrors({});
    setIsEditing(true);
  }, [perfil]);

  /** Mismas reglas que el registro, la compra y el envío (`validation.ts`). */
  const validate = useCallback(() => {
    const next: Record<string, string> = {};
    if (!nombreValido(nombreCompleto)) next.nombre = 'Escribe tu nombre y apellido.';
    const tel = validatePhone(telefono);
    if (!tel.valid) next.telefono = tel.message ?? 'Revisa el teléfono.';
    const ced = validateCedula(cedulaRif);
    if (!ced.valid) next.cedula = ced.message ?? 'Revisa la cédula.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [nombreCompleto, telefono, cedulaRif]);

  const handleSave = useCallback(async () => {
    if (!user || saving) return;
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    try {
      setSaving(true);
      // `guardar` normaliza ("V-12345678", "0414-1234567") y traduce una cédula
      // o un teléfono ya usados en otra cuenta.
      await guardar({ nombre_completo: nombreCompleto, cedula_rif: cedulaRif, telefono });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Guardamos tus datos.');
      setIsEditing(false);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', humanizeError(err, 'perfil'));
    } finally {
      setSaving(false);
    }
  }, [user, saving, validate, guardar, nombreCompleto, cedulaRif, telefono, toast]);

  const handleCancel = () => {
    setErrors({});
    setIsEditing(false);
  };

  const limpiarCampo = (campo: string) =>
    setErrors((prev) => (prev[campo] ? { ...prev, [campo]: '' } : prev));

  // ── Preferencias de notificación ─────────────────────────────────────────
  const valorPreferencia = (clave: PreferenciaNotificacion): boolean =>
    prefLocal[clave] ?? (perfil?.[clave] !== false);

  const cambiarPreferencia = useCallback(
    async (clave: PreferenciaNotificacion, valor: boolean) => {
      setPrefLocal((prev) => ({ ...prev, [clave]: valor }));
      try {
        await guardarNotificaciones({ [clave]: valor });
      } catch (err) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.show('error', `No pudimos guardar tu preferencia. ${humanizeError(err, 'perfil')}`);
      } finally {
        // Con éxito, el perfil ya trae el valor nuevo; si falló, vuelve al anterior.
        setPrefLocal((prev) => {
          const next = { ...prev };
          delete next[clave];
          return next;
        });
      }
    },
    [guardarNotificaciones, toast]
  );

  // ── Sesión ───────────────────────────────────────────────────────────────
  const cerrarSesion = useCallback(async () => {
    setCerrandoSesion(true);
    try {
      // Lo prometido en la confirmación: los boletos y envíos guardados para
      // verlos sin conexión no quedan en el teléfono de la siguiente persona.
      const claves = await AsyncStorage.getAllKeys();
      const cache = claves.filter((k) => k.startsWith('cache:'));
      if (cache.length) await AsyncStorage.multiRemove(cache);
    } catch {
      // Si no se pudo limpiar la caché, igual se cierra la sesión.
    }
    try {
      await signOut();
      // Sin conexión, `signOut` global puede fallar y dejar la sesión en el
      // teléfono: se cierra al menos aquí para que el botón no se quede cargando.
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.auth.signOut({ scope: 'local' });
      // El guard de `app/_layout.tsx` lleva al inicio de sesión.
    } catch (err) {
      setCerrandoSesion(false);
      setConfirmarSalida(false);
      toast.show('error', `No pudimos cerrar la sesión. ${humanizeError(err)}`);
    }
  }, [signOut, toast]);

  const abrirLegal = async (pagina: 'terminos' | 'privacidad') => {
    const ok = await abrirPaginaLegal(pagina);
    if (!ok) toast.show('error', 'No pudimos abrir la página. Revisa tu conexión e intenta de nuevo.');
  };

  // Sin nombre válido, "Tu cuenta" (nunca el prefijo del correo), AU-07.
  const displayName = nombreValido(perfil?.nombre_completo)
    ? (perfil?.nombre_completo ?? 'Tu cuenta')
    : 'Tu cuenta';
  const email = user?.email ?? '';

  return (
    <Screen>
      <ScreenHeader variant="compact" title="Mi perfil" onBack={atras} />

      {loading && !perfil ? (
        <ScreenSkeleton variante="perfil" />
      ) : error && !perfil ? (
        <ErrorState title="No pudimos cargar tu perfil" description={error} onRetry={recargar} />
      ) : (
        <ScrollView
          contentContainerStyle={scrollContent({ top: 0 })}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <StaggerItem index={0} style={s.avatarBlock}>
            <View style={s.avatar} importantForAccessibility="no" accessibilityElementsHidden>
              <User weight="regular" color={Colors.mutedForeground} size={Sizes.icon['2xl']} />
            </View>
            <Text variant="heading" align="center" accessibilityRole="header">
              {displayName}
            </Text>
            {email ? (
              <Text variant="secondary" color="muted" align="center">
                {email}
              </Text>
            ) : null}
          </StaggerItem>

          {/* ── Aviso: faltan datos para comprar (#24) ─────────────────── */}
          {!completo && !isEditing ? (
            <StaggerItem index={1} style={s.section}>
              <Card tone="outline" padding="md" accessibilityRole="summary">
                <View style={s.avisoHead}>
                  <WarningCircle color={Colors.warningText} weight="fill" size={Sizes.icon.lg} />
                  <View style={s.avisoBody}>
                    <Text variant="bodyStrong">Faltan tus datos para comprar</Text>
                    <Text variant="secondary" color="muted">
                      {`Agrega ${listaCampos(faltan)} para comprar y enviar.`}
                    </Text>
                  </View>
                </View>
                <Button
                  size="md"
                  fullWidth
                  onPress={() => setCompletarPerfil(true)}
                  style={s.avisoAction}
                >
                  Completar datos
                </Button>
              </Card>
            </StaggerItem>
          ) : null}

          {/* ── Cuenta ───────────────────────────────────────────────────── */}
          <StaggerItem index={2} style={s.section}>
            <SectionLabel>Cuenta</SectionLabel>
            <Card tone="sunken" padding="none">
              <View style={s.cardHead}>
                <Text variant="bodyStrong" accessibilityRole="header" style={s.cardHeadTitle}>
                  Datos personales
                </Text>
                {perfil ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={isEditing ? handleCancel : empezarEdicion}
                    disabled={saving}
                    accessibilityLabel={
                      isEditing ? 'Cancelar la edición de tus datos' : 'Editar tus datos personales'
                    }
                    style={s.textButton}
                  >
                    {isEditing ? 'Cancelar' : 'Editar'}
                  </Button>
                ) : null}
              </View>

              {isEditing ? (
                <View style={s.form}>
                  <Field
                    label="Nombre y apellido"
                    value={nombreCompleto}
                    onChangeText={(v) => {
                      setNombreCompleto(v.slice(0, 80));
                      limpiarCampo('nombre');
                    }}
                    editable={!saving}
                    error={errors.nombre}
                    autoComplete="name"
                    textContentType="name"
                    autoCapitalize="words"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => telefonoRef.current?.focus()}
                  />
                  <TelefonoField
                    ref={telefonoRef}
                    value={telefono}
                    onChangeText={(v) => {
                      setTelefono(v);
                      limpiarCampo('telefono');
                    }}
                    editable={!saving}
                    error={errors.telefono}
                    returnKeyType="next"
                    onSubmitEditing={() => cedulaRef.current?.focus()}
                  />
                  <CedulaField
                    ref={cedulaRef}
                    value={cedulaRif}
                    onChangeText={(v) => {
                      setCedulaRif(v);
                      limpiarCampo('cedula');
                    }}
                    editable={!saving}
                    error={errors.cedula}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />
                  <Button fullWidth loading={saving} onPress={handleSave}>
                    Guardar cambios
                  </Button>
                </View>
              ) : (
                <>
                  <ListRow icon={EnvelopeSimple} etiqueta="Correo" titulo={email || '—'} divided />
                  <ListRow
                    icon={Phone}
                    etiqueta="Teléfono"
                    titulo={perfil?.telefono ? formatTelefono(perfil.telefono) : 'Sin agregar'}
                    divided
                  />
                  <ListRow
                    icon={IdentificationCard}
                    etiqueta="Cédula"
                    titulo={perfil?.cedula_rif ? formatCedula(perfil.cedula_rif) : 'Sin agregar'}
                    divided
                  />
                </>
              )}
            </Card>

            <Card tone="sunken" padding="none" style={s.cardSpaced}>
              <ListRow
                icon={Key}
                titulo={conContrasena ? 'Cambiar contraseña' : 'Crear una contraseña'}
                detalle={conContrasena ? undefined : 'Para entrar también con tu correo'}
                onPress={() => router.push('/cuenta/contrasena')}
              />
              <ListRow
                icon={SignOut}
                titulo="Cerrar sesión"
                onPress={() => setConfirmarSalida(true)}
                chevron={false}
                divided
              />
            </Card>
          </StaggerItem>

          {/* ── Avisos que recibes (AN-17) ───────────────────────────────── */}
          <StaggerItem index={3} style={s.section}>
            <SectionLabel>Avisos que recibes</SectionLabel>
            <Card tone="sunken" padding="none">
              {PREFERENCIAS.map((p, i) => (
                <FilaSwitch
                  key={p.clave}
                  titulo={p.titulo}
                  detalle={p.detalle}
                  valor={valorPreferencia(p.clave)}
                  guardando={prefLocal[p.clave] !== undefined}
                  onCambiar={(v) => cambiarPreferencia(p.clave, v)}
                  divided={i > 0}
                />
              ))}
            </Card>
          </StaggerItem>

          {/* ── Ayuda (#28); WhatsApp vive en Ayuda (AN-17) ──────────────── */}
          <StaggerItem index={4} style={s.section}>
            <SectionLabel>Ayuda</SectionLabel>
            <Card tone="sunken" padding="none">
              <ListRow
                icon={Lifebuoy}
                titulo="Ayuda"
                detalle="Preguntas frecuentes y reportes"
                onPress={() => router.push('/ayuda')}
              />
            </Card>
          </StaggerItem>

          {/* ── Legal (solo con el sitio configurado) ────────────────────── */}
          {SITIO_URL ? (
            <StaggerItem index={5} style={s.section}>
              <SectionLabel>Legal</SectionLabel>
              <Card tone="sunken" padding="none">
                <ListRow
                  icon={FileText}
                  titulo="Términos y condiciones"
                  onPress={() => abrirLegal('terminos')}
                />
                <ListRow
                  icon={ShieldCheck}
                  titulo="Política de privacidad"
                  onPress={() => abrirLegal('privacidad')}
                  divided
                />
              </Card>
            </StaggerItem>
          ) : null}

          <StaggerItem index={6} style={s.pie}>
            <Button
              variant="dangerGhost"
              size="md"
              onPress={() => router.push('/cuenta/eliminar')}
            >
              Eliminar mi cuenta
            </Button>
            <Text variant="caption" color="muted" align="center">
              {APP_VERSION ? `EnBus · versión ${APP_VERSION}` : 'EnBus'}
            </Text>
          </StaggerItem>
        </ScrollView>
      )}

      <ConfirmSheet
        visible={confirmarSalida}
        cargando={cerrandoSesion}
        titulo="¿Cerrar sesión?"
        mensaje="Se borrarán los boletos guardados en este teléfono."
        confirmar="Cerrar sesión"
        onConfirm={cerrarSesion}
        onClose={() => setConfirmarSalida(false)}
      />

      <CompletarPerfilSheet
        visible={completarPerfil}
        motivo="perfil"
        onClose={() => setCompletarPerfil(false)}
        onCompletado={() => {
          setCompletarPerfil(false);
          toast.show('success', 'Listo. Ya puedes comprar y enviar con tus datos.');
        }}
      />
    </Screen>
  );
}

// ─── Fila ────────────────────────────────────────────────────────────────────

/**
 * La única fila del perfil (AU-37): icono en círculo blanco, relleno 16.
 * Dato (`etiqueta` + `titulo`: "Correo" / "ana@…") o acción (`titulo` +
 * `detalle`, con `onPress` y chevron si abre otra pantalla).
 */
function ListRow({
  icon: Icon,
  etiqueta,
  titulo,
  detalle,
  onPress,
  chevron = true,
  divided,
}: {
  icon: React.ComponentType<IconProps>;
  etiqueta?: string;
  titulo: string;
  detalle?: string;
  onPress?: () => void;
  chevron?: boolean;
  divided?: boolean;
}) {
  const contenido = (
    <>
      <View style={s.filaIcon}>
        <Icon size={Sizes.icon.md} color={Colors.foreground} weight="bold" />
      </View>
      <View style={s.filaBody}>
        {etiqueta ? (
          <Text variant="caption" color="muted">
            {etiqueta}
          </Text>
        ) : null}
        <Text variant="bodyStrong">{titulo}</Text>
        {detalle ? (
          <Text variant="caption" color="muted">
            {detalle}
          </Text>
        ) : null}
      </View>
      {onPress && chevron ? (
        <CaretRight size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[s.fila, divided && s.filaDivided]}
        accessible
        accessibilityLabel={etiqueta ? `${etiqueta}: ${titulo}` : titulo}
      >
        {contenido}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.card}
      style={[s.fila, divided && s.filaDivided]}
      accessibilityRole="button"
      accessibilityLabel={detalle ? `${titulo}. ${detalle}` : titulo}
    >
      {contenido}
    </PressableScale>
  );
}

// ─── Fila con interruptor ────────────────────────────────────────────────────

function FilaSwitch({
  titulo,
  detalle,
  valor,
  guardando,
  onCambiar,
  divided,
}: {
  titulo: string;
  detalle?: string;
  valor: boolean;
  guardando: boolean;
  onCambiar: (v: boolean) => void;
  divided?: boolean;
}) {
  return (
    <View style={[s.fila, divided && s.filaDivided]}>
      <View
        style={s.filaBody}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Text variant="bodyStrong">{titulo}</Text>
        {detalle ? (
          <Text variant="caption" color="muted">
            {detalle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={valor}
        onValueChange={(v) => {
          Haptics.selectionAsync();
          onCambiar(v);
        }}
        disabled={guardando}
        trackColor={{ false: Colors.borderStrong, true: Colors.accentStrong }}
        thumbColor={Colors.white}
        ios_backgroundColor={Colors.borderStrong}
        {...SWITCH_WEB}
        accessibilityLabel={detalle ? `${titulo}. ${detalle}` : titulo}
        accessibilityState={{ checked: valor, disabled: guardando, busy: guardando }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  avatarBlock: {
    alignItems: 'center',
    paddingTop: Spacing['2xl'],
    gap: Spacing.xs,
  },
  avatar: {
    width: Sizes.avatar.lg,
    height: Sizes.avatar.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avisoHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  avisoBody: {
    flex: 1,
    gap: Spacing.xs,
  },
  avisoAction: {
    marginTop: Spacing.lg,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
    minHeight: Sizes.control.lg,
  },
  cardHeadTitle: {
    flex: 1,
  },
  textButton: {
    paddingHorizontal: Spacing.md,
  },
  form: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  cardSpaced: {
    marginTop: Spacing.md,
  },
  section: {
    marginTop: Spacing['2xl'],
  },
  pie: {
    marginTop: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: Sizes.control.lg,
  },
  filaDivided: {
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
  },
  filaIcon: {
    width: Sizes.iconBox.md,
    height: Sizes.iconBox.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaBody: {
    flex: 1,
  },
});
