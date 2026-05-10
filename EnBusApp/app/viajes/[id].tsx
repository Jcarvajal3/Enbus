import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, ScrollView, View, Text, Pressable } from '@/tw';
import { ActivityIndicator } from 'react-native';
import { CaretLeft, Clock, Star } from 'phosphor-react-native';
import { SeatSelector } from '@/src/components/SeatSelector';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { Spinner } from '@/src/components/Spinner';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';

export default function DetalleViajeScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [viaje, setViaje] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [asientosSeleccionados, setAsientosSeleccionados] = useState<string[]>([]);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchViaje = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('viajes')
          .select(`
            *,
            rutas (*),
            cooperativas (*)
          `)
          .eq('id', id)
          .single();

        if (error) throw error;
        if (isMounted) setViaje(data);
      } catch (err: any) {
        console.error('Error fetching viaje:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchViaje();
    return () => { isMounted = false; };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <Spinner size="large" />
      </SafeAreaView>
    );
  }

  if (!viaje) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <Text className="text-muted-foreground font-bold">Viaje no encontrado</Text>
        <Pressable onPress={() => router.back()} className="mt-4 px-6 py-3 bg-secondary rounded-full">
          <Text className="text-foreground">Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const ruta = viaje.rutas;
  const cooperativa = viaje.cooperativas;
  const fechaSalida = new Date(viaje.fecha_hora_salida);
  const horasDuration = Math.floor((ruta?.duracion_estimada_min || 0) / 60);
  const minDuration = (ruta?.duracion_estimada_min || 0) % 60;
  const precioUnitario = ruta?.precio_pasaje || 0;

  // Los asientos ocupados serían calculados por la diferencia entre totales y disponibles.
  // En un MVP, generamos una lista simulada basada en la data real del viaje.
  const ocupados = Array.from(
    { length: viaje.asientos_totales - viaje.asientos_disponibles },
    (_, i) => String(i + 1)
  );

  const handleConfirmSeats = (asientos: string[]) => {
    setAsientosSeleccionados(asientos);
    setShowPayment(true);
  };

  const handlePaymentSuccess = async () => {
    if (!user) return;
    try {
      const inserts = asientosSeleccionados.map((asiento) => ({
        codigo_boleto: `BOL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        comprador_id: user.id,
        viaje_id: viaje.id,
        cooperativa_id: cooperativa.id,
        asiento: asiento,
        precio: precioUnitario,
        estado: 'PAGADO', // MVP auto-aprueba el pago
        reserva_expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }));

      const { data, error } = await supabase.from('boletos').insert(inserts).select('codigo_boleto');
      if (error) throw error;

      // Navegamos al PDF/Boarding Pass del primer boleto emitido
      router.replace({ pathname: '/boletos/[id]' as any, params: { id: data[0].codigo_boleto } });
    } catch (err: any) {
      alert('Error procesando pago: ' + err.message);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 pt-4 pb-4 bg-background border-b border-border">
        <View className="flex-row items-center">
          <Pressable onPress={() => showPayment ? setShowPayment(false) : router.back()} className="size-10 bg-secondary rounded-full flex items-center justify-center mr-4">
            <CaretLeft weight="bold" color="#171717" size={24} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              {showPayment ? 'Confirmar Pago' : 'Detalle del Viaje'}
            </Text>
            <Text className="font-heading text-xl text-foreground">
              {cooperativa?.nombre || 'Cooperativa'}
            </Text>
          </View>
          {cooperativa?.calificacion_promedio > 0 && (
            <View className="flex-row items-center bg-secondary px-3 py-1.5 rounded-full">
              <Star weight="fill" color="#e2b714" size={14} />
              <Text className="text-sm font-bold text-foreground ml-1">
                {Number(cooperativa.calificacion_promedio).toFixed(1)}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        {/* Info de la Ruta */}
        <View className="bg-card rounded-[14px] p-6 border border-border mb-6">
          <View className="flex-row justify-between items-center mb-4">
            <View className="items-center flex-1">
              <Text className="text-2xl font-black text-foreground">{ruta?.ciudad_origen?.substring(0, 3).toUpperCase()}</Text>
              <Text className="text-xs text-muted-foreground font-medium mt-1">{ruta?.ciudad_origen}</Text>
            </View>

          <View className="flex-1 items-center px-2">
              <View className="flex-row items-center gap-1">
                <Clock color="#a3a3a3" weight="fill" size={12} />
                <Text className="text-xs text-muted-foreground font-bold">{horasDuration}h {minDuration}m</Text>
              </View>
              <View className="w-full border-t border-dashed border-muted mt-2" />
            </View>

            <View className="items-center flex-1">
              <Text className="text-2xl font-black text-foreground">{ruta?.ciudad_destino?.substring(0, 3).toUpperCase()}</Text>
              <Text className="text-xs text-muted-foreground font-medium mt-1">{ruta?.ciudad_destino}</Text>
            </View>
          </View>

          <View className="flex-row justify-between pt-4 border-t border-border/30">
            <View>
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Fecha</Text>
              <Text className="text-sm text-foreground font-bold">{fechaSalida.toLocaleDateString('es-VE')}</Text>
            </View>
            <View>
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Hora salida</Text>
              <Text className="text-sm text-foreground font-bold">
                {fechaSalida.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View>
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Precio</Text>
              <Text className="text-sm text-primary font-black">{precioUnitario} Bs</Text>
            </View>
          </View>
        </View>

        {/* Sección condicional: SeatSelector o PaymentFlow */}
        {showPayment ? (
          <PaymentFlow
            monto={asientosSeleccionados.length * precioUnitario}
            onPaymentSuccess={handlePaymentSuccess}
          />
        ) : (
          <SeatSelector
            viaje_id={viaje.id}
            asientosTotales={viaje.asientos_totales}
            asientosOcupados={ocupados}
            precioUnitario={precioUnitario}
            onConfirm={handleConfirmSeats}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
