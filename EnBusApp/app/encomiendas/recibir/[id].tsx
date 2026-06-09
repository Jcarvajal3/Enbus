import { SafeAreaView } from '@/tw';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image } from 'react-native';
import { ScrollView, View, Text, Pressable } from '@/tw';
import { CaretLeft } from 'phosphor-react-native';
import { StatusTimeline } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { supabase } from '@/src/utils/supabase';
import { getSignedPhotoUrl } from '@/src/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DetalleRecibirScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [encomienda, setEncomienda] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fotoUrlFirmada, setFotoUrlFirmada] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = `cache:encomienda_recibo:${id}`;

    const loadCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          const parsed = JSON.parse(cached);
          setEncomienda(parsed.encomienda);
          setHistorial(parsed.historial || []);
          if (parsed.encomienda.foto_evidencia_url) {
            getSignedPhotoUrl(parsed.encomienda.foto_evidencia_url)
              .then(url => { if (isMounted) setFotoUrlFirmada(url); })
              .catch(() => {});
          }
          setLoading(false);
        }
      } catch (err) {
        console.warn('Error loading cache for received encomienda:', err);
      }
    };

    const fetchData = async () => {
      if (!id) return;
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (!cached) {
          setLoading(true);
        }

        const { data: encData, error: encError } = await supabase.from('encomiendas').select('*, profiles:sender_id(*)').eq('id', id).single();
        if (encError) throw encError;
        
        const { data: histData, error: histError } = await supabase.from('encomienda_estado_historial').select('*').eq('encomienda_id', id).order('created_at', { ascending: true });
        if (histError) throw histError;
        
        if (isMounted) {
          setEncomienda(encData);
          setHistorial(histData || []);

          // Guardar en cache
          const cacheData = {
            encomienda: encData,
            historial: histData || []
          };
          AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData)).catch((err) => {
            console.warn('Error saving cache for received encomienda:', err);
          });

          if (encData.foto_evidencia_url) {
            try {
              const url = await getSignedPhotoUrl(encData.foto_evidencia_url);
              if (isMounted) setFotoUrlFirmada(url);
            } catch (err) {
              console.error('Error signing photo url:', err);
            }
          } else {
            setFotoUrlFirmada(null);
          }
        }
      } catch (err: any) {
        console.error("Error cargando encomienda: ", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCache().then(() => {
      fetchData();
    });

    return () => { isMounted = false; };
  }, [id]);

  const buildTimeline = () => {
    const STATUS_FLOW = [
      { id: 'EN_RECEPCION', label: 'Procesada' },
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

      return { estado: s.id, label: s.label, timestamp, completado, activo, descripcion: activo ? encomienda?.descripcion_contenido : '' };
    });
  };

  const maskPhone = (phone?: string) => {
    if (!phone) return 'N/A';
    // +58 414 *** 1234
    if (phone.length > 5) {
      return phone.substring(0, phone.length - 4).replace(/[0-9]/g, '*') + phone.substring(phone.length - 4);
    }
    return phone;
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-4 bg-background shadow-sm flex-row items-center space-x-4 border-b border-border/50">
        <Pressable onPress={() => router.back()} className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
          <CaretLeft weight="bold" color="#171717" size={24} />
        </Pressable>
        {loading ? <ActivityIndicator color="#6b4a1a" /> : (
          <View>
            <Text className="text-sm font-bold text-muted-foreground uppercase">Paquete Entrante</Text>
            <Text className="text-xl font-heading text-foreground">{encomienda ? encomienda.tracking_id : 'Cargando...'}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        {loading ? <View className="py-20 items-center"><ActivityIndicator color="#6b4a1a" size="large" /></View> : !encomienda ? <View className="py-20 items-center"><Text className="text-muted-foreground">Encomienda no encontrada</Text></View> : (
          <>
            <View className="bg-card rounded-[32px] p-6 shadow-sm border border-border/50 mb-8 items-center bg-secondary/20">
              <Text className="text-xs text-muted-foreground uppercase font-bold mb-2">Pin de Retiro</Text>
              <Text className="text-4xl font-heading text-primary tracking-[0.2em]">{encomienda.pin_retiro || '---'}</Text>
            </View>

            <View className="bg-card rounded-[32px] p-6 shadow-sm border border-border/50 mb-8">
              <View className="flex-row justify-between mb-4">
                <View>
                  <Text className="text-xs text-muted-foreground uppercase font-bold mb-1">Remitente</Text>
                  <Text className="text-base font-bold text-foreground">{encomienda.profiles?.nombre_completo || 'N/A'}</Text>
                  <Text className="text-sm text-muted-foreground">{maskPhone(encomienda.profiles?.telefono)}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-muted-foreground uppercase font-bold mb-1">Costo</Text>
                  <Text className="font-heading text-xl text-primary">{encomienda.costo_calculado ? `${encomienda.costo_calculado} Bs` : 'Destino'}</Text>
                </View>
              </View>
              <View className="p-3 bg-secondary rounded-xl flex-row justify-between">
                <Text className="text-sm font-bold text-muted-foreground">Peso Declarado</Text>
                <Text className="text-sm font-black text-foreground">{encomienda.peso_kg} Kg</Text>
              </View>
            </View>

            {encomienda.estado === 'POR_PAGAR' && encomienda.modalidad_pago === 'DESTINO' ? (
              <View className="mb-8">
                <Text className="text-lg font-heading text-foreground mb-4">Completar Pago a Destino</Text>
                <PaymentFlow
                  monto={encomienda.costo_calculado || 0}
                  cooperativa_id={encomienda.cooperativa_id}
                  concepto={`Pago de encomienda ${encomienda.tracking_id || encomienda.id}`}
                  encomienda_id={encomienda.id}
                  onPaymentSuccess={async () => {
                    try {
                      // Transición correcta: PENDIENTE_VERIFICACION, no PAGADA directamente.
                      // La cooperativa debe verificar el comprobante antes de marcar como pagada,
                      // igual que en el flujo de envío (consistencia del estado del sistema).
                      const { error } = await supabase
                        .from('encomiendas')
                        .update({ estado: 'PENDIENTE_VERIFICACION' })
                        .eq('id', encomienda.id);
                      if (error) throw error;
                      setEncomienda((prev: any) => ({ ...prev, estado: 'PENDIENTE_VERIFICACION' }));
                    } catch (err: any) {
                      console.error('[recibir] Error actualizando estado post-pago:', err.message);
                    }
                  }}
                />
              </View>
            ) : (
              <View className="bg-card rounded-[32px] p-6 shadow-sm border border-border/50 mb-8">
                <Text className="text-lg font-heading text-foreground mb-4">Seguimiento</Text>
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
