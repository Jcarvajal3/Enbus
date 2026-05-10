import { SafeAreaView } from '@/tw';
import { ScrollView, View, Text, Pressable } from '@/tw';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRealtime } from '@/src/hooks/useRealtime';
import { SearchForm } from '@/src/components/SearchForm';
import { TransactionCard } from '@/src/components/TransactionCard';
import { Bell, UserCircle } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { Spinner } from '@/src/components/Spinner';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // En el futuro, reemplazaremos esto con Vistas o RLS puras
  // Por propósitos de la Fase 4 de UI, usaremos la tabla directo filtrando el `sender_id`
  const { data: encomiendas, loading: loadingEnvios } = useRealtime<any>(
    'encomiendas',
    'sender_id',
    user?.id
  );

  const { data: boletos, loading: loadingBoletos } = useRealtime<any>(
    'boletos',
    'comprador_id',
    user?.id
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="pb-10">

        {/* Header Premium */}
        <View className="px-6 py-8 bg-background rounded-b-[40px] border-b border-border mb-6">
          <View className="flex-row justify-between items-center mb-8">
            <View>
              <Text className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">
                Bienvenido
              </Text>
              <Text className="font-heading text-3xl text-foreground">
                ¡Hola{user?.email ? `, ${user.email.split('@')[0]}` : ''}!
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => router.push('/notificaciones')} className="size-12 bg-secondary rounded-full items-center justify-center">
                <Bell weight="bold" size={22} color="#171717" />
              </Pressable>
              <Pressable onPress={() => router.push('/perfil')} className="size-12 bg-secondary rounded-full items-center justify-center">
                <UserCircle weight="fill" size={26} color="#171717" />
              </Pressable>
            </View>
          </View>

          {/* Search Form Widget */}
          <SearchForm
            showModeToggle={true}
            onSubmit={(data) => {
              if (data.mode === 'boletos') {
                router.push({
                  pathname: '/boletos/resultados',
                  params: { origen: data.origen.ciudad, destino: data.destino.ciudad, fecha: data.fecha ?? '' }
                });
              } else {
                router.push('/encomiendas/nueva');
              }
            }}
          />
        </View>

        {/* Sección de Activos */}
        <View className="px-6">

          {/* Encomiendas Activas */}
          {(loadingEnvios || (encomiendas && encomiendas.length > 0)) && (
            <View className="mb-8">
              <Text className="font-heading text-xl text-foreground mb-4">
                Paquetes en curso
              </Text>

              {loadingEnvios ? (
                <View className="py-8 items-center"><Spinner /></View>
              ) : (
                <View className="flex-col gap-3">
                  {encomiendas.map((enc) => (
                    <TransactionCard
                      key={enc.id}
                      type="encomienda_envio"
                      id={enc.tracking_id || enc.id}
                      estado={enc.estado}
                      titulo={enc.estado === 'ENTREGADA' ? 'Entregado a destinatario' : 'En camino hacia destino'}
                      subtitulo={new Date(enc.created_at).toLocaleDateString()}
                      onPress={() => router.push({
                        pathname: '/encomiendas/enviar/[id]',
                        params: { id: enc.id }
                      })}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Boletos Activos */}
          {(loadingBoletos || (boletos && boletos.length > 0)) && (
            <View className="mb-4">
              <Text className="font-heading text-xl text-foreground mb-4">
                Próximos Viajes
              </Text>

              {loadingBoletos ? (
                <View className="py-8 items-center"><Spinner /></View>
              ) : (
                <View className="flex-col gap-3">
                  {boletos.map((bol) => (
                    <TransactionCard
                      key={bol.id}
                      type="boleto"
                      id={bol.codigo || bol.id}
                      estado={bol.estado}
                      titulo="Viaje Interurbano"
                      subtitulo={new Date(bol.created_at).toLocaleDateString()}
                      onPress={() => router.push({
                        pathname: '/boletos/[id]',
                        params: { id: bol.codigo || bol.id }
                      })}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
