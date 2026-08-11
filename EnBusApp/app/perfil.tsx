import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Check,
  EnvelopeSimple,
  IdentificationCard,
  PencilSimple,
  Phone,
  SignOut,
  UserCircle,
  WarningCircle,
  X,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/contexts/AuthContext';
import { supabase } from '@/src/utils/supabase';
import { useToast } from '@/src/components/Toast';
import { PageTransition } from '@/src/components/PageTransition';
import { StaggerItem } from '@/src/components/StaggerItem';
import {
  Button,
  Card,
  EmptyState,
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
import { sanitizeText } from '@/src/utils/validation';
import type { PerfilUsuario } from '@/src/types';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

const APP_VERSION = '1.0.0';

export default function PerfilScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState<PerfilUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cedulaRif, setCedulaRif] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      if (!user) return;
      try {
        setLoading(true);
        setFetchError(null);
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        if (isMounted && data) {
          setProfile(data as PerfilUsuario);
          setNombreCompleto(data.nombre_completo ?? '');
          setTelefono(data.telefono ?? '');
          setCedulaRif(data.cedula_rif ?? '');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo cargar el perfil.';
        if (__DEV__) console.error('[perfil] Error cargando perfil:', message);
        if (isMounted) setFetchError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProfile();
    return () => {
      isMounted = false;
    };
  }, [user]);

  /** Inline field validation — errors now sit under the field, not only in a toast. */
  const validate = useCallback(() => {
    const next: Record<string, string> = {};
    if (sanitizeText(nombreCompleto).length < 2) next.nombre = 'Ingresa al menos 2 caracteres.';
    if (sanitizeText(telefono).length < 8) next.telefono = 'El teléfono debe tener al menos 8 dígitos.';
    if (sanitizeText(cedulaRif).length < 4) next.cedula = 'Ingresa una cédula o RIF válido.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [nombreCompleto, telefono, cedulaRif]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const payload = {
      nombre_completo: sanitizeText(nombreCompleto),
      telefono: sanitizeText(telefono),
      cedula_rif: sanitizeText(cedulaRif),
    };

    try {
      setSaving(true);
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, ...payload } : prev));
      await supabase.auth.updateUser({ data: payload });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Perfil actualizado correctamente');
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (__DEV__) console.error('[perfil] Error guardando perfil:', message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No se pudieron guardar los cambios: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [user, validate, nombreCompleto, telefono, cedulaRif, toast]);

  const handleCancel = () => {
    if (profile) {
      setNombreCompleto(profile.nombre_completo ?? profile.nombre ?? '');
      setTelefono(profile.telefono ?? '');
      setCedulaRif(profile.cedula_rif ?? '');
    }
    setErrors({});
    setIsEditing(false);
  };

  const displayName = profile?.nombre_completo || user?.email?.split('@')[0] || 'Usuario';
  const email = user?.email ?? '';

  return (
    <Screen>
      <PageTransition>
        <ScreenHeader
          variant="compact"
          title="Mi Perfil"
          onBack={() => router.back()}
          right={
            loading ? undefined : isEditing ? (
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
                  color={Colors.success}
                />
              </>
            ) : (
              <IconButton
                icon={PencilSimple}
                label="Editar perfil"
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsEditing(true);
                }}
              />
            )
          }
        />

        {loading ? (
          <LoadingState label="Cargando tu perfil…" />
        ) : fetchError ? (
          <EmptyState
            icon={WarningCircle}
            title="No se pudo cargar el perfil"
            description={fetchError}
            action={{ children: 'Reintentar', onPress: () => router.replace('/perfil') }}
          />
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

            <StaggerItem index={1}>
              <Card tone="sunken" padding="md" elevated={false}>
                <SectionLabel>Información personal</SectionLabel>

                {isEditing ? (
                  <>
                    <Field
                      label="Nombre completo"
                      placeholder="Juan Pérez"
                      value={nombreCompleto}
                      onChangeText={setNombreCompleto}
                      editable={!saving}
                      error={errors.nombre}
                    />
                    <Field
                      label="Teléfono"
                      placeholder="04141234567"
                      keyboardType="phone-pad"
                      value={telefono}
                      onChangeText={setTelefono}
                      editable={!saving}
                      error={errors.telefono}
                    />
                    <Field
                      label="Cédula o RIF"
                      placeholder="V-12345678"
                      value={cedulaRif}
                      onChangeText={setCedulaRif}
                      editable={!saving}
                      error={errors.cedula}
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
                      value={profile?.telefono || '—'}
                      divided
                      icon={
                        <Phone color={Colors.mutedForeground} size={Sizes.icon.md} weight="bold" />
                      }
                    />
                    <InfoRow
                      label="Cédula / RIF"
                      value={profile?.cedula_rif || '—'}
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

            <StaggerItem index={2} style={s.actions}>
              {isEditing ? (
                <Button variant="accent" fullWidth loading={saving} onPress={handleSave}>
                  Guardar cambios
                </Button>
              ) : (
                <Button variant="dangerSoft" icon={SignOut} fullWidth onPress={signOut}>
                  Cerrar sesión
                </Button>
              )}

              <Text variant="caption" color="muted" align="center" style={s.version}>
                {`EnBus App v${APP_VERSION}`}
              </Text>
            </StaggerItem>
          </ScrollView>
        )}
      </PageTransition>
    </Screen>
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
  lastField: {
    marginBottom: 0,
  },
  actions: {
    marginTop: Spacing['2xl'],
  },
  version: {
    marginTop: Spacing['2xl'],
  },
});
