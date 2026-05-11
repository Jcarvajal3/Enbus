import { SafeAreaView, ScrollView, View, Text, Pressable, useCSSVariable } from '@/tw';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/contexts/AuthContext';
import { supabase } from '@/src/utils/supabase';
import { CaretLeft, UserCircle, SignOut, Phone, EnvelopeSimple, IdentificationCard } from 'phosphor-react-native';

export default function PerfilScreen() {
  const router = useRouter();
  const { user } = useAuth();

  // ── Colores para los íconos (phosphor no soporta className) ──────────────
  // useCSSVariable lee los tokens de global.css — se mantiene sincronizado con el tema
  const mutedColor = useCSSVariable('--muted-foreground') as string || '#737373';
  const primaryColor = useCSSVariable('--primary') as string || '#e2b714';
  const destructiveColor = useCSSVariable('--destructive') as string || '#dc2626';
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  const displayName = user?.user_metadata?.nombre_completo || user?.email?.split('@')[0] || 'Usuario';
  const email = user?.email || '';
  const telefono = user?.user_metadata?.telefono || '—';
  const cedula = user?.user_metadata?.cedula_rif || '—';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="pb-32">

        {/* Header */}
        <View className="flex-row items-center px-6 py-4 border-b border-border gap-4">
          <Pressable
            onPress={() => router.back()}
            className="size-10 bg-secondary rounded-full items-center justify-center"
          >
            <CaretLeft weight="bold" color={foregroundColor} size={22} />
          </Pressable>
          <Text className="font-heading text-xl text-foreground">Mi Perfil</Text>
        </View>

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
            Información de contacto
          </Text>

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
              <Text className="text-[15px] font-semibold text-foreground">{telefono}</Text>
            </View>
          </View>

          {/* Cédula */}
          <View className="flex-row items-center py-3.5 border-t border-border">
            <IdentificationCard color={mutedColor} size={18} weight="bold" />
            <View className="ml-3 flex-1">
              <Text className="text-[11px] font-semibold text-muted-foreground mb-0.5">Cédula / RIF</Text>
              <Text className="text-[15px] font-semibold text-foreground">{cedula}</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <View className="px-6 mt-3">
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

      </ScrollView>
    </SafeAreaView>
  );
}
