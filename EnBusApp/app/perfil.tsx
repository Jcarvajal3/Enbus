import { SafeAreaView, ScrollView, View, Text, Pressable, useCSSVariable } from '@/tw';
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

  // ── Colores para los íconos (phosphor no soporta className) ──────────────
  const mutedColor = useCSSVariable('--muted-foreground') as string || '#737373';
  const primaryColor = useCSSVariable('--primary') as string || '#e2b714';
  const destructiveColor = useCSSVariable('--destructive') as string || '#dc2626';
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';
  const successColor = '#16a34a';

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
      } catch (err: any) {
        // POL-01: Only log in development to avoid leaking Supabase internals in production
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
    // Usa signOut del contexto en lugar de llamar a supabase.auth.signOut() directamente.
    // Evita doble-navegación: el guard de auth en _layout.tsx ya redirige a /login
    // cuando la sesión se anula, por lo que no necesitamos router.replace() manual aquí.
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

      // Actualizar también metadatos de auth para consistencia
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
    // ACC: null-safe — profile could be null if fetch failed
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
      <ScrollView contentContainerClassName="pb-32">

        {/* Header */}
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => router.back()}
              className="size-10 bg-secondary rounded-full items-center justify-center"
            >
              <CaretLeft weight="bold" color={foregroundColor} size={22} />
            </Pressable>
            <Text className="font-heading text-xl text-foreground">Mi Perfil</Text>
          </View>
          
          {!loading && (
            isEditing ? (
              <View className="flex-row gap-2">
                <Pressable
                  onPress={handleCancel}
                  disabled={saving}
                  className="size-10 bg-secondary rounded-full items-center justify-center"
                >
                  <X weight="bold" color={mutedColor} size={20} />
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  className="size-10 bg-primary/10 rounded-full items-center justify-center"
                >
                  {saving ? <Spinner /> : <Check weight="bold" color={successColor} size={20} />}
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setIsEditing(true)}
                className="size-10 bg-secondary rounded-full items-center justify-center"
              >
                <PencilSimple weight="bold" color={foregroundColor} size={20} />
              </Pressable>
            )
          )}
        </View>

        {loading ? (
          <View className="py-20 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : fetchError ? (
          // UX-01: Visible error state with retry option
          <View className="py-20 items-center justify-center px-8 gap-4">
            <WarningCircle color={destructiveColor} size={48} weight="thin" />
            <Text className="text-base font-bold text-foreground text-center">No se pudo cargar el perfil</Text>
            <Text className="text-sm text-muted-foreground text-center">{fetchError}</Text>
          </View>
        ) : (
          <>
            {/* Avatar + Name */}
            <View className="items-center py-8">
              <View className="size-[88px] rounded-full bg-primary/10 items-center justify-center mb-3">
                <UserCircle weight="fill" color={primaryColor} size={72} />
              </View>
              <Text className="text-[22px] font-bold text-foreground mb-1">{displayName}</Text>
              <Text className="text-sm text-muted-foreground">{email}</Text>
            </View>

            {/* Info Card */}
            <View className="mx-6 bg-card border border-border rounded-[14px] p-5">
              <Text className="text-xs font-bold text-muted-foreground uppercase tracking-[0.8px] mb-4">
                Información Personal
              </Text>

              {isEditing ? (
                <View className="gap-2">
                  <InputField
                    label="Nombre Completo"
                    placeholder="Juan Pérez"
                    value={nombreCompleto}
                    onChangeText={setNombreCompleto}
                    editable={!saving}
                  />
                  <InputField
                    label="Teléfono"
                    placeholder="04141234567"
                    keyboardType="phone-pad"
                    value={telefono}
                    onChangeText={setTelefono}
                    editable={!saving}
                  />
                  <InputField
                    label="Cédula o RIF"
                    placeholder="V-12345678"
                    value={cedulaRif}
                    onChangeText={setCedulaRif}
                    editable={!saving}
                  />
                </View>
              ) : (
                <>
                  {/* Correo */}
                  <View className="flex-row items-center py-3.5">
                    <EnvelopeSimple color={mutedColor} size={18} weight="bold" />
                    <View className="ml-3 flex-1">
                      <Text className="text-[11px] font-semibold text-muted-foreground mb-0.5">Correo</Text>
                      <Text className="text-[15px] font-semibold text-foreground">{email}</Text>
                    </View>
                  </View>

                  {/* Teléfono */}
                  <View className="flex-row items-center py-3.5 border-t border-border">
                    <Phone color={mutedColor} size={18} weight="bold" />
                    <View className="ml-3 flex-1">
                      <Text className="text-[11px] font-semibold text-muted-foreground mb-0.5">Teléfono</Text>
                      <Text className="text-[15px] font-semibold text-foreground">{displayTelefono}</Text>
                    </View>
                  </View>

                  {/* Cédula */}
                  <View className="flex-row items-center py-3.5 border-t border-border">
                    <IdentificationCard color={mutedColor} size={18} weight="bold" />
                    <View className="ml-3 flex-1">
                      <Text className="text-[11px] font-semibold text-muted-foreground mb-0.5">Cédula / RIF</Text>
                      <Text className="text-[15px] font-semibold text-foreground">{displayCedula}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Logout */}
            <View className="px-6 mt-6">
              <Pressable
                onPress={handleLogout}
                className="flex-row items-center justify-center h-[52px] rounded-full border border-destructive/30 bg-destructive/5 gap-2.5"
              >
                <SignOut color={destructiveColor} size={20} weight="bold" />
                <Text className="text-[15px] font-bold text-destructive">Cerrar Sesión</Text>
              </Pressable>
            </View>

            {/* Version */}
            <Text className="text-center text-muted-foreground text-xs mt-8">EnBus App v1.0.0</Text>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
