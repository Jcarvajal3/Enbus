import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Clock, Package, WarningCircle } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { StatusTimeline, type EstadoItem } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { PageTransition } from '@/src/components/PageTransition';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  InfoRow,
  LoadingState,
  Screen,
  ScreenHeader,
  StatusBadge,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useToast } from '@/src/components/Toast';
import { getSignedPhotoUrl } from '@/src/utils/storage';
import { getEstadoVisual } from '@/src/utils/estados';
import type { Encomienda } from '@/src/types';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

/** Flujo completo de una encomienda, de creación a entrega. */
const STATUS_FLOW = [
  { id: 'PENDIENTE_DE_ESCANEO', label: 'Orden creada' },
  { id: 'EN_RECEPCION', label: 'Recibida en taquilla' },
  { id: 'EN_TRANSITO', label: 'En tránsito' },
  { id: 'EN_OFICINA_DESTINO', label: 'Lista para retirar' },
  { id: 'ENTREGADA', label: 'Entregada al destinatario' },
] as const;

const CANCELABLE = ['PENDIENTE_DE_ESCANEO', 'EN_RECEPCION', 'POR_PAGAR'];

interface HistorialRow {
  id: string;
  estado_nuevo: string;
  created_at: string;
}

interface PagoRow {
  id: string;
  verificado: boolean;
  tipo_pago: string;
}

export default function DetalleEnvioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [encomienda, setEncomienda] = useState<Encomienda | null>(null);
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [pago, setPago] = useState<PagoRow | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(
    async (retries = 3) => {
      if (!id) return;
      const cacheKey = `cache:encomienda_envio:${id}`;

      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMountedRef.current) {
          const parsed = JSON.parse(cached);
          setEncomienda(parsed.encomienda);
          setHistorial(parsed.historial ?? []);
          setPago(parsed.pago ?? null);
          setLoading(false);
        } else if (isMountedRef.current) {
          setLoading(true);
        }

        const [encResult, histResult, pagosResult] = await Promise.all([
          supabase.from('encomiendas').select('*').eq('id', id).single(),
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
            .limit(1),
        ]);

        if (encResult.error || !encResult.data) {
          // La fila puede no estar visible inmediatamente tras el insert.
          if (retries > 0) {
            setTimeout(() => fetchData(retries - 1), 700);
            return;
          }
          throw encResult.error ?? new Error('Encomienda no encontrada');
        }

        if (!isMountedRef.current) return;

        const freshPago = pagosResult.data?.[0] ?? null;
        setEncomienda(encResult.data as Encomienda);
        setHistorial(histResult.data ?? []);
        setPago(freshPago);

        AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({
            encomienda: encResult.data,
            historial: histResult.data ?? [],
            pago: freshPago,
          })
        ).catch(() => {});

        if (encResult.data.foto_evidencia_url) {
          const url = await getSignedPhotoUrl(encResult.data.foto_evidencia_url);
          if (isMountedRef.current) setFotoUrl(url);
        } else if (isMountedRef.current) {
          setFotoUrl(null);
        }
      } catch (err) {
        if (__DEV__) console.error('[enviar] Error cargando encomienda:', err);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCancel = () => {
    Alert.alert('Cancelar envío', '¿Seguro que deseas cancelar esta encomienda?', [
      { text: 'No, mantener', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('encomiendas')
              .update({ estado: 'CANCELADA' })
              .eq('id', id);
            if (error) throw error;
            router.back();
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Error desconocido';
            if (__DEV__) console.error('[enviar] Error cancelando:', message);
            toast.show('error', 'No se pudo cancelar la encomienda. Intenta de nuevo.');
          }
        },
      },
    ]);
  };

  const buildTimeline = (enc: Encomienda): EstadoItem[] => {
    let reachedCurrent = false;

    return STATUS_FLOW.map((stage) => {
      const match = historial.find((h) => h.estado_nuevo === stage.id);
      const isCurrent = stage.id === enc.estado;
      if (isCurrent) reachedCurrent = true;

      const completado = isCurrent ? false : !reachedCurrent;
      const timestamp =
        match?.created_at ??
        (stage.id === 'PENDIENTE_DE_ESCANEO' ? enc.created_at : null);

      return {
        estado: stage.id,
        label: stage.label,
        timestamp: timestamp ? new Date(timestamp).toLocaleString('es-VE') : null,
        completado,
        activo: isCurrent,
        descripcion: isCurrent ? enc.descripcion_contenido : undefined,
      };
    });
  };

  if (loading) {
    return (
      <Screen background={Colors.surface}>
        <ScreenHeader variant="compact" eyebrow="Tu envío" title="Cargando…" onBack={() => router.back()} />
        <LoadingState label="Buscando tu encomienda…" />
      </Screen>
    );
  }

  if (!encomienda) {
    return (
      <Screen background={Colors.surface}>
        <ScreenHeader variant="compact" title="Envío" onBack={() => router.back()} />
        <EmptyState
          icon={WarningCircle}
          title="Encomienda no encontrada"
          description="No pudimos cargar este envío. Puede que haya sido eliminado."
          action={{ children: 'Volver', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const estadoVisual = getEstadoVisual('encomienda', encomienda.estado);
  const esperandoVerificacion = pago && !pago.verificado;

  return (
    <Screen background={Colors.surface}>
      <PageTransition>
        <ScreenHeader
          variant="compact"
          eyebrow="Tu envío"
          title={encomienda.tracking_id ?? '—'}
          onBack={() => router.back()}
          right={<StatusBadge dominio="encomienda" estado={encomienda.estado} size="md" bordered />}
        />

        <ScrollView
          contentContainerStyle={scrollContent({ top: Spacing.lg })}
          showsVerticalScrollIndicator={false}
        >
          {estadoVisual.hint ? (
            <Text variant="secondary" color="muted" style={s.hint}>
              {estadoVisual.hint}
            </Text>
          ) : null}

          {/* ── QR de entrega ───────────────────────────────────────────── */}
          {encomienda.estado === 'PENDIENTE_DE_ESCANEO' && (
            <Card padding="md" style={s.card}>
              <Text variant="subheading" align="center" style={s.cardTitle}>
                Muestra este código en taquilla
              </Text>
              <View style={s.qr}>
                <QRCodeViewer data={encomienda.id} size={220} autoMaxBrightness />
              </View>
            </Card>
          )}

          {/* ── Pago o seguimiento ──────────────────────────────────────── */}
          {encomienda.estado === 'POR_PAGAR' ? (
            esperandoVerificacion ? (
              <Card padding="md" style={[s.card, s.centered]}>
                <View style={s.pendingIcon}>
                  <Clock weight="fill" color={Colors.warning} size={Sizes.icon['2xl']} />
                </View>
                <Text variant="subheading" align="center">
                  {pago?.tipo_pago === 'EFECTIVO'
                    ? 'Pago pendiente en taquilla'
                    : 'Pago en verificación'}
                </Text>
                <Text variant="secondary" color="muted" align="center" style={s.cardText}>
                  {pago?.tipo_pago === 'EFECTIVO'
                    ? 'Realiza el pago en efectivo al entregar tu paquete en la taquilla de la cooperativa.'
                    : 'Registramos tu comprobante. La cooperativa lo verificará a la brevedad y el envío continuará.'}
                </Text>
              </Card>
            ) : (
              <View style={s.card}>
                <Text variant="subheading" style={s.cardTitle}>
                  Pago requerido
                </Text>
                <PaymentFlow
                  monto={encomienda.costo_calculado ?? 0}
                  encomienda_id={encomienda.id}
                  cooperativa_id={encomienda.cooperativa_id}
                  concepto={`Paquete ${encomienda.tracking_id ?? encomienda.id}`}
                  onPaymentSuccess={() => fetchData()}
                />
              </View>
            )
          ) : (
            <Card padding="md" style={s.card}>
              <Text variant="subheading">Logística</Text>
              <StatusTimeline estados={buildTimeline(encomienda)} />
            </Card>
          )}

          {/* ── Detalles ────────────────────────────────────────────────── */}
          <Card padding="md" style={s.card}>
            <Text variant="subheading" style={s.cardTitle}>
              Detalles del envío
            </Text>

            <InfoRow label="Contenido" value={encomienda.descripcion_contenido || 'Sin descripción'} />
            <Divider spacing={Spacing.sm} />

            <View style={s.row}>
              <InfoRow label="Tracking" value={encomienda.tracking_id ?? '—'} />
              <InfoRow
                label="Costo"
                value={
                  encomienda.costo_calculado
                    ? `${encomienda.costo_calculado} Bs`
                    : 'Por calcular'
                }
                align="right"
                valueColor={Colors.accent}
              />
            </View>

            <Divider spacing={Spacing.sm} />

            <View style={s.row}>
              <InfoRow
                label="Origen"
                value={`${encomienda.ciudad_origen ?? '—'}, ${encomienda.estado_origen ?? ''}`}
              />
              <InfoRow
                label="Destino"
                value={`${encomienda.ciudad_destino ?? '—'}, ${encomienda.estado_destino ?? ''}`}
                align="right"
              />
            </View>

            <Divider spacing={Spacing.sm} />

            <InfoRow label="Destinatario" value={encomienda.receiver_nombre || 'N/A'} />
          </Card>

          {/* ── Evidencia ───────────────────────────────────────────────── */}
          {fotoUrl && (
            <Card padding="md" style={s.card}>
              <Text variant="subheading" style={s.cardTitle}>
                Evidencia fotográfica
              </Text>
              <Image source={{ uri: fotoUrl }} style={s.photo} resizeMode="cover" />
              <Text variant="caption" color="muted" style={s.photoCaption}>
                Fotografía de registro del paquete con la etiqueta de envío visible.
              </Text>
            </Card>
          )}

          {/* ── Acciones ────────────────────────────────────────────────── */}
          {CANCELABLE.includes(encomienda.estado) && (
            <Button variant="dangerSoft" fullWidth onPress={handleCancel}>
              Cancelar envío
            </Button>
          )}

          {['CANCELADA', 'DEVUELTA'].includes(encomienda.estado) && (
            <View style={s.closedBanner}>
              <Package weight="fill" color={Colors.destructive} size={Sizes.icon.lg} />
              <Text variant="bodyStrong" color="danger">
                {`Encomienda ${estadoVisual.label.toLowerCase()}`}
              </Text>
            </View>
          )}
        </ScrollView>
      </PageTransition>
    </Screen>
  );
}

const s = StyleSheet.create({
  hint: {
    marginBottom: Spacing.lg,
  },
  card: {
    marginBottom: Spacing.lg,
  },
  centered: {
    alignItems: 'center',
  },
  cardTitle: {
    marginBottom: Spacing.md,
  },
  cardText: {
    marginTop: Spacing.sm,
  },
  qr: {
    alignItems: 'center',
  },
  pendingIcon: {
    width: Sizes.iconBox.xl,
    height: Sizes.iconBox.xl,
    borderRadius: Radius.full,
    backgroundColor: Colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
  },
  photoCaption: {
    marginTop: Spacing.md,
  },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.destructiveLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
});
