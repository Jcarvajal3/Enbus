import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CaretRight,
  Check,
  EnvelopeSimple,
  IdentificationCard,
  Lifebuoy,
  PencilSimple,
  Phone,
  SignOut,
  UserCircle,
  WarningCircle,
  WhatsappLogo,
  X,
  type IconProps,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/src/contexts/AuthContext';
import { usePerfil, type CampoPerfil } from '@/src/hooks/usePerfil';
import { humanizeError } from '@/src/utils/errores';
import { supabase } from '@/src/utils/supabase';
import { SOPORTE_WHATSAPP, abrirSoporteWhatsApp } from '@/src/utils/soporte';
import { useToast } from '@/src/components/Toast';
import { PageTransition } from '@/src/components/PageTransition';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import { CompletarPerfilSheet } from '@/src/components/CompletarPerfilSheet';
import {
  Button,
  Card,
  ErrorState,
  Field,
  IconButton,
  InfoRow,
  LoadingState,
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

export default function PerfilScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const toast = useToast();
  const { perfil, completo, faltan, loading, error, recargar, guardar } = usePerfil();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [completarPerfil, setCompletarPerfil] = useState(false);

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cedulaRif, setCedulaRif] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const telefonoRef = useRef<TextInput>(null);
  const cedulaRef = useRef<TextInput>(null);

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
    if (!tel.valid) next.telefono = tel.message;
    const ced = validateCedula(cedulaRif);
    if (!ced.valid) next.cedula = ced.message;
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
      toast.show('error', `No pudimos cerrar la sesión. ${humanizeError(err)}`);
    }
  }, [signOut, toast]);

  const confirmarCerrarSesion = () => {
    Haptics.selectionAsync();
    Alert.alert('¿Cerrar sesión?', 'Se borrarán los boletos guardados en este teléfono.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: cerrarSesion },
    ]);
  };

  const escribirSoporte = async () => {
    const ok = await abrirSoporteWhatsApp();
    if (!ok) toast.show('error', 'No pudimos abrir WhatsApp. Revisa que esté instalado.');
  };

  const displayName =
    (nombreValido(perfil?.nombre_completo) ? perfil?.nombre_completo : null) ||
    user?.email?.split('@')[0] ||
    'Tu cuenta';
  const email = user?.email ?? '';

  return (
    <Screen>
      <PageTransition>
        <ScreenHeader
          variant="compact"
          title="Mi perfil"
          onBack={() => router.back()}
          right={
            loading || !perfil ? undefined : isEditing ? (
              <>
                <IconButton
                  icon={X}
                  label="Descartar cambios"
                  onPress={handleCancel}
                  disabled={saving}
                  color={Colors.mutedForeground}
                />
                <IconButton
                  icon={Check}
                  label="Guardar cambios"
                  onPress={handleSave}
                  disabled={saving}
                  color={Colors.successText}
                />
              </>
            ) : (
              <IconButton icon={PencilSimple} label="Editar mis datos" onPress={empezarEdicion} />
            )
          }
        />

        {loading && !perfil ? (
          <LoadingState label="Cargando tu perfil…" />
        ) : error && !perfil ? (
          <ErrorState title="No pudimos cargar tu perfil" description={error} onRetry={recargar} />
        ) : (
          <ScrollView
            contentContainerStyle={scrollContent({ top: 0 })}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <StaggerItem index={0} style={s.avatarBlock}>
              <View style={s.avatar}>
                <UserCircle weight="fill" color={Colors.primary} size={Sizes.avatar.md + Spacing.lg} />
              </View>
              <Text variant="heading" size="2xl" align="center">
                {displayName}
              </Text>
              <Text variant="secondary" color="muted" align="center">
                {email}
              </Text>
            </StaggerItem>

            {/* ── Aviso: faltan datos para comprar (#24) ─────────────────── */}
            {!completo && !isEditing ? (
              <StaggerItem index={1}>
                <Card tone="outline" padding="md" style={s.aviso} accessibilityRole="summary">
                  <View style={s.avisoHead}>
                    <WarningCircle color={Colors.warningText} weight="fill" size={Sizes.icon.lg} />
                    <View style={s.avisoBody}>
                      <Text variant="bodyStrong">Faltan tus datos para comprar</Text>
                      <Text variant="secondary" color="muted">
                        {`Agrega ${listaCampos(faltan)} para comprar boletos, enviar encomiendas y recibir las que te envíen.`}
                      </Text>
                    </View>
                  </View>
                  <Button
                    variant="accent"
                    size="md"
                    fullWidth
                    onPress={() => setCompletarPerfil(true)}
                    style={s.avisoAction}
                  >
                    Completar
                  </Button>
                </Card>
              </StaggerItem>
            ) : null}

            <StaggerItem index={2}>
              <Card tone="sunken" padding="md" elevated={false}>
                <SectionLabel>Información personal</SectionLabel>

                {isEditing ? (
                  <>
                    <Field
                      label="Nombre y apellido"
                      placeholder="Juan Pérez"
                      value={nombreCompleto}
                      onChangeText={(v) => setNombreCompleto(v.slice(0, 80))}
                      editable={!saving}
                      error={errors.nombre}
                      autoComplete="name"
                      textContentType="name"
                      returnKeyType="next"
                      onSubmitEditing={() => telefonoRef.current?.focus()}
                    />
                    <Field
                      ref={telefonoRef}
                      label="Teléfono"
                      placeholder="0414-1234567"
                      keyboardType="phone-pad"
                      value={telefono}
                      onChangeText={(v) => setTelefono(v.slice(0, 16))}
                      editable={!saving}
                      error={errors.telefono}
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                      returnKeyType="next"
                      onSubmitEditing={() => cedulaRef.current?.focus()}
                    />
                    <Field
                      ref={cedulaRef}
                      label="Cédula"
                      placeholder="V-12345678"
                      autoCapitalize="characters"
                      value={cedulaRif}
                      onChangeText={(v) => setCedulaRif(v.slice(0, 14))}
                      editable={!saving}
                      error={errors.cedula}
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                      containerStyle={s.lastField}
                    />
                  </>
                ) : (
                  <>
                    <InfoRow
                      label="Correo"
                      value={email || '—'}
                      icon={
                        <EnvelopeSimple
                          color={Colors.mutedForeground}
                          size={Sizes.icon.md}
                          weight="bold"
                        />
                      }
                    />
                    <InfoRow
                      label="Teléfono"
                      value={perfil?.telefono ? formatTelefono(perfil.telefono) : 'Sin agregar'}
                      divided
                      icon={
                        <Phone color={Colors.mutedForeground} size={Sizes.icon.md} weight="bold" />
                      }
                    />
                    <InfoRow
                      label="Cédula"
                      value={perfil?.cedula_rif ? formatCedula(perfil.cedula_rif) : 'Sin agregar'}
                      divided
                      icon={
                        <IdentificationCard
                          color={Colors.mutedForeground}
                          size={Sizes.icon.md}
                          weight="bold"
                        />
                      }
                    />
                  </>
                )}
              </Card>
            </StaggerItem>

            {isEditing ? (
              <StaggerItem index={3} style={s.actions}>
                <Button variant="accent" fullWidth loading={saving} onPress={handleSave}>
                  Guardar cambios
                </Button>
              </StaggerItem>
            ) : (
              <>
                {/* ── Ayuda (#28) ─────────────────────────────────────────── */}
                <StaggerItem index={3} style={s.section}>
                  <SectionLabel>Ayuda</SectionLabel>
                  <Card tone="sunken" padding="none" elevated={false}>
                    <FilaMenu
                      icon={Lifebuoy}
                      titulo="Ayuda y soporte"
                      detalle="Reporta un problema o lee las preguntas frecuentes"
                      onPress={() => router.push('/ayuda')}
                    />
                    {SOPORTE_WHATSAPP ? (
                      <FilaMenu
                        icon={WhatsappLogo}
                        titulo="Escríbenos por WhatsApp"
                        detalle="Abre un chat con el equipo de EnBus"
                        onPress={escribirSoporte}
                        divided
                      />
                    ) : null}
                  </Card>
                </StaggerItem>

                <StaggerItem index={4} style={s.actions}>
                  <Button
                    variant="dangerSoft"
                    icon={SignOut}
                    fullWidth
                    loading={cerrandoSesion}
                    onPress={confirmarCerrarSesion}
                  >
                    Cerrar sesión
                  </Button>

                  <Text variant="caption" color="muted" align="center" style={s.version}>
                    {APP_VERSION ? `EnBus · versión ${APP_VERSION}` : 'EnBus'}
                  </Text>
                </StaggerItem>
              </>
            )}
          </ScrollView>
        )}
      </PageTransition>

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

// ─── Fila de menú ────────────────────────────────────────────────────────────

function FilaMenu({
  icon: Icon,
  titulo,
  detalle,
  onPress,
  divided,
}: {
  icon: React.ComponentType<IconProps>;
  titulo: string;
  detalle?: string;
  onPress: () => void;
  divided?: boolean;
}) {
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
      <View style={s.filaIcon}>
        <Icon size={Sizes.icon.md} color={Colors.foreground} weight="bold" />
      </View>
      <View style={s.filaBody}>
        <Text variant="bodyStrong">{titulo}</Text>
        {detalle ? (
          <Text variant="caption" color="muted">
            {detalle}
          </Text>
        ) : null}
      </View>
      <CaretRight size={Sizes.icon.sm} color={Colors.mutedForeground} weight="bold" />
    </PressableScale>
  );
}

const s = StyleSheet.create({
  avatarBlock: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.xs,
  },
  avatar: {
    width: Sizes.avatar.lg,
    height: Sizes.avatar.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  aviso: {
    marginBottom: Spacing.lg,
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
  lastField: {
    marginBottom: 0,
  },
  section: {
    marginTop: Spacing['2xl'],
  },
  actions: {
    marginTop: Spacing['2xl'],
  },
  version: {
    marginTop: Spacing['2xl'],
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    minHeight: Sizes.control.lg,
  },
  filaDivided: {
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
  },
  filaIcon: {
    width: Sizes.iconBox.sm,
    height: Sizes.iconBox.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaBody: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
});
