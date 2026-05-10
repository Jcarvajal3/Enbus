import { SafeAreaView } from '@/tw';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, Pressable } from '@/tw';
import { ActivityIndicator } from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { ResultsList } from '@/src/components/ResultsList';
import { supabase } from '@/src/utils/supabase';

export default function ResultadosBusquedaScreen() {
  const router = useRouter();
  const { origen, destino, fecha } = useLocalSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [resultados, setResultados] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        // En una app real filtraríamos por viaje con la ruta específica entre Date y Date.
        // Por la limitación actual de datos semilla, mostraremos viajes de estado PROGRAMADO.
        const { data, error } = await supabase
          .from('viajes')
          .select(`
            id,
            fecha_hora_salida,
            asientos_disponibles,
            rutas!inner ( ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje ),
            cooperativas ( nombre )
          `)
          .eq('estado', 'PROGRAMADO');

        if (error) throw error;
        
        // Transformar data para adaptarla al ResultsList
        const items = (data || []).map(viaje => {
          const dateObj = new Date(viaje.fecha_hora_salida);
          return {
            id: viaje.id,
            cooperativa: viaje.cooperativas?.nombre || 'Desconocida',
            horaSalida: dateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
            duracion: `${Math.floor(viaje.rutas?.duracion_estimada_min / 60)}h ${viaje.rutas?.duracion_estimada_min % 60}m`,
            precio: viaje.rutas?.precio_pasaje || 0,
            asientosDisponibles: viaje.asientos_disponibles
          };
        });

        if (isMounted) setResultados(items);
      } catch (err) {
        console.error('Error buscando viajes:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [origen, destino, fecha]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-4 bg-background shadow-sm border-b border-border/50">
        <View className="flex-row items-center mb-4">
          <Pressable onPress={() => router.back()} className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center mr-4">
             <CaretLeft weight="bold" color="#171717" size={24} />
          </Pressable>
          <Text className="font-heading text-xl text-foreground">Selecciona tu Viaje</Text>
        </View>
        <View className="flex-row items-center space-x-2">
          <Text className="text-sm font-bold text-foreground flex-1" numberOfLines={1}>{origen}</Text>
          <Text className="text-xs text-muted-foreground">→</Text>
          <Text className="text-sm font-bold text-foreground flex-1 right" numberOfLines={1}>{destino}</Text>
        </View>
      </View>

      <View className="flex-1 px-6">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#6b4a1a" />
          </View>
        ) : (
          <ResultsList 
            data={resultados} 
            onSelect={(id) => {
              router.push({ pathname: '/viajes/[id]' as any, params: { id } });
            }} 
          />
        )}
      </View>
    </SafeAreaView>
  );
}
