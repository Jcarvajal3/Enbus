import { SafeAreaView } from '@/tw';
import { useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable } from '@/tw';
import { useAuth } from '@/src/contexts/AuthContext';
import { useEncomiendas } from '@/src/hooks/useEncomiendas';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TransactionCard } from '@/src/components/TransactionCard';
import { ActivityIndicator } from 'react-native';
import { Plus } from 'phosphor-react-native';
import { Spinner } from '@/src/components/Spinner';

export default function EncomiendasScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'recibir' | 'enviar'>('recibir');

  const { data: todasLasEncomiendas, loading, refetch } = useEncomiendas(user?.id);

  // Refetch automático cada vez que esta tab recibe foco (ej: al volver de crear un envío)
  useFocusEffect(
    useCallback(() => {
      if (user?.id) refetch();
    }, [user?.id, refetch])
  );

  // Categorización local basada en el rol del usuario frente a c/u
  const historial = (todasLasEncomiendas || []).filter((enc: any) => {
    if (tab === 'enviar') return enc.sender_id === user?.id;
    // Verificación positiva: soy el destinatario registrado
    return enc.receiver_user_id === user?.id;
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header Tabs */}
      <View className="px-6 pt-6 pb-4 bg-background z-10 border-b border-border">
        <Text className="font-heading text-3xl text-foreground mb-6">Mis Paquetes</Text>

        <View className="flex-row bg-secondary p-1 rounded-2xl">
          <Pressable
            onPress={() => setTab('recibir')}
            className={`flex-1 py-3 rounded-xl items-center ${tab === 'recibir' ? 'bg-background shadow-sm' : ''}`}
          >
            <Text className={`font-bold ${tab === 'recibir' ? 'text-primary' : 'text-muted-foreground'}`}>
              Para Mí
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('enviar')}
            className={`flex-1 py-3 rounded-xl items-center ${tab === 'enviar' ? 'bg-background shadow-sm' : ''}`}
          >
            <Text className={`font-bold ${tab === 'enviar' ? 'text-primary' : 'text-muted-foreground'}`}>
              Enviados
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        {loading ? (
          <View className="py-20 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : historial && historial.length > 0 ? (
          <View className="items-center">
            {historial.map((enc) => (
              <View key={enc.id} className="mb-4">
                <TransactionCard
                  type={tab === 'enviar' ? "encomienda_envio" : "encomienda_recepcion"}
                  id={enc.tracking_id || enc.id}
                  estado={enc.estado}
                  titulo={tab === 'enviar' ? 'Envío Regular' : 'Paquete Entrante'}
                  subtitulo={new Date(enc.created_at).toLocaleDateString()}
                  onPress={() => router.push({
                    pathname: tab === 'enviar'
                      ? '/encomiendas/enviar/[id]' as any
                      : '/encomiendas/recibir/[id]' as any,
                    params: { id: enc.id }
                  })}
                />
              </View>
            ))}
          </View>
        ) : (
          <View className="py-20 items-center justify-center">
            <View className="size-24 bg-secondary rounded-full items-center justify-center mb-6">
              <Plus color="#a3a3a3" weight="bold" size={32} />
            </View>
            <Text className="text-xl font-bold text-foreground mb-2">Sin encomiendas</Text>
            <Text className="text-base text-muted-foreground text-center px-4">
              {tab === 'enviar'
                ? 'No tienes envíos registrados por los momentos.'
                : 'No tienes paquetes en camino hacia ti.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button CTA */}
      <View className="absolute bottom-6 left-6 right-6">
        <Pressable
          onPress={() => router.push('/encomiendas/nueva')}
          className="bg-primary h-12 rounded-[10px] flex-row items-center justify-center gap-2"
        >
          <Plus color="#6b4a1a" weight="bold" size={20} />
          <Text className="text-primary-foreground font-bold text-lg">
            Crear Nuevo Envío
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
