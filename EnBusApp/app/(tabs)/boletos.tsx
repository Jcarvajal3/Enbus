import { SafeAreaView } from '@/tw';
import { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable } from '@/tw';
import { FlatList, RefreshControl, ListRenderItem } from 'react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { useRouter } from 'expo-router';
import { TransactionCard } from '@/src/components/TransactionCard';
import { CardSkeleton } from '@/src/components/CardSkeleton';
import { Modal } from 'react-native';
import { Ticket, Bus } from 'phosphor-react-native';
import { SearchForm } from '@/src/components/SearchForm';
import { useFocusEffect } from '@react-navigation/native';
import { formatDate, formatCity } from '@/src/utils/formatters';


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

  const [refreshing, setRefreshing] = useState(false);

  const { data: historial, loading, refetch } = useRealtime<any>(
    'boletos',
    'comprador_id',
    user?.id,
    '*, viajes(*, rutas(ciudad_origen, ciudad_destino))',
    { enabled: isFocused && !!user?.id, limit: 30 }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // PERF-02: Memoize the renderItem callback so FlatList doesn't re-render
  // all rows when this component re-renders for unrelated state changes.
  const renderItem = useCallback<ListRenderItem<any>>(({ item: bol }) => (
    <View className="mb-4 w-full">
      <TransactionCard
        type="boleto"
        id={bol.codigo_boleto || bol.id}
        estado={bol.estado}
        titulo={`${formatCity(bol.viajes?.rutas?.ciudad_origen) || 'Origen'} → ${formatCity(bol.viajes?.rutas?.ciudad_destino) || 'Destino'}`}
        subtitulo={formatDate(bol.created_at)}
        onPress={() => router.push({
          pathname: '/boletos/[id]',
          params: { id: bol.codigo_boleto || bol.id }
        })}
      />
    </View>
  ), [router]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const emptyComponent = useMemo(() => (
    <View className="py-20 items-center justify-center">
      <View className="size-24 bg-secondary rounded-full items-center justify-center mb-6">
        <Ticket color="#a3a3a3" weight="bold" size={32} />
      </View>
      <Text className="text-xl font-bold text-foreground mb-2">No has viajado aún</Text>
      <Text className="text-base text-muted-foreground text-center px-4">
        Busca y reserva pasajes a cualquier parte de Venezuela fácilmente.
      </Text>
    </View>
  ), []);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 pt-6 pb-6 bg-background z-10 border-b border-border">
        <Text className="font-heading text-3xl text-foreground mb-1">Mis Viajes</Text>
        <Text className="text-sm font-medium text-muted-foreground">Historial completo de tus pasajes</Text>
      </View>

      {/* PERF-01: FlatList replaces ScrollView + .map() for virtualized rendering */}
      {loading ? (
        <View className="p-6">
          <CardSkeleton count={3} />
        </View>
      ) : (
        <FlatList
          data={historial ?? []}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={{ padding: 24, paddingBottom: 128 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#e2b714']}
              tintColor="#e2b714"
            />
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
        />
      )}

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
