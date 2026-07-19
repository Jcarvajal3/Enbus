import { SafeAreaView } from '@/tw';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image } from 'react-native';
import { ScrollView, View, Text } from '@/tw';
import { CaretLeft } from 'phosphor-react-native';
import { StatusTimeline } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { supabase } from '@/src/utils/supabase';
import { getSignedPhotoUrl } from '@/src/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PressableScale } from '@/src/components/PressableScale';
import { Colors, Typography, Radius } from '@/src/theme';

export default function DetalleRecibirScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [encomienda, setEncomienda] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fotoUrlFirmada, setFotoUrlFirmada] = useState<string | null>(null);
  const foregroundColor = Colors.foreground;

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
        if (!cached) setLoading(true);

        const { data: encData, error: encError } = await supabase.from('encomiendas').select('*, profiles:sender_id(*)').eq('id', id).single();
        if (encError) throw encError;

        const { data: histData, error: histError } = await supabase.from('encomienda_estado_historial').select('*').eq('encomienda_id', id).order('created_at', { ascending: true });
        if (histError) throw histError;

        if (isMounted) {
          setEncomienda(encData);
          setHistorial(histData || []);
          const cacheData = { encomienda: encData, historial: histData || [] };
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
        console.error('Error cargando encomienda: ', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCache().then(() => { fetchData(); });
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
    if (phone.length > 5) {
      return phone.substring(0, phone.length - 4).replace(/[0-9]/g, '*') + phone.substring(phone.length - 4);
    }
    return phone;
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: Colors.background }}>
      <View className="px-6 pt-4 pb-4 flex-row items-center space-x-4" style={{ backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
        <PressableScale
          onPress={() => router.back()}
          style={{ width: 40, height: 40, backgroundColor: 'transparent', borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' }}
        >
          <CaretLeft weight="bold" color={foregroundColor} size={24} />
        </PressableScale>
        {loading ? <ActivityIndicator color={Colors.primary} /> : (
          <View>
            <Text className="text-sm font-bold uppercase" style={{ fontFamily: Typography.family, color: Colors.mutedForeground }}>Paquete Entrante</Text>
            <Text className="text-xl font-heading" style={{ fontFamily: Typography.family, color: Colors.foreground }}>{encomienda ? encomienda.tracking_id : 'Cargando...'}</Text>
          </View>
        )}
      </View>

      <ScrollView style={{ backgroundColor: Colors.surface }} contentContainerStyle={{ padding: 24, paddingBottom: 128 }}>
        {loading ? (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : !encomienda ? (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <Text style={{ fontFamily: Typography.family, color: Colors.mutedForeground }}>Encomienda no encontrada</Text>
          </View>
        ) : (
          <>
            {/* Card 1: Pin de Retiro */}
            <View className="p-6 mb-8 items-center" style={{ backgroundColor: Colors.white, borderRadius: Radius.lg }}>
              <Text className="text-xs uppercase font-bold mb-2" style={{ fontFamily: Typography.family, color: Colors.mutedForeground }}>Pin de Retiro</Text>
              <Text className="text-4xl font-heading tracking-[0.2em]" style={{ fontFamily: Typography.family, color: Colors.primary }}>{encomienda.pin_retiro || '---'}</Text>
            </View>

            {/* Card 2: Remitente & Costo */}
            <View className="p-6 mb-8" style={{ backgroundColor: Colors.white, borderRadius: Radius.lg }}>
              <View className="flex-row justify-between mb-4">
                <View>
                  <Text className="text-xs uppercase font-bold mb-1" style={{ fontFamily: Typography.family, color: Colors.mutedForeground }}>Remitente</Text>
                  <Text className="text-base font-bold" style={{ fontFamily: Typography.family, color: Colors.foreground }}>{encomienda.profiles?.nombre_completo || 'N/A'}</Text>
                  <Text className="text-sm" style={{ fontFamily: Typography.family, color: Colors.mutedForeground }}>{maskPhone(encomienda.profiles?.telefono)}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs uppercase font-bold mb-1" style={{ fontFamily: Typography.family, color: Colors.mutedForeground }}>Costo</Text>
                  <Text className="font-heading text-xl" style={{ fontFamily: Typography.family, color: Colors.primary }}>{encomienda.costo_calculado ? `${encomienda.costo_calculado} Bs` : 'Destino'}</Text>
                </View>
              </View>
              <View className="p-3 flex-row justify-between" style={{ backgroundColor: Colors.surface, borderRadius: Radius.md }}>
                <Text className="text-sm font-bold" style={{ fontFamily: Typography.family, color: Colors.mutedForeground }}>Peso Declarado</Text>
                <Text className="text-sm font-black" style={{ fontFamily: Typography.family, color: Colors.foreground }}>{encomienda.peso_kg} Kg</Text>
              </View>
            </View>

            {/* Payment or Timeline */}
            {encomienda.estado === 'POR_PAGAR' && encomienda.modalidad_pago === 'DESTINO' ? (
              <View className="mb-8">
                <Text className="text-lg font-heading mb-4" style={{ fontFamily: Typography.family, color: Colors.foreground }}>Completar Pago a Destino</Text>
                <PaymentFlow
                  monto={encomienda.costo_calculado || 0}
                  cooperativa_id={encomienda.cooperativa_id}
                  concepto={`Pago de encomienda ${encomienda.tracking_id || encomienda.id}`}
                  encomienda_id={encomienda.id}
                  onPaymentSuccess={async () => {
                    try {
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
              <View className="p-6 mb-8" style={{ backgroundColor: Colors.white, borderRadius: Radius.lg }}>
                <Text className="text-lg font-heading mb-4" style={{ fontFamily: Typography.family, color: Colors.foreground }}>Seguimiento</Text>
                <StatusTimeline estados={buildTimeline()} />
              </View>
            )}

            {/* Evidencia Fotográfica */}
            {fotoUrlFirmada && (
              <View className="p-6 mb-8" style={{ backgroundColor: Colors.white, borderRadius: Radius.lg }}>
                <Text className="text-lg font-heading mb-4" style={{ fontFamily: Typography.family, color: Colors.foreground }}>Evidencia Fotográfica</Text>
                <Image
                  source={{ uri: fotoUrlFirmada }}
                  style={{ width: '100%', height: 200, borderRadius: Radius.md }}
                  resizeMode="cover"
                />
                <Text className="text-xs mt-3 leading-4" style={{ fontFamily: Typography.family, color: Colors.mutedForeground }}>
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
