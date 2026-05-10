import { StyleSheet } from 'react-native';
import { SafeAreaView, ScrollView, View, Text, Pressable } from '@/tw';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/contexts/AuthContext';
import { supabase } from '@/src/utils/supabase';
import { CaretLeft, UserCircle, SignOut, Phone, EnvelopeSimple, IdentificationCard } from 'phosphor-react-native';

const C = {
  bg: '#ffffff',
  border: '#e5e5e5',
  secondary: '#f4f4f5',
  foreground: '#171717',
  muted: '#737373',
  primary: '#e2b714',
  primaryFg: '#6b4a1a',
  destructive: '#dc2626',
  radius: 14,
};

export default function PerfilScreen() {
  const router = useRouter();
  const { user, session } = useAuth();

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
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <CaretLeft weight="bold" color={C.foreground} size={22} />
          </Pressable>
          <Text className="font-heading text-xl text-foreground">Mi Perfil</Text>
        </View>

        {/* Avatar + Name */}
        <View style={s.avatarSection}>
          <View style={s.avatarCircle}>
            <UserCircle weight="fill" color={C.primary} size={72} />
          </View>
          <Text style={s.displayName}>{displayName}</Text>
          <Text style={s.emailLabel}>{email}</Text>
        </View>

        {/* Info Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Información de contacto</Text>

          <View style={s.infoRow}>
            <EnvelopeSimple color={C.muted} size={18} weight="bold" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={s.infoLabel}>Correo</Text>
              <Text style={s.infoValue}>{email}</Text>
            </View>
          </View>

          <View style={[s.infoRow, s.infoRowBorder]}>
            <Phone color={C.muted} size={18} weight="bold" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={s.infoLabel}>Teléfono</Text>
              <Text style={s.infoValue}>{telefono}</Text>
            </View>
          </View>

          <View style={[s.infoRow, s.infoRowBorder]}>
            <IdentificationCard color={C.muted} size={18} weight="bold" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={s.infoLabel}>Cédula / RIF</Text>
              <Text style={s.infoValue}>{cedula}</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <View style={{ paddingHorizontal: 24, marginTop: 12 }}>
          <Pressable style={s.logoutBtn} onPress={handleLogout}>
            <SignOut color={C.destructive} size={20} weight="bold" />
            <Text style={s.logoutText}>Cerrar Sesión</Text>
          </Pressable>
        </View>

        {/* Version */}
        <Text style={s.version}>EnBus App v1.0.0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#fdf5d3',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  displayName: {
    fontSize: 22, fontWeight: '700',
    color: C.foreground, marginBottom: 4,
  },
  emailLabel: { fontSize: 14, color: C.muted },
  card: {
    marginHorizontal: 24,
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    borderRadius: C.radius, padding: 20,
  },
  cardTitle: {
    fontSize: 12, fontWeight: '700',
    color: C.muted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14,
  },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  infoLabel: { fontSize: 11, color: C.muted, fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 15, color: C.foreground, fontWeight: '600' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center',
    height: 52, borderRadius: 26,
    borderWidth: 1.5, borderColor: '#fee2e2',
    backgroundColor: '#fff5f5', gap: 10,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: C.destructive },
  version: {
    textAlign: 'center', color: C.muted,
    fontSize: 12, marginTop: 32,
  },
});
