import { SafeAreaView, ScrollView, View, Text, Pressable, useCSSVariable } from '@/tw';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { ResultsList } from '@/src/components/ResultsList';
import { supabase } from '@/src/utils/supabase';
import { normalizeCityForDb } from '@/src/utils/venezuela';
import { SkeletonLoader } from '@/src/components/SkeletonLoader';

export default function ResultadosBusquedaScreen() {
  const router = useRouter();
  const { origen, destino, fecha } = useLocalSearchParams();
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';

  const [loading, setLoading] = useState(true);
  const [resultados, setResultados] = useState<any[]>([]);

  // Filtros y ordenamiento
  const [selectedCoop, setSelectedCoop] = useState<string | null>(null);
  const [sortType, setSortType] = useState<'hora_asc' | 'precio_asc' | 'precio_desc'>('hora_asc');

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        let query = supabase
          .from('viajes')
          .select(`
            id,
            fecha_hora_salida,
            asientos_disponibles,
            rutas!inner ( ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje ),
            cooperativas ( nombre )
          `)
          .eq('estado', 'PROGRAMADO')
          .gt('asientos_disponibles', 0); // ocultar viajes sin capacidad

        if (origen) {
          query = query.eq('rutas.ciudad_origen', normalizeCityForDb(origen as string));
        }
        if (destino) {
          query = query.eq('rutas.ciudad_destino', normalizeCityForDb(destino as string));
        }

        if (fecha) {
          const date = new Date(fecha as string);
          // Create independent Date instances to avoid setHours() mutation side-effects
          const startOfDay = new Date(
            date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0
          ).toISOString();
          const endOfDay = new Date(
            date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999
          ).toISOString();
          query = query
            .gte('fecha_hora_salida', startOfDay)
            .lte('fecha_hora_salida', endOfDay);
        }

        const { data, error } = await query
          .order('fecha_hora_salida', { ascending: true })
          .limit(50);

        if (error) throw error;

        const items = (data || []).map((viaje: any) => {
          const dateObj = new Date(viaje.fecha_hora_salida);
          const ruta = Array.isArray(viaje.rutas) ? viaje.rutas[0] : viaje.rutas;
          const cooperativa = Array.isArray(viaje.cooperativas) ? viaje.cooperativas[0] : viaje.cooperativas;
          return {
            id: viaje.id,
            cooperativa: cooperativa?.nombre || 'Desconocida',
            horaSalida: dateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
            duracion: ruta ? `${Math.floor(ruta.duracion_estimada_min / 60)}h ${ruta.duracion_estimada_min % 60}m` : '0h 0m',
            precio: ruta?.precio_pasaje || 0,
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

  // PERF-02: useMemo prevents re-sorting/re-filtering on every render.
  // Previously these ran on every state update (e.g. pressing a sort button
  // triggered a full sort of all 50 items before painting the new selection).
  const cooperativas = useMemo(
    () => Array.from(new Set(resultados.map(r => r.cooperativa))),
    [resultados]
  );

  const filteredAndSorted = useMemo(() =>
    resultados
      .filter(r => !selectedCoop || r.cooperativa === selectedCoop)
      .sort((a, b) => {
        if (sortType === 'precio_asc') return a.precio - b.precio;
        if (sortType === 'precio_desc') return b.precio - a.precio;
        const timeToMin = (t: string) => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };
        return timeToMin(a.horaSalida) - timeToMin(b.horaSalida);
      })
  , [resultados, selectedCoop, sortType]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 pt-4 pb-4 bg-background shadow-sm border-b border-border/50">
        <View className="flex-row items-center mb-4">
          <Pressable onPress={() => router.back()} className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center mr-4">
            <CaretLeft weight="bold" color={foregroundColor} size={24} />
          </Pressable>
          <View>
            <Text className="text-xs font-bold text-muted-foreground uppercase">Resultados de búsqueda</Text>
            <Text className="font-heading text-xl text-foreground">Selecciona tu Viaje</Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between bg-secondary/40 p-3 rounded-xl">
          <Text className="text-sm font-bold text-foreground flex-1" numberOfLines={1}>{origen}</Text>
          <Text className="text-xs text-muted-foreground px-2">→</Text>
          <Text className="text-sm font-bold text-foreground flex-1 text-right" numberOfLines={1}>{destino}</Text>
        </View>
      </View>

      {/* Panel de Filtros y Ordenamiento */}
      {!loading && resultados.length > 0 && (
        <View className="px-6 py-3 bg-secondary/20 border-b border-border/30">
          {/* Fila 1: Cooperativas (Horizontal scroll) */}
          <Text className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Filtrar por Cooperativa</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-2">
            <Pressable
              onPress={() => setSelectedCoop(null)}
              className={`px-3 py-1.5 rounded-full border ${!selectedCoop ? 'bg-primary border-primary' : 'bg-card border-border'}`}
            >
              <Text className={`text-xs font-bold ${!selectedCoop ? 'text-primary-foreground' : 'text-foreground'}`}>
                Todas
              </Text>
            </Pressable>
            {cooperativas.map((coop) => (
              <Pressable
                key={coop}
                onPress={() => setSelectedCoop(coop)}
                className={`px-3 py-1.5 rounded-full border ${selectedCoop === coop ? 'bg-primary border-primary' : 'bg-card border-border'}`}
              >
                <Text className={`text-xs font-bold ${selectedCoop === coop ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {coop}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Fila 2: Ordenamiento */}
          <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-border/30">
            <Text className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ordenar por</Text>
            <View className="flex-row gap-1.5">
              {(
                [
                  { id: 'hora_asc', label: '⏰ Horario' },
                  { id: 'precio_asc', label: '💵 Menor $' },
                  { id: 'precio_desc', label: '💵 Mayor $' }
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => setSortType(opt.id)}
                  className={`px-2.5 py-1 rounded-lg border ${sortType === opt.id ? 'bg-primary/10 border-primary/30' : 'bg-transparent border-transparent'}`}
                >
                  <Text className={`text-xs font-semibold ${sortType === opt.id ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Contenido principal */}
      <View className="flex-1 px-6">
        {loading ? (
          <View className="py-6 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <View key={i} className="bg-card border border-border p-4 rounded-[14px] flex-row items-center justify-between">
                <View className="items-center mr-4 w-16 gap-1.5">
                  <SkeletonLoader width={50} height={18} />
                  <SkeletonLoader width={40} height={10} />
                </View>
                <View className="flex-1 border-l border-border/50 pl-4 gap-2">
                  <SkeletonLoader width="80%" height={14} />
                  <SkeletonLoader width="50%" height={10} />
                </View>
                <View className="items-end justify-center pl-2 gap-1.5">
                  <SkeletonLoader width={40} height={18} />
                  <SkeletonLoader width={24} height={24} borderRadius={12} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <ResultsList
            data={filteredAndSorted}
            onSelect={(id) => {
              router.push({ pathname: '/viajes/[id]' as any, params: { id } });
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
