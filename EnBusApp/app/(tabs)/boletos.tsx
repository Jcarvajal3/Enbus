import { SafeAreaView } from '@/tw';
import { useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable } from '@/tw';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { useRouter } from 'expo-router';
import { TransactionCard } from '@/src/components/TransactionCard';
import { Modal } from 'react-native';
import { Ticket, Bus } from 'phosphor-react-native';
import { SearchForm } from '@/src/components/SearchForm';
import { Spinner } from '@/src/components/Spinner';
import { useFocusEffect } from '@react-navigation/native';
import { formatDate } from '@/src/utils/formatters';

export default function BoletosScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);

  // ── Pausa la suscripción cuando esta tab no está activa ───────────────────
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const { data: historial, loading } = useRealtime<any>(
    'boletos',
    'comprador_id',
    user?.id,
    '*, viajes(*, rutas(ciudad_origen, ciudad_destino))',
    { enabled: isFocused && !!user?.id, limit: 30 }
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 pt-6 pb-6 bg-background z-10 border-b border-border">
        <Text className="font-heading text-3xl text-foreground mb-1">Mis Viajes</Text>
        <Text className="text-sm font-medium text-muted-foreground">Historial completo de tus pasajes</Text>
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        {loading ? (
          <View className="py-20 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : historial && historial.length > 0 ? (
          <View className="items-center">
            {historial.map((bol) => (
              <View key={bol.id} className="mb-4">
                <TransactionCard
                  type="boleto"
                  id={bol.codigo_boleto || bol.id}
                  estado={bol.estado}
                  titulo={`${bol.viajes?.rutas?.ciudad_origen || 'Origen'} → ${bol.viajes?.rutas?.ciudad_destino || 'Destino'}`}
                  subtitulo={formatDate(bol.created_at)}
                  onPress={() => router.push({
                    pathname: '/boletos/[id]',
                    params: { id: bol.codigo_boleto || bol.id }
                  })}
                />
              </View>
            ))}
          </View>
        ) : (
          <View className="py-20 items-center justify-center">
            <View className="size-24 bg-secondary rounded-full items-center justify-center mb-6">
              <Ticket color="#a3a3a3" weight="bold" size={32} />
            </View>
            <Text className="text-xl font-bold text-foreground mb-2">No has viajado aún</Text>
            <Text className="text-base text-muted-foreground text-center px-4">
              Busca y reserva pasajes a cualquier parte de Venezuela fácilmente.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button CTA */}
      <View className="absolute bottom-6 left-6 right-6">
        <Pressable
          onPress={() => setIsSearchModalVisible(true)}
          className="bg-primary h-12 rounded-[10px] flex-row items-center justify-center gap-2"
        >
          <Bus color="#6b4a1a" weight="bold" size={24} />
          <Text className="text-primary-foreground font-bold text-lg ml-2">
            Buscar Viaje
          </Text>
        </Pressable>
      </View>

      {/* Modal de búsqueda */}
      <Modal visible={isSearchModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsSearchModalVisible(false)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="px-6 pt-4 pb-4 bg-background flex-row items-center justify-between border-b border-border">
            <Text className="font-heading text-xl text-foreground">Buscar Boletos</Text>
            <Pressable onPress={() => setIsSearchModalVisible(false)} className="size-10 bg-secondary rounded-full flex items-center justify-center">
              <Text className="text-foreground font-bold text-lg">✕</Text>
            </Pressable>
          </View>
          <View className="p-6">
            <SearchForm
              mode="boletos"
              showModeToggle={false}
              onSubmit={(data) => {
                setIsSearchModalVisible(false);
                router.push({
                  pathname: '/boletos/resultados',
                  params: {
                    origen: data.origen.ciudad,
                    destino: data.destino.ciudad,
                    fecha: data.fecha || ''
                  }
                });
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
