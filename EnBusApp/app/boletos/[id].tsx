import { SafeAreaView } from '@/tw';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View, Text, Pressable } from '@/tw';
import { CaretLeft, Clock } from 'phosphor-react-native';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { Spinner } from '@/src/components/Spinner';
import { supabase } from '@/src/utils/supabase';

export default function DetalleBoletoScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [boleto, setBoleto] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchBoleto = async () => {
      if (!id) return;
      try {
        setLoading(true);
        // id puede ser el UUID o el codigo_boleto. Buscamos por ambos.
        const { data, error } = await supabase
          .from('boletos')
          .select(`
            *,
            viajes (*, rutas (*)),
            cooperativas (*),
            profiles (*)
          `)
          .or(`id.eq.${id},codigo_boleto.eq.${id}`)
          .single();

        if (error) {
          throw error;
        }

        if (isMounted) {
          setBoleto(data);
        }
      } catch (err: any) {
        console.error('Error fetching boleto:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchBoleto();
    return () => { isMounted = false; };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <Spinner size="large" />
      </SafeAreaView>
    );
  }

  if (!boleto) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <Text className="text-muted-foreground font-bold">Boleto no encontrado</Text>
        <Pressable onPress={() => router.back()} className="mt-4 px-6 py-3 bg-secondary rounded-full">
          <Text className="text-foreground">Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Precalculos
  const ruta = boleto.viajes?.rutas;
  const cooperativa = boleto.cooperativas;
  const pasajero = boleto.profiles;
  const fechaSalida = new Date(boleto.viajes?.fecha_hora_salida);
  
  const horasDuration = Math.floor((ruta?.duracion_estimada_min || 0) / 60);
  const minDuration = (ruta?.duracion_estimada_min || 0) % 60;
  
  // Fake Acronimos
  const acronym = (city: string) => city ? city.substring(0, 3).toUpperCase() : 'UNK';

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Navbar Custom */}
      <View className="px-6 pt-4 pb-4 bg-background flex-row justify-between items-center border-b border-border">
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => router.back()} className="size-10 bg-secondary rounded-full flex items-center justify-center">
            <CaretLeft weight="bold" color="#171717" size={24} />
          </Pressable>
          <View>
            <Text className="text-sm font-bold text-muted-foreground uppercase">Boarding Pass</Text>
            <Text className="font-heading text-xl text-foreground">{boleto.codigo_boleto}</Text>
          </View>
        </View>
        <View className={`px-3 py-1 rounded-full ${boleto.estado === 'PAGADO' ? 'bg-success/20' : 'bg-warning/20'}`}>
          <Text className={`font-bold text-xs ${boleto.estado === 'PAGADO' ? 'text-success' : 'text-warning'}`}>
            {boleto.estado}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        <View className="bg-card rounded-[14px] overflow-hidden border border-border mb-8">

          {/* Header del Ticket */}
          <View className="bg-primary p-6 items-center">
            <Text className="text-primary-foreground/80 font-bold uppercase tracking-widest text-xs mb-1">Cooperativa</Text>
            <Text className="text-primary-foreground font-heading text-xl">{cooperativa?.nombre || 'Indefinida'}</Text>
          </View>

          {/* Rutas (Origen -> Destino) */}
          <View className="p-6 border-b border-dashed border-border/50 flex-row justify-between items-center">
            <View className="items-center w-1/3">
              <Text className="text-3xl font-black text-foreground" numberOfLines={1}>{acronym(ruta?.ciudad_origen)}</Text>
              <Text className="text-xs text-muted-foreground font-bold mt-1" numberOfLines={1}>{ruta?.ciudad_origen}</Text>
            </View>

            <View className="flex-1 items-center justify-center border-t-2 border-dashed border-muted mx-4 relative">
              <View className="w-6 h-6 bg-secondary rounded-full items-center justify-center absolute -top-3">
                <Clock color="#a3a3a3" weight="fill" size={14} />
              </View>
              <Text className="text-[10px] text-muted-foreground font-bold mt-4 uppercase text-center">
                {horasDuration}h {minDuration}m
              </Text>
            </View>

            <View className="items-center w-1/3">
              <Text className="text-3xl font-black text-foreground" numberOfLines={1}>{acronym(ruta?.ciudad_destino)}</Text>
              <Text className="text-xs text-muted-foreground font-bold mt-1" numberOfLines={1}>{ruta?.ciudad_destino}</Text>
            </View>
          </View>

          {/* Detalles del Viaje */}
          <View className="p-6 flex-row flex-wrap border-b border-border/30">
            <View className="w-1/2 mb-4 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Pasajero</Text>
              <Text className="text-sm text-foreground font-black" numberOfLines={1}>{pasajero?.nombre_completo}</Text>
            </View>
            <View className="w-1/2 mb-4 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">C.I / Pasaporte</Text>
              <Text className="text-sm text-foreground font-black">{pasajero?.cedula_rif}</Text>
            </View>
            <View className="w-1/2 mb-4 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Fecha de Salida</Text>
              <Text className="text-sm text-foreground font-black">{fechaSalida.toLocaleDateString('es-VE')}</Text>
              <Text className="text-xs text-muted-foreground">{fechaSalida.toLocaleTimeString('es-VE', {hour: '2-digit', minute: '2-digit'})}</Text>
            </View>
            <View className="w-1/2 mb-4 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Asiento</Text>
              <Text className="text-2xl text-primary font-black">{boleto.asiento}</Text>
            </View>
            <View className="w-1/2 pr-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Unidad</Text>
              <Text className="text-sm text-foreground font-black">{boleto.viajes?.numero_unidad || 'N/A'}</Text>
            </View>
            <View className="w-1/2 pl-2">
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Chófer</Text>
              <Text className="text-sm text-foreground font-black" numberOfLines={1}>{boleto.viajes?.nombre_chofer || 'Por asignar'}</Text>
            </View>
          </View>

          {/* QR Integrado */}
          <View className="p-6 items-center bg-secondary/30">
            <Text className="text-xs text-muted-foreground font-bold mb-4 uppercase text-center w-3/4">
              Pase oficial de abordaje. Escanee antes de subir.
            </Text>
            <QRCodeViewer data={`PASS-${boleto.codigo_boleto}`} size={160} autoMaxBrightness={false} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
