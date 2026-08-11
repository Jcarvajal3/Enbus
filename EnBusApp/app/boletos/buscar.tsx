import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarBlank,
  MapPin,
  SlidersHorizontal,
  Star,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { LocationSelector } from '@/src/components/LocationSelector';
import { CalendarModal } from '@/src/components/CalendarModal';
import { SeatSelector } from '@/src/components/SeatSelector';
import { PaymentFlow } from '@/src/components/PaymentFlow';
import { PressableScale } from '@/src/components/PressableScale';
import { StaggerItem } from '@/src/components/StaggerItem';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  EntityCard,
  FloatingBar,
  InfoRow,
  LoadingState,
  RouteSummary,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
import { dateFull, formatCity, formatDate } from '@/src/utils/formatters';
import { BOLETO_ESTADOS_OCUPAN_ASIENTO } from '@/src/utils/estados';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

// ─── Código de boleto (CSPRNG) ───────────────────────────────────────────────

const BOLETO_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * `Math.random()` must not generate public identifiers: 36^6 leaves a real
 * collision risk in production. `crypto.getRandomValues` is available in Hermes.
 */
function generateBoletoCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((b) => BOLETO_CHARS[b % BOLETO_CHARS.length])
    .join('');
  return `BOL-${suffix}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-VE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ViajeResumen {
  id: string;
  cooperativa_id: string;
  cooperativa: string;
  calificacion: number;
  fecha_hora_salida: string;
  horaSalida: string;
  duracion: string;
  precio: number;
  asientosDisponibles: number;
  asientosTotales: number;
  ciudadOrigen?: string;
  ciudadDestino?: string;
}

type SortType = 'hora_asc' | 'precio_asc' | 'precio_desc';

const SORT_OPTIONS: { id: SortType; label: string }[] = [
  { id: 'hora_asc', label: 'Salida más temprana' },
  { id: 'precio_asc', label: 'Precio: menor a mayor' },
  { id: 'precio_desc', label: 'Precio: mayor a menor' },
];

const STEP_TITLES = ['Selecciona tu viaje', 'Elige tus asientos', 'Confirmar pago'];

export default function BuscarBoletoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ origen?: string; destino?: string; fecha?: string }>();
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [origen, setOrigen] = useState<Localidad | null>(
    params.origen ? { ciudad: params.origen, estado: '' } : null
  );
  const [destino, setDestino] = useState<Localidad | null>(
    params.destino ? { ciudad: params.destino, estado: '' } : null
  );
  const [fecha, setFecha] = useState<Date>(() => {
    const parsed = params.fecha ? new Date(params.fecha) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });

  const [showCalendar, setShowCalendar] = useState(false);
  const [activeDates, setActiveDates] = useState<string[] | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);

  const [viajes, setViajes] = useState<ViajeResumen[]>([]);
  const [loadingViajes, setLoadingViajes] = useState(false);
  const [seleccionado, setSeleccionado] = useState<ViajeResumen | null>(null);

  const [asientosSeleccionados, setAsientosSeleccionados] = useState<string[]>([]);
  const [asientosOcupados, setAsientosOcupados] = useState<string[]>([]);

  const [filtersVisible, setFiltersVisible] = useState(false);
  const [selectedCoop, setSelectedCoop] = useState<string | null>(null);
  const [sortType, setSortType] = useState<SortType>('hora_asc');

  // ── Fechas con salidas ───────────────────────────────────────────────────
  useEffect(() => {
    if (!origen || !destino) {
      setActiveDates(null);
      return;
    }

    let isMounted = true;
    const fetchDates = async () => {
      try {
        setLoadingDates(true);
        const { data, error } = await supabase
          .from('viajes')
          .select('fecha_hora_salida, rutas!inner ( ciudad_origen, ciudad_destino )')
          .eq('estado', 'PROGRAMADO')
          .gt('asientos_disponibles', 0)
          .eq('rutas.ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('rutas.ciudad_destino', normalizeCityForDb(destino.ciudad))
          .gte('fecha_hora_salida', new Date().toISOString());

        if (error) throw error;
        if (!isMounted) return;

        setActiveDates(
          Array.from(
            new Set(
              (data ?? []).map((v: { fecha_hora_salida: string }) =>
                dateKey(new Date(v.fecha_hora_salida))
              )
            )
          ).sort()
        );
      } catch (err) {
        if (__DEV__) console.error('[buscar] Error cargando fechas:', err);
      } finally {
        if (isMounted) setLoadingDates(false);
      }
    };

    fetchDates();
    return () => {
      isMounted = false;
    };
  }, [origen, destino]);

  // ── Viajes del día seleccionado ──────────────────────────────────────────
  useEffect(() => {
    if (!origen || !destino) {
      setViajes([]);
      return;
    }

    let isMounted = true;
    const fetchViajes = async () => {
      try {
        setLoadingViajes(true);
        const startOfDay = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
        const endOfDay = new Date(
          fecha.getFullYear(),
          fecha.getMonth(),
          fecha.getDate(),
          23,
          59,
          59,
          999
        );

        const { data, error } = await supabase
          .from('viajes')
          .select(
            `id, fecha_hora_salida, asientos_disponibles, asientos_totales,
             rutas!inner ( id, ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje ),
             cooperativas ( id, nombre, calificacion_promedio )`
          )
          .eq('estado', 'PROGRAMADO')
          .gt('asientos_disponibles', 0)
          .eq('rutas.ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('rutas.ciudad_destino', normalizeCityForDb(destino.ciudad))
          .gte('fecha_hora_salida', startOfDay.toISOString())
          .lte('fecha_hora_salida', endOfDay.toISOString())
          .order('fecha_hora_salida', { ascending: true });

        if (error) throw error;
        if (!isMounted) return;

        setViajes(
          (data ?? []).map((viaje: any): ViajeResumen => {
            const ruta = Array.isArray(viaje.rutas) ? viaje.rutas[0] : viaje.rutas;
            const coop = Array.isArray(viaje.cooperativas)
              ? viaje.cooperativas[0]
              : viaje.cooperativas;
            const minutos = ruta?.duracion_estimada_min ?? 0;

            return {
              id: viaje.id,
              cooperativa_id: coop?.id ?? '',
              cooperativa: coop?.nombre ?? 'Cooperativa',
              calificacion: coop?.calificacion_promedio ?? 0,
              fecha_hora_salida: viaje.fecha_hora_salida,
              horaSalida: new Date(viaje.fecha_hora_salida).toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              duracion: `${Math.floor(minutos / 60)}h ${minutos % 60}m`,
              precio: ruta?.precio_pasaje ?? 0,
              asientosDisponibles: viaje.asientos_disponibles,
              asientosTotales: viaje.asientos_totales,
              ciudadOrigen: ruta?.ciudad_origen,
              ciudadDestino: ruta?.ciudad_destino,
            };
          })
        );
      } catch (err) {
        if (__DEV__) console.error('[buscar] Error cargando viajes:', err);
      } finally {
        if (isMounted) setLoadingViajes(false);
      }
    };

    fetchViajes();
    return () => {
      isMounted = false;
    };
  }, [origen, destino, fecha]);

  // ── Asientos ocupados del viaje elegido ──────────────────────────────────
  useEffect(() => {
    if (!seleccionado) return;
    let isMounted = true;

    supabase
      .from('boletos')
      .select('asiento')
      .eq('viaje_id', seleccionado.id)
      .in('estado', [...BOLETO_ESTADOS_OCUPAN_ASIENTO])
      .then(({ data, error }) => {
        if (error) {
          if (__DEV__) console.error('[buscar] Error cargando asientos:', error.message);
          return;
        }
        if (isMounted) setAsientosOcupados((data ?? []).map((b) => b.asiento));
      });

    return () => {
      isMounted = false;
    };
  }, [seleccionado]);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const cooperativas = useMemo(
    () => Array.from(new Set(viajes.map((v) => v.cooperativa))),
    [viajes]
  );

  const visibles = useMemo(() => {
    const filtered = selectedCoop ? viajes.filter((v) => v.cooperativa === selectedCoop) : viajes;
    return [...filtered].sort((a, b) => {
      if (sortType === 'precio_asc') return a.precio - b.precio;
      if (sortType === 'precio_desc') return b.precio - a.precio;
      return (
        new Date(a.fecha_hora_salida).getTime() - new Date(b.fecha_hora_salida).getTime()
      );
    });
  }, [viajes, selectedCoop, sortType]);

  const filtersActive = selectedCoop !== null || sortType !== 'hora_asc';

  // ── Compra ───────────────────────────────────────────────────────────────
  const handlePaymentSuccess = async (
    _pagoId?: string,
    pagoPayload?: Record<string, unknown>
  ) => {
    if (!user || !seleccionado) return;

    try {
      const inserts = asientosSeleccionados.map((asiento) => ({
        codigo_boleto: generateBoletoCode(),
        comprador_id: user.id,
        viaje_id: seleccionado.id,
        cooperativa_id: seleccionado.cooperativa_id,
        asiento,
        precio: seleccionado.precio,
        estado: 'RESERVADO',
        // 30 minutos para que la cooperativa verifique el pago
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
          console.error('[buscar] Pago insert falló:', pagoError.message);
        }
      }

      router.replace({ pathname: '/boletos/[id]', params: { id: boletos[0].codigo_boleto } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No se pudo generar el boleto: ${message}`);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((prev) => (prev - 1) as 1 | 2);
    else router.back();
  };

  const calendarEnabled = !!origen && !!destino && !loadingDates;
  const total = asientosSeleccionados.length * (seleccionado?.precio ?? 0);

  return (
    <Screen>
      <ScreenHeader
        variant="steps"
        title={STEP_TITLES[step - 1]}
        step={step}
        totalSteps={3}
        onBack={handleBack}
        backLabel={step > 1 ? 'Volver al paso anterior' : 'Volver'}
      />

      <ScrollView
        contentContainerStyle={scrollContent({ floatingAction: step === 1, top: Spacing.sm })}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Paso 1: elegir viaje ─────────────────────────────────────── */}
        {step === 1 && (
          <>
            <Card tone="sunken" padding="sm" elevated={false} radius="2xl">
              <View style={s.routeBar}>
                <LocationSelector
                  label="Origen"
                  value={origen}
                  onChange={setOrigen}
                  customTrigger={(open) => (
                    <CompactLocation
                      value={origen?.ciudad}
                      placeholder="Origen"
                      tint={Colors.accent}
                      onPress={open}
                    />
                  )}
                />
                <Text variant="caption" color="muted" compact>
                  →
                </Text>
                <LocationSelector
                  label="Destino"
                  value={destino}
                  onChange={setDestino}
                  customTrigger={(open) => (
                    <CompactLocation
                      value={destino?.ciudad}
                      placeholder="Destino"
                      tint={Colors.secondary}
                      onPress={open}
                    />
                  )}
                />
              </View>

              <PressableScale
                onPress={() => calendarEnabled && setShowCalendar(true)}
                disabled={!calendarEnabled}
                scaleValue={Motion.press.button}
                style={s.dateRow}
                accessibilityRole="button"
                accessibilityLabel={`Fecha: ${formatShortDate(fecha)}`}
              >
                <CalendarBlank size={Sizes.icon.md} color={Colors.accent} weight="bold" />
                <Text variant="bodyStrong" size="sm" compact style={s.dateText}>
                  {formatShortDate(fecha)}
                </Text>
              </PressableScale>
            </Card>

            {viajes.length > 0 && (
              <PressableScale
                onPress={() => setFiltersVisible(true)}
                haptic
                hapticType="selection"
                scaleValue={Motion.press.button}
                style={s.filterRow}
                accessibilityRole="button"
                accessibilityLabel="Filtrar y ordenar resultados"
              >
                <Text variant="label">
                  {`${visibles.length} ${visibles.length === 1 ? 'salida' : 'salidas'}`}
                </Text>
                <View style={s.filterTrigger}>
                  <Text variant="label" color="accent">
                    Filtrar
                  </Text>
                  <SlidersHorizontal color={Colors.accent} weight="bold" size={Sizes.icon.md} />
                  {filtersActive && <View style={s.filterDot} />}
                </View>
              </PressableScale>
            )}

            <View style={s.results}>
              {loadingViajes ? (
                <LoadingState label="Buscando salidas…" compact />
              ) : !origen || !destino ? (
                <EmptyState
                  icon={MapPin}
                  title="Elige tu ruta"
                  description="Selecciona origen y destino para ver las salidas disponibles."
                  compact
                />
              ) : viajes.length === 0 ? (
                <EmptyState
                  icon={CalendarBlank}
                  title="Sin salidas ese día"
                  description="No hay viajes programados para esta ruta en la fecha elegida. Prueba con otro día."
                  action={
                    calendarEnabled
                      ? { children: 'Cambiar fecha', onPress: () => setShowCalendar(true) }
                      : undefined
                  }
                  compact
                />
              ) : visibles.length === 0 ? (
                <EmptyState
                  icon={SlidersHorizontal}
                  title="Sin coincidencias"
                  description="Ningún viaje cumple con los filtros seleccionados."
                  action={{
                    children: 'Quitar filtros',
                    onPress: () => {
                      setSelectedCoop(null);
                      setSortType('hora_asc');
                    },
                  }}
                  compact
                />
              ) : (
                visibles.map((viaje, index) => (
                  <StaggerItem key={viaje.id} index={index}>
                    <EntityCard
                      selectable
                      selected={seleccionado?.id === viaje.id}
                      onPress={() => setSeleccionado(viaje)}
                      title={viaje.cooperativa}
                      subtitle={`${viaje.horaSalida} · ${viaje.duracion}`}
                      initial={viaje.cooperativa.charAt(0).toUpperCase()}
                      tone="accent"
                      badge={
                        viaje.calificacion > 0 ? (
                          <Badge tone="pending" icon={Star}>
                            {viaje.calificacion.toFixed(1)}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Nueva</Badge>
                        )
                      }
                      meta={
                        <View style={s.priceMeta}>
                          <Text variant="bodyStrong" weight="heavy" compact>
                            {`${viaje.precio} Bs`}
                          </Text>
                          <Text variant="caption" size="xs" color="muted" compact>
                            {`${viaje.asientosDisponibles} libres`}
                          </Text>
                        </View>
                      }
                      accessibilityLabel={`${viaje.cooperativa}, sale ${viaje.horaSalida}, ${viaje.precio} bolívares, ${viaje.asientosDisponibles} asientos libres`}
                    />
                  </StaggerItem>
                ))
              )}
            </View>
          </>
        )}

        {/* ─── Paso 2: asientos ─────────────────────────────────────────── */}
        {step === 2 && seleccionado && (
          <>
            <TripCard viaje={seleccionado} />
            <SeatSelector
              viaje_id={seleccionado.id}
              asientosTotales={seleccionado.asientosTotales ?? 0}
              asientosOcupados={asientosOcupados}
              precioUnitario={seleccionado.precio}
              onConfirm={(asientos) => {
                setAsientosSeleccionados(asientos);
                setStep(3);
              }}
            />
          </>
        )}

        {/* ─── Paso 3: pago ─────────────────────────────────────────────── */}
        {step === 3 && seleccionado && (
          <>
            <TripCard
              viaje={seleccionado}
              extras={
                <>
                  <Divider spacing={Spacing.lg} />
                  <View style={s.summaryRow}>
                    <InfoRow
                      label="Asientos"
                      value={[...asientosSeleccionados]
                        .sort((a, b) => Number(a) - Number(b))
                        .join(', ')}
                    />
                    <InfoRow
                      label="Total a pagar"
                      value={`${total} Bs`}
                      align="right"
                      valueColor={Colors.secondary}
                    />
                  </View>
                </>
              }
            />
            <PaymentFlow
              monto={total}
              cooperativa_id={seleccionado.cooperativa_id}
              concepto={`${asientosSeleccionados.length} asiento(s) · ${formatCity(
                seleccionado.ciudadOrigen
              )} → ${formatCity(seleccionado.ciudadDestino)}`}
              onPaymentSuccess={handlePaymentSuccess}
            />
          </>
        )}
      </ScrollView>

      {step === 1 && visibles.length > 0 && (
        <FloatingBar>
          <Button
            variant="accent"
            fullWidth
            disabled={!seleccionado}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setStep(2);
            }}
          >
            {seleccionado ? `Continuar con ${seleccionado.cooperativa}` : 'Elige una salida'}
          </Button>
        </FloatingBar>
      )}

      <CalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        value={fecha}
        onChange={setFecha}
        minimumDate={new Date()}
        activeDates={activeDates ?? undefined}
      />

      <BottomSheet
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
        title="Filtrar y ordenar"
        footer={
          <Button variant="accent" fullWidth onPress={() => setFiltersVisible(false)}>
            Ver resultados
          </Button>
        }
      >
        <ScrollView contentContainerStyle={s.sheetContent} showsVerticalScrollIndicator={false}>
          <SectionLabel>Cooperativa</SectionLabel>
          <View style={s.chipGrid}>
            <Chip label="Todas" selected={!selectedCoop} onPress={() => setSelectedCoop(null)} />
            {cooperativas.map((coop) => (
              <Chip
                key={coop}
                label={coop}
                selected={selectedCoop === coop}
                onPress={() => setSelectedCoop(coop)}
              />
            ))}
          </View>

          <SectionLabel style={s.sortLabel}>Ordenar por</SectionLabel>
          <View style={s.sortList}>
            {SORT_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                selected={sortType === option.id}
                onPress={() => setSortType(option.id)}
                fullWidth
              />
            ))}
          </View>
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

// ─── Trip card ───────────────────────────────────────────────────────────────

function TripCard({ viaje, extras }: { viaje: ViajeResumen; extras?: React.ReactNode }) {
  return (
    <Card padding="md" style={s.tripCard}>
      <View style={s.tripHeader}>
        <Text variant="subheading" numberOfLines={1} style={s.tripName}>
          {viaje.cooperativa}
        </Text>
        {viaje.calificacion > 0 && (
          <Badge tone="pending" icon={Star} size="md">
            {viaje.calificacion.toFixed(1)}
          </Badge>
        )}
      </View>

      <Divider spacing={Spacing.lg} />

      <RouteSummary
        origen={viaje.ciudadOrigen}
        destino={viaje.ciudadDestino}
        duration={viaje.duracion}
      />

      <Divider spacing={Spacing.lg} />

      <View style={s.tripFooter}>
        <InfoRow label="Fecha" value={formatDate(viaje.fecha_hora_salida, dateFull)} />
        <InfoRow label="Salida" value={viaje.horaSalida} />
        <InfoRow
          label="Precio"
          value={`${viaje.precio} Bs`}
          align="right"
          valueColor={Colors.secondary}
        />
      </View>

      {extras}
    </Card>
  );
}

// ─── Compact location trigger ────────────────────────────────────────────────

function CompactLocation({
  value,
  placeholder,
  tint,
  onPress,
}: {
  value?: string;
  placeholder: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleValue={Motion.press.button}
      style={s.compact}
      accessibilityRole="button"
      accessibilityLabel={`${placeholder}: ${value ?? 'sin seleccionar'}`}
    >
      <MapPin size={Sizes.icon.sm} color={tint} weight="fill" />
      <Text
        variant="bodyStrong"
        size="sm"
        color={value ? 'foreground' : 'muted'}
        numberOfLines={1}
        compact
        style={s.compactText}
      >
        {value ?? placeholder}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  routeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceDark,
    borderRadius: Radius.full,
    padding: Spacing.xs + 2,
  },
  compact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    height: Sizes.control.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
  },
  compactText: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    height: Sizes.control.md,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
  },
  dateText: {
    flex: 1,
    textTransform: 'capitalize',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xs,
  },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  filterDot: {
    width: Spacing.sm - 2,
    height: Spacing.sm - 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.secondary,
  },
  results: {
    marginTop: Spacing.lg,
  },
  priceMeta: {
    alignItems: 'flex-end',
  },
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  sheetContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing.xl,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  sortLabel: {
    marginTop: Spacing['2xl'],
  },
  sortList: {
    gap: Spacing.sm,
  },
});
