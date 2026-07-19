import { SafeAreaView, ScrollView, View, Text } from '@/tw';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/contexts/AuthContext';
import { supabase } from '@/src/utils/supabase';
import { useCallback, useEffect, useState } from 'react';
import { CaretLeft, UserCircle, SignOut, Phone, EnvelopeSimple, IdentificationCard, PencilSimple, Check, X, WarningCircle } from 'phosphor-react-native';
import { InputField } from '@/src/components/InputField';
import { Spinner } from '@/src/components/Spinner';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import type { PerfilUsuario } from '@/src/types';
import { sanitizeText } from '@/src/utils/validation';
import { PressableScale } from '@/src/components/PressableScale';
import { PageTransition } from '@/src/components/PageTransition';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Radius } from '@/src/theme';

export default function PerfilScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState<PerfilUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cedulaRif, setCedulaRif] = useState('');
  const [saving, setSaving] = useState(false);

  // P2: Fade in on mount
  const avatarOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardY = useSharedValue(12);
  const actionsOpacity = useSharedValue(0);

  const animateIn = () => {
    const ease = Easing.out(Easing.cubic);
    avatarOpacity.value = withTiming(1, { duration: 350, easing: ease });
    cardOpacity.value = withDelay(80, withTiming(1, { duration: 350, easing: ease }));
    cardY.value = withDelay(80, withTiming(0, { duration: 350, easing: ease }));
    actionsOpacity.value = withDelay(180, withTiming(1, { duration: 280, easing: ease }));
  };

  const avatarStyle = useAnimatedStyle(() => ({ opacity: avatarOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actionsOpacity.value }));

  const mutedColor = Colors.mutedForeground;
  const primaryColor = Colors.primary;
  const destructiveColor = Colors.destructive;
  const foregroundColor = Colors.foreground;
  const successColor = Colors.success;

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
          animateIn();
        }
      } catch (err: any) {
        if (__DEV__) console.error('Error fetching profile:', err.message);
        if (isMounted) setFetchError(err.message ?? 'No se pudo cargar el perfil.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProfile();
    return () => { isMounted = false; };
  }, [user]);

  const handleLogout = async () => {
    await signOut();
  };

  const handleSave = useCallback(async () => {
    if (!user) return;
    if (sanitizeText(nombreCompleto).length < 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('error', 'El nombre debe tener al menos 2 caracteres');
      return;
    }
    if (sanitizeText(telefono).length < 8) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('error', 'El teléfono debe tener al menos 8 caracteres');
      return;
    }
    if (sanitizeText(cedulaRif).length < 4) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('error', 'La cédula/RIF debe tener al menos 4 caracteres');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          nombre_completo: sanitizeText(nombreCompleto),
          telefono: sanitizeText(telefono),
          cedula_rif: sanitizeText(cedulaRif),
        })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => prev ? ({
        ...prev,
        nombre_completo: sanitizeText(nombreCompleto),
        telefono: sanitizeText(telefono),
        cedula_rif: sanitizeText(cedulaRif),
      }) : prev);

      await supabase.auth.updateUser({
        data: {
          nombre_completo: sanitizeText(nombreCompleto),
          telefono: sanitizeText(telefono),
          cedula_rif: sanitizeText(cedulaRif),
        }
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Perfil actualizado correctamente');
      setIsEditing(false);
    } catch (err: any) {
      if (__DEV__) console.error('Error saving profile:', err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', 'No se pudieron guardar los cambios: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [user, nombreCompleto, telefono, cedulaRif, toast]);

  const handleCancel = () => {
    if (profile) {
      setNombreCompleto(profile.nombre ?? profile.nombre_completo ?? '');
      setTelefono(profile.telefono ?? '');
      setCedulaRif(profile.cedula_rif ?? '');
    }
    setIsEditing(false);
  };

  const displayName = profile?.nombre_completo || user?.email?.split('@')[0] || 'Usuario';
  const email = user?.email || '';
  const displayTelefono = profile?.telefono || '—';
  const displayCedula = profile?.cedula_rif || '—';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <PageTransition>
        <ScrollView contentContainerStyle={{ paddingBottom: 128 }}>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <PressableScale
                onPress={() => router.back()}
                style={styles.iconBtn}
              >
                <CaretLeft weight="bold" color={foregroundColor} size={22} />
              </PressableScale>
              <Text style={{ fontFamily: Typography.family }} className="font-heading text-xl text-foreground">Mi Perfil</Text>
            </View>

            {!loading && (
              isEditing ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PressableScale
                    onPress={handleCancel}
                    disabled={saving}
                    style={styles.iconBtn}
                  >
                    <X weight="bold" color={mutedColor} size={20} />
                  </PressableScale>
                  <PressableScale
                    onPress={handleSave}
                    disabled={saving}
                    haptic
                    hapticType="medium"
                    style={styles.iconBtn}
                  >
                    {saving ? <Spinner /> : <Check weight="bold" color={successColor} size={20} />}
                  </PressableScale>
                </View>
              ) : (
                <PressableScale
                  onPress={() => {
                    Haptics.selectionAsync();
                    setIsEditing(true);
                  }}
                  style={styles.iconBtn}
                >
                  <PencilSimple weight="bold" color={foregroundColor} size={20} />
                </PressableScale>
              )
            )}
          </View>

          {loading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center' }}>
              <Spinner size="large" />
            </View>
          ) : fetchError ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
              <WarningCircle color={destructiveColor} size={48} weight="thin" />
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground, textAlign: 'center', fontFamily: Typography.family }}>No se pudo cargar el perfil</Text>
              <Text style={{ fontSize: 14, color: Colors.mutedForeground, textAlign: 'center', fontFamily: Typography.family }}>{fetchError}</Text>
            </View>
          ) : (
            <>
              {/* Avatar animado */}
              <Animated.View style={[styles.avatarSection, avatarStyle]}>
                <View style={styles.avatarCircle}>
                  <UserCircle weight="fill" color={primaryColor} size={72} />
                </View>
                <Text style={styles.avatarName}>{displayName}</Text>
                <Text style={styles.avatarEmail}>{email}</Text>
              </Animated.View>

              {/* Info Card animada */}
              <Animated.View style={[{ marginHorizontal: 24 }, cardStyle]}>
                <View style={styles.card}>
                  <Text style={styles.sectionLabel}>Información Personal</Text>

                  {isEditing ? (
                    <View style={{ gap: 8 }}>
                      <InputField
                        label="Nombre Completo"
                        placeholder="Juan Pérez"
                        value={nombreCompleto}
                        onChangeText={setNombreCompleto}
                        editable={!saving}
                        inputContainerStyle={styles.inputContainer}
                        labelStyle={styles.inputLabel}
                        style={styles.inputText}
                      />
                      <InputField
                        label="Teléfono"
                        placeholder="04141234567"
                        keyboardType="phone-pad"
                        value={telefono}
                        onChangeText={setTelefono}
                        editable={!saving}
                        inputContainerStyle={styles.inputContainer}
                        labelStyle={styles.inputLabel}
                        style={styles.inputText}
                      />
                      <InputField
                        label="Cédula o RIF"
                        placeholder="V-12345678"
                        value={cedulaRif}
                        onChangeText={setCedulaRif}
                        editable={!saving}
                        inputContainerStyle={styles.inputContainer}
                        labelStyle={styles.inputLabel}
                        style={styles.inputText}
                      />
                    </View>
                  ) : (
                    <>
                      <View style={styles.infoRow}>
                        <EnvelopeSimple color={mutedColor} size={18} weight="bold" />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={styles.infoLabel}>Correo</Text>
                          <Text style={styles.infoValue}>{email}</Text>
                        </View>
                      </View>

                      <View style={[styles.infoRow, styles.infoRowBorder]}>
                        <Phone color={mutedColor} size={18} weight="bold" />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={styles.infoLabel}>Teléfono</Text>
                          <Text style={styles.infoValue}>{displayTelefono}</Text>
                        </View>
                      </View>

                      <View style={[styles.infoRow, styles.infoRowBorder]}>
                        <IdentificationCard color={mutedColor} size={18} weight="bold" />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={styles.infoLabel}>Cédula / RIF</Text>
                          <Text style={styles.infoValue}>{displayCedula}</Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              </Animated.View>

              {/* Logout animado */}
              <Animated.View style={[{ paddingHorizontal: 24, marginTop: 24 }, actionsStyle]}>
                <PressableScale
                  onPress={handleLogout}
                  haptic
                  hapticType="medium"
                  style={styles.logoutBtn}
                >
                  <SignOut color={destructiveColor} size={20} weight="bold" />
                  <Text style={styles.logoutText}>Cerrar Sesión</Text>
                </PressableScale>
              </Animated.View>

              <Text style={styles.version}>EnBus App v1.0.0</Text>
            </>
          )}
        </ScrollView>
      </PageTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  iconBtn: {
    width: 44,
    height: 44,
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarName: {
    fontFamily: Typography.family,
    fontSize: 22,
    fontWeight: '700',
    color: Colors.foreground,
    marginBottom: 4,
  },
  avatarEmail: {
    fontFamily: Typography.family,
    fontSize: 13,
    color: Colors.mutedForeground,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
  },
  sectionLabel: {
    fontFamily: Typography.family,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  infoLabel: {
    fontFamily: Typography.family,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.mutedForeground,
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: Typography.family,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.foreground,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
    gap: 10,
  },
  logoutText: {
    fontFamily: Typography.family,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.destructive,
  },
  version: {
    fontFamily: Typography.family,
    textAlign: 'center',
    color: Colors.mutedForeground,
    fontSize: 11,
    marginTop: 32,
  },
  inputContainer: {
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    borderWidth: 0,
  },
  inputLabel: {
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
  },
  inputText: {
    fontFamily: Typography.family,
    color: Colors.foreground,
  },
});
