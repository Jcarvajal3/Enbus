import { StyleSheet } from 'react-native';
import { SafeAreaView, View, Text, Pressable } from '@/tw';
import { useRouter } from 'expo-router';
import { CaretLeft, Bell } from 'phosphor-react-native';

const C = {
  bg: '#ffffff', border: '#e5e5e5', secondary: '#f4f4f5',
  foreground: '#171717', muted: '#737373',
};

export default function NotificacionesScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <CaretLeft weight="bold" color={C.foreground} size={22} />
        </Pressable>
        <Text className="font-heading text-xl text-foreground">Notificaciones</Text>
      </View>

      <View style={s.empty}>
        <Bell color={C.muted} size={48} weight="thin" />
        <Text style={s.emptyTitle}>Sin notificaciones</Text>
        <Text style={s.emptyDesc}>Aquí aparecerán los cambios de estado de tus paquetes y viajes.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.secondary, alignItems: 'center', justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.foreground },
  emptyDesc: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 22 },
});
