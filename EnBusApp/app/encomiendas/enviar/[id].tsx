import { SafeAreaView } from '@/tw';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, StyleSheet } from 'react-native';
import { ScrollView, View, Text } from '@/tw';
import { CaretLeft, Clock } from 'phosphor-react-native';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { StatusTimeline } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { supabase } from '@/src/utils/supabase';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import { getSignedPhotoUrl } from '@/src/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PressableScale } from '@/src/components/PressableScale';
import { Colors, Typography, Spacing, Radius, Shadows } from '@/src/theme';

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
    <SafeAreaView style={st.screen}>
      {/* Header */}
      <View style={st.header}>
        <PressableScale
          onPress={() => router.back()}
          style={st.headerBackBtn}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <CaretLeft weight="bold" color={Colors.foreground} size={24} />
        </PressableScale>
        {loading ? (
          <ActivityIndicator color={Colors.accent} style={st.headerLoader} />
        ) : (
          <View style={st.headerTextBlock}>
            <Text style={st.headerEyebrow}>Tu Envío</Text>
            <Text style={st.headerTitle}>{encomienda ? encomienda.tracking_id : 'Cargando...'}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={st.scrollContent}>
        {loading ? (
          <View style={st.loadingBlock}>
            <ActivityIndicator color={Colors.accent} size="large" />
          </View>
        ) : !encomienda ? (
          <View style={st.loadingBlock}>
            <Text style={st.emptyText}>Encomienda no encontrada</Text>
          </View>
        ) : (
          <>
            {encomienda.estado === 'PENDIENTE_DE_ESCANEO' && (
              <View style={st.card}>
                <Text style={st.cardTitle}>
                  Código para escanear en Taquilla
                </Text>
                <QRCodeViewer data={encomienda.id} size={220} autoMaxBrightness={true} />
              </View>
            )}

            {encomienda.estado === 'EN_RECEPCION' && (
              <View style={st.processingBanner}>
                <Text style={st.processingBannerText}>
                  Siendo procesada en taquilla...
                </Text>
              </View>
            )}

            {encomienda.estado === 'POR_PAGAR' ? (
              <View style={st.paymentSection}>
                {pagoPendiente && !pagoPendiente.verificado ? (
                  <View style={[st.card, st.cardCenter]}>
                    <View style={st.pendingIconContainer}>
                      <Clock weight="fill" color={Colors.warning} size={32} />
                    </View>
                    <Text style={st.pendingTitle}>
                      {pagoPendiente.tipo_pago === 'EFECTIVO' ? 'Pago Pendiente en Taquilla' : 'Pago en Verificación'}
                    </Text>
                    <Text style={st.pendingSubtitle}>
                      {pagoPendiente.tipo_pago === 'EFECTIVO'
                        ? 'Debes realizar el pago en efectivo al entregar tu paquete en la taquilla de la cooperativa.'
                        : 'Hemos registrado tu comprobante de pago. La cooperativa verificará la transacción a la brevedad. Tu envío comenzará una vez sea verificado.'
                      }
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={st.paymentTitle}>
                      Pago Requerido
                    </Text>
                    <PaymentFlow
                      monto={encomienda.costo_calculado || 0}
                      encomienda_id={encomienda.id}
                      cooperativa_id={encomienda.cooperativa_id}
                      concepto={`Paquete: ${encomienda.descripcion_contenido || encomienda.tracking_id}`}
                      onPaymentSuccess={async () => { fetchData(); }}
                    />
                  </>
                )}
              </View>
            ) : (
              <View style={st.card}>
                <Text style={st.sectionTitle}>Logística</Text>
                <StatusTimeline estados={buildTimeline()} />
              </View>
            )}

            {/* Shipment details card */}
            <View style={st.card}>
              <Text style={st.sectionTitle}>Detalles del Envío</Text>

              <View style={st.detailRow}>
                <Text style={st.detailLabel}>Contenido</Text>
                <Text style={st.detailValue}>
                  {encomienda.descripcion_contenido || 'Sin descripción'}
                </Text>
              </View>

              <View style={st.detailsRow2}>
                <View style={st.detailRowFlex}>
                  <Text style={st.detailLabel}>Código de Tracking</Text>
                  <Text style={st.detailValue}>{encomienda.tracking_id}</Text>
                </View>
                <View style={st.detailRowEnd}>
                  <Text style={st.detailLabel}>Costo</Text>
                  <Text style={st.detailValueAccent}>
                    {encomienda.costo_calculado ? `${encomienda.costo_calculado} Bs` : 'Por calcular'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Sender Card */}
            <View style={st.card}>
              <Text style={st.sectionTitle}>Remitente</Text>
              <Text style={st.detailLabel}>Origen</Text>
              <Text style={st.detailValue}>
                {encomienda.ciudad_origen}, {encomienda.estado_origen}
              </Text>
            </View>

            {/* Recipient Card */}
            <View style={st.card}>
              <Text style={st.sectionTitle}>Destinatario</Text>
              <View style={st.detailRow}>
                <Text style={st.detailLabel}>Nombre</Text>
                <Text style={st.detailValue}>{encomienda.receiver_nombre || 'N/A'}</Text>
              </View>
              <Text style={st.detailLabel}>Destino</Text>
              <Text style={st.detailValue}>
                {encomienda.ciudad_destino}, {encomienda.estado_destino}
              </Text>
            </View>

            {fotoUrlFirmada && (
              <View style={st.card}>
                <Text style={st.sectionTitle}>Evidencia Fotográfica</Text>
                <Image
                  source={{ uri: fotoUrlFirmada }}
                  style={st.evidenciaPhoto}
                  resizeMode="cover"
                />
                <Text style={st.evidenciaCaption}>
                  Fotografía de registro del paquete con etiqueta de envío visible.
                </Text>
              </View>
            )}

            {canCancel && (
              <PressableScale
                onPress={handleCancel}
                haptic
                hapticType="medium"
                style={st.cancelButton}
                accessibilityLabel="Cancelar envío"
                accessibilityRole="button"
              >
                <Text style={st.cancelButtonText}>Cancelar Envío</Text>
              </PressableScale>
            )}

            {['CANCELADA', 'DEVUELTA'].includes(encomienda.estado) && (
              <View style={st.cancelledBanner}>
                <Text style={st.cancelledBannerText}>
                  Encomienda {encomienda.estado}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBackBtn: {
    width: Spacing['4xl'],
    height: Spacing['4xl'],
    backgroundColor: Colors.transparent,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLoader: {
    marginLeft: Spacing.lg,
  },
  headerTextBlock: {
    marginLeft: Spacing.lg,
  },
  headerEyebrow: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    fontSize: Typography.sizes.xs,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    fontSize: Typography.sizes.xl,
  },
  scrollContent: {
    padding: Spacing['2xl'],
    paddingBottom: Spacing['5xl'] * 2 + Spacing['3xl'],
  },
  loadingBlock: {
    paddingVertical: Spacing['4xl'] * 2,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Typography.family,
    color: Colors.mutedForeground,
    fontSize: Typography.sizes.base,
  },
  // Cards
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing['2xl'],
    marginBottom: Spacing['2xl'],
    ...Shadows.card,
  },
  cardCenter: {
    alignItems: 'center',
  },
  cardTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    fontSize: Typography.sizes.base,
  },
  // Processing banner
  processingBanner: {
    backgroundColor: Colors.secondaryLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing['2xl'],
    alignItems: 'center',
  },
  processingBannerText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.secondary,
    fontSize: Typography.sizes.base,
  },
  // Payment section
  paymentSection: {
    marginBottom: Spacing['2xl'],
  },
  paymentTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.lg + 1,
    color: Colors.foreground,
    marginBottom: Spacing.lg,
  },
  pendingIconContainer: {
    width: Spacing['4xl'] + Spacing['2xl'],
    height: Spacing['4xl'] + Spacing['2xl'],
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  pendingTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.lg + 1,
    color: Colors.foreground,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  pendingSubtitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm + 1,
    color: Colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Section header
  sectionTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    fontSize: Typography.sizes.lg,
    marginBottom: Spacing.lg,
  },
  // Detail fields
  detailRow: {
    marginBottom: Spacing.lg,
  },
  detailsRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailRowFlex: {
    flex: 1,
  },
  detailRowEnd: {
    alignItems: 'flex-end',
    flex: 1,
  },
  detailLabel: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.mutedForeground,
    fontSize: Typography.sizes.xs,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  detailValue: {
    fontFamily: Typography.family,
    color: Colors.foreground,
    fontSize: Typography.sizes.base,
  },
  detailValueAccent: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
    fontSize: Typography.sizes.lg,
  },
  // Evidencia foto
  evidenciaPhoto: {
    width: '100%',
    height: 200,
    borderRadius: Radius.sm,
  },
  evidenciaCaption: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    color: Colors.mutedForeground,
    lineHeight: 18,
    marginTop: Spacing.md,
  },
  // Cancel button
  cancelButton: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.destructive,
    alignItems: 'center',
    backgroundColor: Colors.transparent,
  },
  cancelButtonText: {
    fontFamily: Typography.family,
    color: Colors.destructive,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.base,
  },
  // Cancelled/returned banner
  cancelledBanner: {
    backgroundColor: Colors.destructiveLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  cancelledBannerText: {
    fontFamily: Typography.family,
    color: Colors.destructive,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.base,
  },
});
