import { SafeAreaView } from '@/tw';
import { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert } from 'react-native';
import { ScrollView, View, Text, Pressable } from '@/tw';
import { CaretLeft } from 'phosphor-react-native';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { StatusTimeline } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { supabase } from '@/src/utils/supabase';

export default function DetalleEnvioScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [encomienda, setEncomienda] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (retries = 3) => {
    if (!id) return;
    try {
      setLoading(true);

      // ── Fetch encomienda + historial en paralelo ──────────────────────────
      const [encResult, histResult] = await Promise.all([
        supabase
          .from('encomiendas')
          .select(`
            id,
            tracking_id,
            estado,
            costo_calculado,
            descripcion_contenido,
            created_at,
            ciudad_origen,
            estado_origen,
            ciudad_destino,
            estado_destino,
            receiver_nombre
          `)
          .eq('id', id)
          .single(),
        supabase
          .from('encomienda_estado_historial')
          .select('id, estado_nuevo, created_at')
          .eq('encomienda_id', id)
          .order('created_at', { ascending: true })
          .limit(20),
      ]);

      // Race condition: si acaba de crearse, reintentamos con delay
      if (encResult.error || !encResult.data) {
        if (retries > 0) {
          setTimeout(() => fetchData(retries - 1), 700);
          return;
        }
        throw encResult.error || new Error('No encontrado');
      }

      setEncomienda(encResult.data);
      setHistorial(histResult.data || []);
    } catch (err: any) {
      console.error('Error cargando encomienda:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Solo fetch al montar — sin useFocusEffect para evitar loops
  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const canCancel = ['PENDIENTE_DE_ESCANEO', 'EN_RECEPCION', 'POR_PAGAR'].includes(encomienda?.estado);

  const handleCancel = async () => {
    Alert.alert('Cancelar Envío', '¿Estás seguro de cancelar esta encomienda?', [
      { text: 'No' },
      {
        text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
          await supabase.from('encomiendas').update({ estado: 'CANCELADA' }).eq('id', id);
          router.back();
        }
      }
    ]);
  };

  const buildTimeline = () => {
    const STATUS_FLOW = [
      { id: 'PENDIENTE_DE_ESCANEO', label: 'Orden Creada' },
      { id: 'EN_RECEPCION', label: 'Recibida en Taquilla' },
      { id: 'EN_TRANSITO', label: 'En tránsito' },
      { id: 'EN_OFICINA_DESTINO', label: 'Lista para retirar' },
      { id: 'ENTREGADA', label: 'Entregada al destinatario' }
    ];

    let foundActive = false;
    const currentState = encomienda?.estado;

    return STATUS_FLOW.map((s) => {
      const match = historial.find((h) => h.estado_nuevo === s.id);
      let completado = !!match;
      let timestamp = match ? new Date(match.created_at).toLocaleString() : null;
      let activo = false;

      if (s.id === currentState) {
        activo = true;
        completado = false;
        foundActive = true;
      } else if (!foundActive) {
        completado = true;
      } else {
        completado = false;
      }

      if (s.id === 'PENDIENTE_DE_ESCANEO' && !match) {
        completado = true;
        timestamp = new Date(encomienda.created_at).toLocaleString();
      }

      return { estado: s.id, label: s.label, timestamp, completado, activo, descripcion: activo ? encomienda.descripcion_contenido : '' };
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-4 bg-background shadow-sm flex-row items-center space-x-4 border-b border-border/50">
        <Pressable onPress={() => router.back()} className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
          <CaretLeft weight="bold" color="#171717" size={24} />
        </Pressable>
        {loading ? <ActivityIndicator color="#6b4a1a" /> : (
          <View>
            <Text className="text-sm font-bold text-muted-foreground uppercase">Tú Envío</Text>
            <Text className="text-xl font-heading text-foreground">{encomienda ? encomienda.tracking_id : 'Cargando...'}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        {loading ? <View className="py-20 items-center"><ActivityIndicator color="#6b4a1a" size="large" /></View> : !encomienda ? <View className="py-20 items-center"><Text className="text-muted-foreground">Encomienda no encontrada</Text></View> : (
          <>
            {encomienda.estado === 'PENDIENTE_DE_ESCANEO' && (
              <View className="mb-8 items-center bg-card p-6 rounded-[32px] border border-border/50">
                <Text className="text-center font-bold text-foreground mb-4">Código para escanear en Taquilla</Text>
                <QRCodeViewer data={encomienda.id} size={220} autoMaxBrightness={true} />
              </View>
            )}

            {encomienda.estado === 'EN_RECEPCION' && (
              <View className="mb-8 p-4 bg-orange-100 rounded-xl items-center">
                <Text className="text-orange-800 font-bold">Siendo procesada en taquilla...</Text>
              </View>
            )}

            {encomienda.estado === 'POR_PAGAR' ? (
              <View className="mb-8">
                <Text className="text-lg font-heading text-foreground mb-4">Pago Requerido</Text>
                <PaymentFlow
                  monto={encomienda.costo_calculado || 0}
                  encomienda_id={encomienda.id}
                  cooperativa_id={encomienda.cooperativa_id}
                  concepto={`Paquete: ${encomienda.descripcion_contenido || encomienda.tracking_id}`}
                  onPaymentSuccess={async (_pagoId) => {
                    // El PaymentFlow ya insertó el registro en `pagos`.
                    // Aquí solo actualizamos el estado de la encomienda.
                    const { error } = await supabase
                      .from('encomiendas')
                      .update({ estado: 'PAGADA' })
                      .eq('id', encomienda.id);
                    if (!error) {
                      setEncomienda({ ...encomienda, estado: 'PAGADA' });
                    }
                  }}
                />
              </View>

            ) : (
              <View className="bg-card rounded-[32px] p-6 shadow-sm border border-border/50 mb-8">
                <Text className="text-lg font-heading text-foreground mb-4">Logística</Text>
                <StatusTimeline estados={buildTimeline()} />
              </View>
            )}

            {canCancel && (
              <Pressable onPress={handleCancel} className="mt-4 p-4 rounded-xl border border-destructive items-center">
                <Text className="text-destructive font-bold">Cancelar Envío</Text>
              </Pressable>
            )}

            {['CANCELADA', 'DEVUELTA'].includes(encomienda.estado) && (
              <View className="p-4 bg-red-100 rounded-xl items-center">
                <Text className="text-red-800 font-bold">Encomienda {encomienda.estado}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
