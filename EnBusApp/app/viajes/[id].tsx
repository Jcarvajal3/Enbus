import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Star, WarningCircle } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { SeatSelector } from '@/src/components/SeatSelector';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { PageTransition } from '@/src/components/PageTransition';
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  InfoRow,
  LoadingState,
  RouteSummary,
  Screen,
  ScreenHeader,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { dateFull, formatCity, formatDate, timeOnly } from '@/src/utils/formatters';
import { BOLETO_ESTADOS_OCUPAN_ASIENTO } from '@/src/utils/estados';
import type { Viaje } from '@/src/types';
import { Colors, Spacing } from '@/src/theme';

// ─── Código de boleto (CSPRNG) ───────────────────────────────────────────────

const BOLETO_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateBoletoCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((b) => BOLETO_CHARS[b % BOLETO_CHARS.length])
    .join('');
  return `BOL-${suffix}`;
}

export default function DetalleViajeScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  const [viaje, setViaje] = useState<Viaje | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [asientosOcupados, setAsientosOcupados] = useState<string[]>([]);
  const [asientosSeleccionados, setAsientosSeleccionados] = useState<string[]>([]);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);

        const [viajeResult, boletosResult] = await Promise.all([
          supabase
            .from('viajes')
            .select(
              `id, fecha_hora_salida, asientos_totales, asientos_disponibles,
               numero_unidad, nombre_chofer,
               rutas ( ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje ),
               cooperativas ( id, nombre, calificacion_promedio )`
            )
            .eq('id', id)
            .single(),
          supabase
            .from('boletos')
            .select('asiento')
            .eq('viaje_id', id)
            .in('estado', [...BOLETO_ESTADOS_OCUPAN_ASIENTO]),
        ]);

        if (viajeResult.error) throw viajeResult.error;

        if (isMounted) {
          setViaje(viajeResult.data as unknown as Viaje);
          setAsientosOcupados((boletosResult.data ?? []).map((b) => b.asiento));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al cargar el viaje';
        if (__DEV__) console.error('[viaje] Error cargando datos:', message);
        if (isMounted) setFetchError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    // Realtime: otro usuario puede reservar mientras eliges asiento.
    const channel = supabase
      .channel(`rt:boletos:viaje:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boletos', filter: `viaje_id=eq.${id}` },
        (payload) => {
          if (!isMounted) return;

          setAsientosOcupados((prev) => {
            const ocupa = (estado: string) =>
              (BOLETO_ESTADOS_OCUPAN_ASIENTO as readonly string[]).includes(estado);

            if (payload.eventType === 'DELETE') {
              const removed = payload.old as { asiento: string };
              return prev.filter((a) => a !== removed.asiento);
            }

            const row = payload.new as { asiento: string; estado: string };
            if (ocupa(row.estado)) return Array.from(new Set([...prev, row.asiento]));
            return prev.filter((a) => a !== row.asiento);
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handlePaymentSuccess = async (
    _pagoId?: string,
    pagoPayload?: Record<string, unknown>
  ) => {
    if (!user || !viaje) return;

    try {
      const precioUnitario = viaje.rutas?.precio_pasaje ?? 0;
      const inserts = asientosSeleccionados.map((asiento) => ({
        codigo_boleto: generateBoletoCode(),
        comprador_id: user.id,
        viaje_id: viaje.id,
        cooperativa_id: viaje.cooperativas?.id ?? '',
        asiento,
        precio: precioUnitario,
        estado: 'RESERVADO',
        reserva_expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }));

      const { data: boletos, error } = await supabase
        .from('boletos')
        .insert(inserts)
        .select('id, codigo_boleto');

      if (error || !boletos?.length) {
        throw error ?? new Error('No se devolvieron los boletos insertados');
      }

      if (pagoPayload) {
        const { error: pagoError } = await supabase
          .from('pagos')
          .insert({ ...pagoPayload, boleto_id: boletos[0].id });
        if (pagoError && __DEV__) {
          console.error('[viaje] Pago insert falló:', pagoError.message);
        }
      }

      router.replace({ pathname: '/boletos/[id]', params: { id: boletos[0].codigo_boleto } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No se pudo generar el boleto: ${message}`);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Cargando viaje…" />
      </Screen>
    );
  }

  if (!viaje) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Viaje" onBack={() => router.back()} />
        <EmptyState
          icon={WarningCircle}
          title={fetchError ? 'No se pudo cargar el viaje' : 'Viaje no encontrado'}
          description={fetchError ?? 'Es posible que la salida ya no esté disponible.'}
          action={{ children: 'Volver', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const ruta = viaje.rutas;
  const cooperativa = viaje.cooperativas;
  const minutos = ruta?.duracion_estimada_min ?? 0;
  const precioUnitario = ruta?.precio_pasaje ?? 0;
  const step = showPayment ? 2 : 1;

  return (
    <Screen>
      <PageTransition>
        <ScreenHeader
          variant="steps"
          title={step === 1 ? 'Selección de asientos' : 'Confirmar pago'}
          step={step}
          totalSteps={2}
          onBack={() => (showPayment ? setShowPayment(false) : router.back())}
          backLabel={showPayment ? 'Volver al selector de asientos' : 'Volver'}
        />

        <ScrollView
          contentContainerStyle={scrollContent({ top: Spacing.sm })}
          showsVerticalScrollIndicator={false}
        >
          <Card padding="md" style={s.tripCard}>
            <View style={s.tripHeader}>
              <Text variant="subheading" numberOfLines={1} style={s.tripName}>
                {cooperativa?.nombre ?? 'Cooperativa'}
              </Text>
              {(cooperativa?.calificacion_promedio ?? 0) > 0 && (
                <Badge tone="pending" icon={Star} size="md">
                  {Number(cooperativa?.calificacion_promedio ?? 0).toFixed(1)}
                </Badge>
              )}
            </View>

            <Divider spacing={Spacing.lg} />

            <RouteSummary
              origen={ruta?.ciudad_origen}
              destino={ruta?.ciudad_destino}
              duration={`${Math.floor(minutos / 60)}h ${minutos % 60}m`}
            />

            <Divider spacing={Spacing.lg} />

            <View style={s.tripFooter}>
              <InfoRow label="Fecha" value={formatDate(viaje.fecha_hora_salida, dateFull)} />
              <InfoRow label="Salida" value={formatDate(viaje.fecha_hora_salida, timeOnly)} />
              <InfoRow
                label="Precio"
                value={`${precioUnitario} Bs`}
                align="right"
                valueColor={Colors.secondary}
              />
            </View>
          </Card>

          {showPayment ? (
            <PaymentFlow
              monto={asientosSeleccionados.length * precioUnitario}
              cooperativa_id={cooperativa?.id}
              concepto={`${asientosSeleccionados.length} asiento(s) · ${formatCity(
                ruta?.ciudad_origen
              )} → ${formatCity(ruta?.ciudad_destino)}`}
              onPaymentSuccess={handlePaymentSuccess}
            />
          ) : (
            <SeatSelector
              viaje_id={viaje.id}
              asientosTotales={viaje.asientos_totales ?? 0}
              asientosOcupados={asientosOcupados}
              precioUnitario={precioUnitario}
              onConfirm={(asientos) => {
                setAsientosSeleccionados(asientos);
                setShowPayment(true);
              }}
            />
          )}
        </ScrollView>
      </PageTransition>
    </Screen>
  );
}

const s = StyleSheet.create({
  tripCard: {
    marginBottom: Spacing.lg,
  },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  tripName: {
    flex: 1,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
});
