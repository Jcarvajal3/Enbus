import { SafeAreaView } from '@/tw';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image } from 'react-native';
import { ScrollView, View, Text, Pressable, useCSSVariable } from '@/tw';
import { CaretLeft, Clock } from 'phosphor-react-native';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { StatusTimeline } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { supabase } from '@/src/utils/supabase';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { getSignedPhotoUrl } from '@/src/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DetalleEnvioScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const toast = useToast();

  const [encomienda, setEncomienda] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [pagoPendiente, setPagoPendiente] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fotoUrlFirmada, setFotoUrlFirmada] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const foregroundColor = useCSSVariable('--foreground') as string || '#171717';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async (retries = 3) => {
    if (!id) return;
    const cacheKey = `cache:encomienda_envio:${id}`;
    try {
      // ── 1. Cargar caché primero para respuesta instantánea ──
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && isMountedRef.current) {
        const parsed = JSON.parse(cached);
        setEncomienda(parsed.encomienda);
        setHistorial(parsed.historial || []);
        setPagoPendiente(parsed.pagoPendiente);
        if (parsed.encomienda.foto_evidencia_url) {
          getSignedPhotoUrl(parsed.encomienda.foto_evidencia_url)
            .then(url => { if (isMountedRef.current) setFotoUrlFirmada(url); })
            .catch(() => {});
        }
        setLoading(false);
      } else {
        if (isMountedRef.current) setLoading(true);
      }

      // ── 2. Fetch de datos frescos de Supabase ──
      const [encResult, histResult, pagosResult] = await Promise.all([
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
            receiver_nombre,
            cooperativa_id,
            foto_evidencia_url
          `)
          .eq('id', id)
          .single(),
        supabase
          .from('encomienda_estado_historial')
          .select('id, estado_nuevo, created_at')
          .eq('encomienda_id', id)
          .order('created_at', { ascending: true })
          .limit(20),
        supabase
          .from('pagos')
          .select('id, verificado, tipo_pago')
          .eq('encomienda_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
      ]);

      // Race condition: si acaba de crearse, reintentamos con delay
      if (encResult.error || !encResult.data) {
        if (retries > 0) {
          setTimeout(() => fetchData(retries - 1), 700);
          return;
        }
        throw encResult.error || new Error('No encontrado');
      }

      if (isMountedRef.current) {
        setEncomienda(encResult.data);
        setHistorial(histResult.data || []);
        
        const freshPago = pagosResult.data && pagosResult.data.length > 0 ? pagosResult.data[0] : null;
        setPagoPendiente(freshPago);

        // Guardar en cache
        const cacheData = {
          encomienda: encResult.data,
          historial: histResult.data || [],
          pagoPendiente: freshPago
        };
        AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData)).catch((err) => {
          console.warn('Error guardando cache de encomienda:', err);
        });
      }

      if (encResult.data.foto_evidencia_url) {
        try {
          const url = await getSignedPhotoUrl(encResult.data.foto_evidencia_url);
          if (isMountedRef.current) setFotoUrlFirmada(url);
        } catch (err) {
          console.error('Error al firmar url de foto:', err);
        }
      } else {
        if (isMountedRef.current) setFotoUrlFirmada(null);
      }
    } catch (err: any) {
      console.error('Error cargando encomienda:', err);
    } finally {
      if (isMountedRef.current) setLoading(false);
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
          try {
            const { error } = await supabase
              .from('encomiendas')
              .update({ estado: 'CANCELADA' })
              .eq('id', id);
            if (error) throw error;
            router.back();
          } catch (err: any) {
            toast.show('error', 'No se pudo cancelar la encomienda. Intenta de nuevo.');
            console.error('[enviar] Error cancelando encomienda:', err.message);
          }
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
          <CaretLeft weight="bold" color={foregroundColor} size={24} />
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
                {pagoPendiente && !pagoPendiente.verificado ? (
                  <View className="bg-card border border-border rounded-[14px] p-6 items-center">
                    <View className="size-16 bg-warning/20 rounded-full items-center justify-center mb-4">
                      <Clock weight="fill" color="#e2b714" size={32} />
                    </View>
                    <Text className="font-heading text-lg text-foreground text-center mb-2">
                      {pagoPendiente.tipo_pago === 'EFECTIVO' ? 'Pago Pendiente en Taquilla' : 'Pago en Verificación'}
                    </Text>
                    <Text className="text-sm text-muted-foreground text-center leading-5">
                      {pagoPendiente.tipo_pago === 'EFECTIVO' 
                        ? 'Debes realizar el pago en efectivo al entregar tu paquete en la taquilla de la cooperativa.'
                        : 'Hemos registrado tu comprobante de pago. La cooperativa verificará la transacción a la brevedad. Tu envío comenzará una vez sea verificado.'
                      }
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text className="text-lg font-heading text-foreground mb-4">Pago Requerido</Text>
                    <PaymentFlow
                      monto={encomienda.costo_calculado || 0}
                      encomienda_id={encomienda.id}
                      cooperativa_id={encomienda.cooperativa_id}
                      concepto={`Paquete: ${encomienda.descripcion_contenido || encomienda.tracking_id}`}
                      onPaymentSuccess={async () => {
                        // El PaymentFlow ya insertó el registro en `pagos`.
                        // Simplemente volvemos a cargar los datos para reflejar que el pago está pendiente de verificación
                        fetchData();
                      }}
                    />
                  </>
                )}
              </View>

            ) : (
              <View className="bg-card rounded-[32px] p-6 shadow-sm border border-border/50 mb-8">
                <Text className="text-lg font-heading text-foreground mb-4">Logística</Text>
                <StatusTimeline estados={buildTimeline()} />
              </View>
            )}

            {fotoUrlFirmada && (
              <View className="bg-card rounded-[32px] p-6 shadow-sm border border-border/50 mb-8">
                <Text className="text-lg font-heading text-foreground mb-4">Evidencia Fotográfica</Text>
                <Image
                  source={{ uri: fotoUrlFirmada }}
                  style={{ width: '100%', height: 200, borderRadius: 14 }}
                  resizeMode="cover"
                />
                <Text className="text-xs text-muted-foreground mt-3 leading-4">
                  Fotografía de registro del paquete con etiqueta de envío visible.
                </Text>
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
