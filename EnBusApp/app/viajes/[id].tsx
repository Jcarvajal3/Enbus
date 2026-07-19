import { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, ScrollView, View, Text as BaseText, useCSSVariable } from '@/tw';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { ArrowLeft, Clock, Star, WarningCircle } from 'phosphor-react-native';
import { SeatSelector } from '@/src/components/SeatSelector';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { Spinner } from '@/src/components/Spinner';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { formatDate, dateFull, timeOnly, formatCity } from '@/src/utils/formatters';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/src/components/Toast';
import type { Viaje } from '@/src/types';
import { PressableScale } from '@/src/components/PressableScale';
import { PageTransition } from '@/src/components/PageTransition';
import { Colors, Typography, Radius, Spacing, Shadows } from '@/src/theme';

const Text = (props: React.ComponentProps<typeof BaseText>) => {
  return (
    <BaseText
      {...props}
      style={[{ fontFamily: Typography.family }, props.style]}
    />
  );
};

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
  const foregroundColor = useCSSVariable('--foreground') as string || Colors.foreground;
  const destructiveColor = useCSSVariable('--destructive') as string || Colors.destructive;

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
          setViaje(viajeResult.data as unknown as Viaje);
          setAsientosOcupados(
            (boletosResult.data ?? []).map((b: { asiento: string }) => b.asiento)
          );
        }
      } catch (err: any) {
        console.error('[DetalleViaje] Error cargando datos:', err.message);
        // UX-01: Expose error to UI instead of silently failing
        if (isMounted) setFetchError(err.message ?? 'Error al cargar el viaje');
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

  // UX-01: Visible error state
  if (fetchError && !viaje) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center px-8">
        <WarningCircle color={destructiveColor} size={48} weight="thin" />
        <Text className="text-foreground font-bold text-base mt-4 text-center">No se pudo cargar el viaje</Text>
        <Text className="text-muted-foreground text-sm mt-2 text-center">{fetchError}</Text>
        <PressableScale
          onPress={() => router.back()}
          style={s.errorBackButton}
        >
          <Text style={s.errorBackButtonText}>Volver</Text>
        </PressableScale>
      </SafeAreaView>
    );
  }

  if (!viaje) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <Text className="text-muted-foreground font-bold">Viaje no encontrado</Text>
        <PressableScale
          onPress={() => router.back()}
          style={s.notFoundBackButton}
        >
          <Text style={s.notFoundBackButtonText}>Volver</Text>
        </PressableScale>
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
        cooperativa_id: cooperativa?.id ?? '',
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

  const step = showPayment ? 2 : 1;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <PageTransition>
        {/* Header Stepper */}
        <View style={s.header}>
          <View style={s.headerTopRow}>
            <PressableScale
              onPress={() => showPayment ? setShowPayment(false) : router.back()}
              style={s.backButton}
              accessibilityLabel={showPayment ? 'Volver al selector de asientos' : 'Volver a resultados'}
              accessibilityRole="button"
            >
              <ArrowLeft weight="bold" color={foregroundColor} size={22} />
            </PressableScale>
            <View style={s.stepperRow}>
              <View style={s.stepperDotsContainer}>
                {[1, 2].map((s2) => {
                  const isActive = s2 === step;
                  return (
                    <View
                      key={s2}
                      style={isActive ? s.stepperActivePill : s.stepperInactiveDot}
                    />
                  );
                })}
              </View>
              <Text style={s.stepperNumber}>
                {`0${step}`}
              </Text>
            </View>
          </View>
          <Text style={s.headerTitle}>
            {step === 1 ? 'Selección de Asientos' : 'Confirmar Pago'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={s.scrollContent}>
          <View style={s.formCard}>
            {/* Info de la Ruta */}
            <View style={s.infoCard}>
              {/* Cooperativa info header inside the card */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, paddingBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
                  {cooperativa?.nombre || 'Cooperativa'}
                </Text>
                {(cooperativa?.calificacion_promedio ?? 0) > 0 && (
                  <View style={s.ratingBadge}>
                    <Star weight="fill" color={Colors.primary} size={14} />
                    <Text style={s.ratingText}>
                      {Number(cooperativa?.calificacion_promedio ?? 0).toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>

              <View className="flex-row justify-between items-center mb-4">
                <View className="items-center flex-1">
                  <Text style={s.cityCode}>{formatCity(ruta?.ciudad_origen).substring(0, 3).toUpperCase()}</Text>
                  <Text style={s.cityName}>{formatCity(ruta?.ciudad_origen)}</Text>
                </View>

                <View style={s.routeMiddle}>
                  {/* Visual Timeline / Route */}
                  <View style={s.routeTimeline}>
                    {/* Origin Dot (active/completed: Colors.accent) */}
                    <View style={s.dotOrigin} />

                    {/* Line */}
                    <View style={s.routeLine} />

                    {/* Destination Dot (upcoming: Colors.secondary) */}
                    <View style={s.dotDestination} />
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Clock color={Colors.mutedForeground} weight="fill" size={12} />
                    <Text style={s.durationText}>{horasDuration}h {minDuration}m</Text>
                  </View>
                </View>

                <View className="items-center flex-1">
                  <Text style={s.cityCode}>{formatCity(ruta?.ciudad_destino).substring(0, 3).toUpperCase()}</Text>
                  <Text style={s.cityName}>{formatCity(ruta?.ciudad_destino)}</Text>
                </View>
              </View>

              <View style={s.infoCardFooter}>
                <View>
                  <Text style={s.infoLabel}>Fecha</Text>
                  <Text style={s.infoValue}>{formatDate(viaje.fecha_hora_salida, dateFull)}</Text>
                </View>
                <View>
                  <Text style={s.infoLabel}>Hora salida</Text>
                  <Text style={s.infoValue}>
                    {formatDate(viaje.fecha_hora_salida, timeOnly)}
                  </Text>
                </View>
                <View>
                  <Text style={s.infoLabel}>Precio</Text>
                  <Text style={s.priceValue}>{precioUnitario} Bs</Text>
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
                asientosTotales={viaje.asientos_totales ?? 0}
                asientosOcupados={asientosOcupados}
                precioUnitario={precioUnitario}
                onConfirm={handleConfirmSeats}
              />
            )}
          </View>
        </ScrollView>
      </PageTransition>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // ─── Error / Not Found States ────────────────────────────────────────────────
  errorBackButton: {
    marginTop: Spacing['2xl'],
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
  },
  errorBackButtonText: {
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
  },
  notFoundBackButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
  },
  notFoundBackButtonText: {
    color: Colors.foreground,
  },

  // ─── Header Stepper ──────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.background,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperActivePill: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.foreground,
  },
  stepperInactiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  stepperNumber: {
    fontSize: 14,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.foreground,
  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    textAlign: 'center',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 20,
    marginBottom: 24,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  ratingText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    marginLeft: 4,
  },

  // ─── Scroll ───────────────────────────────────────────────────────────────────
  scrollContent: {
    padding: Spacing['2xl'],
    paddingBottom: 128,
  },

  // ─── Info Card ───────────────────────────────────────────────────────────────
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing['2xl'],
    marginBottom: Spacing['2xl'],
  },
  cityCode: {
    fontSize: Typography.sizes['2xl'],
    fontWeight: Typography.weights.heavy,
    color: Colors.foreground,
  },
  cityName: {
    fontSize: 12,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.medium,
    marginTop: 4,
  },

  // ─── Route Middle / Timeline ──────────────────────────────────────────────────
  routeMiddle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  routeTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    marginBottom: 6,
  },
  dotOrigin: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },
  routeLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  dotDestination: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.secondary,
  },
  durationText: {
    fontSize: 12,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.bold,
  },

  // ─── Info Card Footer ─────────────────────────────────────────────────────────
  infoCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.mutedForeground,
    fontWeight: Typography.weights.bold,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.foreground,
    fontWeight: Typography.weights.bold,
  },
  priceValue: {
    fontSize: 14,
    color: Colors.secondary,
    fontWeight: Typography.weights.heavy,
  },
});
