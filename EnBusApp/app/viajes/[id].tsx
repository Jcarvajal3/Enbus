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
import { formatDate, dateFull, timeOnly, formatCity } from '@/src/utils/formatters';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';

// ─── Generador de código de boleto criptográficamente seguro ───────────────────
// Math.random() NO debe usarse para IDs públicos: con 36^6 combinaciones hay riesgo
// real de colisión en producción. crypto.getRandomValues() es el estándar correcto.
const BOLETO_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateBoletoCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes); // CSPRNG nativo en Hermes (RN 0.73+) y V8
  const suffix = Array.from(bytes)
    .map(b => BOLETO_CHARS[b % BOLETO_CHARS.length])
    .join('');
  return `BOL-${suffix}`; // BOL-XXXXXXXX — 36^8 ≈ 2.8 billones de combinaciones
}

export default function DetalleViajeScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  const [viaje, setViaje] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [asientosOcupados, setAsientosOcupados] = useState<string[]>([]);
  const [asientosSeleccionados, setAsientosSeleccionados] = useState<string[]>([]);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);

        // ── Carga paralela: datos del viaje + asientos ocupados reales ──
        const [viajeResult, boletosResult] = await Promise.all([
          supabase
            .from('viajes')
            .select(`
              id,
              fecha_hora_salida,
              asientos_totales,
              asientos_disponibles,
              numero_unidad,
              nombre_chofer,
              rutas ( ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje ),
              cooperativas ( id, nombre, calificacion_promedio )
            `)
            .eq('id', id)
            .single(),
          // Solo los boletos activos (RESERVADO + PAGADO + USADO) bloquean asientos.
          // CANCELADO y EXPIRADO liberan el asiento.
          supabase
            .from('boletos')
            .select('asiento')
            .eq('viaje_id', id)
            .in('estado', ['RESERVADO', 'PAGADO', 'USADO']),
        ]);

        if (viajeResult.error) throw viajeResult.error;

        if (isMounted) {
          setViaje(viajeResult.data);
          setAsientosOcupados(
            (boletosResult.data ?? []).map((b: { asiento: string }) => b.asiento)
          );
        }
      } catch (err: any) {
        console.error('[DetalleViaje] Error cargando datos:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    // ── Realtime: actualiza asientos si otro usuario reserva mientras seleccionas ──
    // Canal determinista por viaje (no prolifera si el efecto recorre)
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channel = supabase
      .channel(`rt:boletos:viaje:${id}:${uniqueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boletos',
          filter: `viaje_id=eq.${id}`,
        },
        (payload) => {
          if (!isMounted) return;

          setAsientosOcupados((prev) => {
            if (payload.eventType === 'INSERT') {
              const nuevo = payload.new as { asiento: string; estado: string };
              // Solo bloquear si el estado es activo
              if (['RESERVADO', 'PAGADO', 'USADO'].includes(nuevo.estado)) {
                return [...new Set([...prev, nuevo.asiento])];
              }
              return prev;
            }

            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as { asiento: string; estado: string };
              const ESTADOS_ACTIVOS = ['RESERVADO', 'PAGADO', 'USADO'];
              if (ESTADOS_ACTIVOS.includes(updated.estado)) {
                // Asiento ahora ocupado
                return [...new Set([...prev, updated.asiento])];
              } else {
                // Asiento liberado (cancelado/expirado)
                return prev.filter((a) => a !== updated.asiento);
              }
            }

            if (payload.eventType === 'DELETE') {
              const removed = payload.old as { asiento: string };
              return prev.filter((a) => a !== removed.asiento);
            }

            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
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
  const horasDuration = Math.floor((ruta?.duracion_estimada_min || 0) / 60);
  const minDuration = (ruta?.duracion_estimada_min || 0) % 60;
  const precioUnitario = ruta?.precio_pasaje || 0;

  const handleConfirmSeats = (asientos: string[]) => {
    setAsientosSeleccionados(asientos);
    setShowPayment(true);
  };

  const handlePaymentSuccess = async (pagoId?: string, pagoPayload?: Record<string, unknown>) => {
    if (!user) return;
    try {
      // 1. Creamos los boletos como RESERVADO (estado pendiente de confirmación de pago)
      const inserts = asientosSeleccionados.map((asiento) => ({
        codigo_boleto: generateBoletoCode(), // CSPRNG — sin colisiones prácticas
        comprador_id: user.id,
        viaje_id: viaje.id,
        cooperativa_id: cooperativa.id,
        asiento: asiento,
        precio: precioUnitario,
        estado: 'RESERVADO', // Pendiente de verificación del pago por la cooperativa
        reserva_expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min para verificar
      }));

      const { data: boletosInsertados, error: boletosError } = await supabase
        .from('boletos')
        .insert(inserts)
        .select('id, codigo_boleto');
      
      if (boletosError || !boletosInsertados || boletosInsertados.length === 0) {
        throw boletosError || new Error('No se devolvieron los boletos insertados');
      }

      // 2. Insertamos el pago usando el ID del primer boleto
      // El esquema exige que el pago tenga encomienda_id o boleto_id (check_pago_referencia)
      // Como el panel de cooperativas totaliza los ingresos usando este ID, pasamos el primero 
      // y con el monto TOTAL, lo que mantendrá las estadísticas cuadradas.
      if (pagoPayload) {
        const payloadToInsert = {
          ...pagoPayload,
          boleto_id: boletosInsertados[0].id
        };

        const { error: pagoInsertError } = await supabase
          .from('pagos')
          .insert(payloadToInsert);

        if (pagoInsertError) {
          console.error('[DetalleViaje] Pago insert falló:', pagoInsertError);
          // Opcional: si falla el pago, los boletos quedan como "RESERVADO" y expirarán, es aceptable.
        }
      }

      // Navegamos al Boarding Pass del primer boleto emitido
      router.replace({ pathname: '/boletos/[id]' as any, params: { id: boletosInsertados[0].codigo_boleto } });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', 'No se pudo generar el boleto: ' + err.message);
      console.error('[DetalleViaje] Error creando boletos:', err.message);
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
              <Text className="text-2xl font-black text-foreground">{formatCity(ruta?.ciudad_origen).substring(0, 3).toUpperCase()}</Text>
              <Text className="text-xs text-muted-foreground font-medium mt-1">{formatCity(ruta?.ciudad_origen)}</Text>
            </View>

          <View className="flex-1 items-center px-2">
              <View className="flex-row items-center gap-1">
                <Clock color="#a3a3a3" weight="fill" size={12} />
                <Text className="text-xs text-muted-foreground font-bold">{horasDuration}h {minDuration}m</Text>
              </View>
              <View className="w-full border-t border-dashed border-muted mt-2" />
            </View>

            <View className="items-center flex-1">
              <Text className="text-2xl font-black text-foreground">{formatCity(ruta?.ciudad_destino).substring(0, 3).toUpperCase()}</Text>
              <Text className="text-xs text-muted-foreground font-medium mt-1">{formatCity(ruta?.ciudad_destino)}</Text>
            </View>
          </View>

          <View className="flex-row justify-between pt-4 border-t border-border/30">
            <View>
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Fecha</Text>
              <Text className="text-sm text-foreground font-bold">{formatDate(viaje.fecha_hora_salida, dateFull)}</Text>
            </View>
            <View>
              <Text className="text-xs text-muted-foreground font-bold uppercase mb-1">Hora salida</Text>
              <Text className="text-sm text-foreground font-bold">
                {formatDate(viaje.fecha_hora_salida, timeOnly)}
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
            cooperativa_id={cooperativa?.id}
            concepto={`${asientosSeleccionados.length} asiento(s) - ${formatCity(ruta?.ciudad_origen)} → ${formatCity(ruta?.ciudad_destino)}`}
            onPaymentSuccess={handlePaymentSuccess}
          />
        ) : (
          <SeatSelector
            viaje_id={viaje.id}
            asientosTotales={viaje.asientos_totales}
            asientosOcupados={asientosOcupados}
            precioUnitario={precioUnitario}
            onConfirm={handleConfirmSeats}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
