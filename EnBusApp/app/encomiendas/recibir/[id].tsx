import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WarningCircle } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusTimeline, type EstadoItem } from '@/src/components/StatusTimeline';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { PageTransition } from '@/src/components/PageTransition';
import {
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
import { getSignedPhotoUrl } from '@/src/utils/storage';
import { getEstadoVisual } from '@/src/utils/estados';
import type { Encomienda } from '@/src/types';
import { Colors, Radius, Spacing } from '@/src/theme';

/** El destinatario sólo ve el tramo del envío que le concierne. */
const STATUS_FLOW = [
  { id: 'EN_RECEPCION', label: 'Procesada' },
  { id: 'EN_TRANSITO', label: 'En tránsito' },
  { id: 'EN_OFICINA_DESTINO', label: 'Lista para retirar' },
  { id: 'ENTREGADA', label: 'Entregada al destinatario' },
] as const;

interface HistorialRow {
  estado_nuevo: string;
  created_at: string;
}

/** Oculta todo menos los últimos 4 dígitos del teléfono del remitente. */
function maskPhone(phone?: string): string {
  if (!phone) return 'N/A';
  if (phone.length <= 5) return phone;
  const visible = phone.slice(-4);
  return phone.slice(0, -4).replace(/\d/g, '•') + visible;
}

export default function DetalleRecibirScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [encomienda, setEncomienda] = useState<Encomienda | null>(null);
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    const cacheKey = `cache:encomienda_recibo:${id}`;

    const run = async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          const parsed = JSON.parse(cached);
          setEncomienda(parsed.encomienda);
          setHistorial(parsed.historial ?? []);
          setLoading(false);
        }

        const [encResult, histResult] = await Promise.all([
          supabase.from('encomiendas').select('*, profiles:sender_id(*)').eq('id', id).single(),
          supabase
            .from('encomienda_estado_historial')
            .select('estado_nuevo, created_at')
            .eq('encomienda_id', id)
            .order('created_at', { ascending: true }),
        ]);

        if (encResult.error) throw encResult.error;
        if (!isMounted) return;

        setEncomienda(encResult.data as Encomienda);
        setHistorial(histResult.data ?? []);

        AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ encomienda: encResult.data, historial: histResult.data ?? [] })
        ).catch(() => {});

        if (encResult.data.foto_evidencia_url) {
          const url = await getSignedPhotoUrl(encResult.data.foto_evidencia_url);
          if (isMounted) setFotoUrl(url);
        } else if (isMounted) {
          setFotoUrl(null);
        }
      } catch (err) {
        if (__DEV__) console.error('[recibir] Error cargando encomienda:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const buildTimeline = (enc: Encomienda): EstadoItem[] => {
    let reachedCurrent = false;

    return STATUS_FLOW.map((stage) => {
      const match = historial.find((h) => h.estado_nuevo === stage.id);
      const isCurrent = stage.id === enc.estado;
      if (isCurrent) reachedCurrent = true;

      return {
        estado: stage.id,
        label: stage.label,
        timestamp: match ? new Date(match.created_at).toLocaleString('es-VE') : null,
        completado: isCurrent ? false : !reachedCurrent,
        activo: isCurrent,
        descripcion: isCurrent ? enc.descripcion_contenido : undefined,
      };
    });
  };

  if (loading) {
    return (
      <Screen background={Colors.surface}>
        <ScreenHeader
          variant="compact"
          eyebrow="Paquete entrante"
          title="Cargando…"
          onBack={() => router.back()}
        />
        <LoadingState label="Buscando el paquete…" />
      </Screen>
    );
  }

  if (!encomienda) {
    return (
      <Screen background={Colors.surface}>
        <ScreenHeader variant="compact" title="Paquete" onBack={() => router.back()} />
        <EmptyState
          icon={WarningCircle}
          title="Paquete no encontrado"
          description="No pudimos cargar este envío."
          action={{ children: 'Volver', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const estadoVisual = getEstadoVisual('encomienda', encomienda.estado);
  const debePagar =
    encomienda.estado === 'POR_PAGAR' && encomienda.modalidad_pago === 'DESTINO';

  return (
    <Screen background={Colors.surface}>
      <PageTransition>
        <ScreenHeader
          variant="compact"
          eyebrow="Paquete entrante"
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

          {/* ── PIN de retiro ───────────────────────────────────────────── */}
          <Card padding="md" style={[s.card, s.pinCard]}>
            <Text variant="overline" color="muted" uppercase>
              Pin de retiro
            </Text>
            <Text variant="display" color="primary" align="center" compact style={s.pin}>
              {encomienda.pin_retiro || '––––'}
            </Text>
            <Text variant="caption" color="muted" align="center">
              Preséntalo junto a tu cédula al retirar el paquete.
            </Text>
          </Card>

          {/* ── Remitente y costo ───────────────────────────────────────── */}
          <Card padding="md" style={s.card}>
            <View style={s.row}>
              <InfoRow label="Remitente" value={encomienda.profiles?.nombre_completo || 'N/A'} />
              <InfoRow
                label="Costo"
                value={
                  encomienda.costo_calculado
                    ? `${encomienda.costo_calculado} Bs`
                    : 'Se paga al retirar'
                }
                align="right"
                valueColor={Colors.primary}
              />
            </View>

            <Text variant="caption" color="muted" style={s.phone}>
              {maskPhone(encomienda.profiles?.telefono)}
            </Text>

            <Divider spacing={Spacing.md} />

            <View style={s.row}>
              <InfoRow label="Contenido" value={encomienda.descripcion_contenido || '—'} />
              <InfoRow
                label="Peso declarado"
                value={encomienda.peso_kg ? `${encomienda.peso_kg} kg` : '—'}
                align="right"
              />
            </View>
          </Card>

          {/* ── Pago o seguimiento ──────────────────────────────────────── */}
          {debePagar ? (
            <View style={s.card}>
              <Text variant="subheading" style={s.cardTitle}>
                Completar pago a destino
              </Text>
              <PaymentFlow
                monto={encomienda.costo_calculado ?? 0}
                cooperativa_id={encomienda.cooperativa_id}
                encomienda_id={encomienda.id}
                concepto={`Encomienda ${encomienda.tracking_id ?? encomienda.id}`}
                onPaymentSuccess={async () => {
                  try {
                    const { error } = await supabase
                      .from('encomiendas')
                      .update({ estado: 'PENDIENTE_VERIFICACION' })
                      .eq('id', encomienda.id);
                    if (error) throw error;
                    setEncomienda((prev) =>
                      prev ? { ...prev, estado: 'PENDIENTE_VERIFICACION' } : prev
                    );
                  } catch (err) {
                    if (__DEV__) console.error('[recibir] Error post-pago:', err);
                  }
                }}
              />
            </View>
          ) : (
            <Card padding="md" style={s.card}>
              <Text variant="subheading">Seguimiento</Text>
              <StatusTimeline estados={buildTimeline(encomienda)} />
            </Card>
          )}

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
  cardTitle: {
    marginBottom: Spacing.md,
  },
  pinCard: {
    alignItems: 'center',
  },
  pin: {
    letterSpacing: 8,
    marginVertical: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  phone: {
    marginTop: -Spacing.sm,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
  },
  photoCaption: {
    marginTop: Spacing.md,
  },
});
