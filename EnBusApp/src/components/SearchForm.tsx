import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ArrowRight,
  ArrowsLeftRight,
  Bus,
  CalendarBlank,
  MapPin,
  Package,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LocationSelector } from './LocationSelector';
import { CalendarModal } from './CalendarModal';
import { PressableScale } from './PressableScale';
import { Button, SegmentedControl, Text } from '@/src/components/ui';
import { Localidad, normalizeCityForDb } from '../utils/venezuela';
import { supabase } from '../utils/supabase';
import { Colors, Motion, Opacity, Radius, Sizes, Spacing } from '@/src/theme';

type SearchMode = 'boletos' | 'encomiendas';

interface SearchFormProps {
  mode?: SearchMode;
  showModeToggle?: boolean;
  initialOrigen?: Localidad;
  initialDestino?: Localidad;
  onSubmit: (data: {
    origen: Localidad;
    destino: Localidad;
    fecha?: string;
    mode: string;
  }) => void;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-VE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** `YYYY-MM-DD` in local time — the key format used to match available dates. */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function SearchForm({
  mode: initialMode = 'boletos',
  showModeToggle = false,
  initialOrigen,
  initialDestino,
  onSubmit,
}: SearchFormProps) {
  const [currentMode, setCurrentMode] = useState<SearchMode>(initialMode);
  const [origen, setOrigen] = useState<Localidad | null>(initialOrigen ?? null);
  const [destino, setDestino] = useState<Localidad | null>(initialDestino ?? null);
  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDates, setActiveDates] = useState<string[] | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  /**
   * APP-12 / M-10: la consulta de fechas falló. No se bloquea la búsqueda: el
   * calendario queda sin restricción y los resultados dicen si hay salidas.
   */
  const [errorDates, setErrorDates] = useState(false);
  const [reintentoDates, setReintentoDates] = useState(0);
  /** La fecha se movió sola al primer día con salidas (APP-13): se avisa. */
  const [fechaAjustada, setFechaAjustada] = useState(false);

  const isBoleto = currentMode === 'boletos';

  // ── Swap animation ─────────────────────────────────────────────────────────
  const rotation = useSharedValue(0);
  const swapStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const swapLocations = () => {
    Haptics.selectionAsync();
    rotation.value = withTiming(rotation.value + 180, {
      duration: Motion.duration.base,
      easing: Motion.easing.out,
    });
    setOrigen(destino);
    setDestino(origen);
  };

  // ── Fechas con viajes disponibles ──────────────────────────────────────────
  useEffect(() => {
    if (!isBoleto || !origen || !destino) {
      setActiveDates(null);
      setErrorDates(false);
      setFechaAjustada(false);
      return;
    }

    let isMounted = true;
    const fetchActiveDates = async () => {
      try {
        setLoadingDates(true);
        setErrorDates(false);
        setFechaAjustada(false);
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

        const unique = Array.from(
          new Set((data ?? []).map((v: { fecha_hora_salida: string }) => toDateKey(new Date(v.fecha_hora_salida))))
        ).sort();
        setActiveDates(unique);

        // Snap the picker to the first available day if the current one has no trips.
        if (unique.length > 0 && !unique.includes(toDateKey(fecha))) {
          const [y, m, d] = unique[0].split('-').map(Number);
          setFecha(new Date(y, m - 1, d));
          setFechaAjustada(true);
        }
      } catch (err) {
        if (__DEV__) console.warn('[SearchForm] Error cargando fechas activas:', err);
        if (isMounted) {
          setActiveDates(null);
          setErrorDates(true);
        }
      } finally {
        if (isMounted) setLoadingDates(false);
      }
    };

    fetchActiveDates();
    return () => {
      isMounted = false;
    };
    // `fecha` is intentionally excluded: it is corrected inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBoleto, origen, destino, reintentoDates]);

  const hasRoute = !!origen && !!destino;
  const mismaCiudad =
    !!origen && !!destino && normalizeCityForDb(origen.ciudad) === normalizeCityForDb(destino.ciudad);
  const sinSalidas = !errorDates && !!activeDates && activeDates.length === 0;
  const calendarEnabled =
    hasRoute && !mismaCiudad && !loadingDates && (errorDates || (!!activeDates && activeDates.length > 0));

  const dateLabel = (() => {
    if (!hasRoute) return 'Elige origen y destino';
    if (loadingDates) return 'Buscando fechas con salidas…';
    if (sinSalidas) return 'Sin salidas en esta ruta';
    return formatShortDate(fecha);
  })();

  /** Por qué el botón está deshabilitado. `null` = se puede continuar. */
  const motivoBloqueo = (() => {
    if (!origen && !destino) return 'Elige origen y destino';
    if (!origen) return 'Elige el origen';
    if (!destino) return 'Elige el destino';
    if (mismaCiudad) return 'El origen y el destino deben ser ciudades distintas';
    if (!isBoleto) return null;
    if (loadingDates) return 'Buscando fechas con salidas…';
    if (sinSalidas) return 'No hay salidas programadas en esta ruta. Prueba con otro destino.';
    return null;
  })();

  const canSubmit = motivoBloqueo === null;

  const handleSubmit = () => {
    if (!origen || !destino || !canSubmit) return;
    onSubmit({
      mode: currentMode,
      origen,
      destino,
      ...(isBoleto ? { fecha: fecha.toISOString() } : {}),
    });
  };

  return (
    <View>
      {showModeToggle && (
        <SegmentedControl<SearchMode>
          value={currentMode}
          onChange={setCurrentMode}
          options={[
            { value: 'boletos', label: 'Viajar', icon: Bus },
            { value: 'encomiendas', label: 'Enviar encomienda', icon: Package },
          ]}
          style={s.modeToggle}
        />
      )}

      {/* ── Origen ⇄ Destino ──────────────────────────────────────────────── */}
      <View style={s.locationRow}>
        <LocationSelector
          label="Origen"
          value={origen}
          onChange={setOrigen}
          customTrigger={(open) => (
            <LocationTrigger label="Desde" value={origen?.ciudad} onPress={open} />
          )}
        />

        <PressableScale
          onPress={swapLocations}
          scaleValue={0.8}
          duration={Motion.duration.instant}
          style={s.swap}
          accessibilityRole="button"
          accessibilityLabel="Intercambiar origen y destino"
        >
          <Animated.View style={swapStyle}>
            <ArrowsLeftRight
              size={Sizes.icon.md}
              color={Colors.mutedForeground}
              weight="bold"
            />
          </Animated.View>
        </PressableScale>

        <LocationSelector
          label="Destino"
          value={destino}
          onChange={setDestino}
          customTrigger={(open) => (
            <LocationTrigger label="Hacia" value={destino?.ciudad} onPress={open} />
          )}
        />
      </View>

      {/* ── Fecha (solo boletos) ──────────────────────────────────────────── */}
      {isBoleto && (
        <PressableScale
          onPress={() => calendarEnabled && setShowDatePicker(true)}
          disabled={!calendarEnabled}
          scaleValue={Motion.press.button}
          style={[s.dateRow, !calendarEnabled && s.dateRowDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Fecha de viaje: ${dateLabel}`}
          accessibilityState={{ disabled: !calendarEnabled }}
        >
          <CalendarBlank
            size={Sizes.icon.md}
            color={calendarEnabled ? Colors.primary : Colors.mutedForeground}
            weight="bold"
          />
          <Text
            variant="bodyStrong"
            size="sm"
            color={calendarEnabled ? 'foreground' : 'muted'}
            numberOfLines={1}
            compact
            style={s.dateText}
          >
            {dateLabel}
          </Text>
        </PressableScale>
      )}

      {isBoleto && errorDates && hasRoute ? (
        <View style={s.dateHelp} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text variant="caption" color="warningText" style={s.dateHelpText}>
            No pudimos verificar las fechas con salidas. Puedes buscar igual.
          </Text>
          <PressableScale
            onPress={() => setReintentoDates((n) => n + 1)}
            haptic
            hapticType="selection"
            style={s.linkBox}
            accessibilityRole="button"
            accessibilityLabel="Reintentar la carga de fechas"
          >
            <Text variant="caption" weight="bold" color="warningText" style={s.link}>
              Reintentar
            </Text>
          </PressableScale>
        </View>
      ) : isBoleto && fechaAjustada && !loadingDates ? (
        <Text variant="caption" color="muted" style={s.dateHelp}>
          Te mostramos el primer día con salidas. Toca la fecha para cambiarla.
        </Text>
      ) : null}

      <Button
        variant="accent"
        size="lg"
        fullWidth
        iconRight={ArrowRight}
        disabled={!canSubmit}
        onPress={handleSubmit}
        accessibilityLabel={
          motivoBloqueo
            ? `${isBoleto ? 'Buscar viaje' : 'Enviar encomienda'}. ${motivoBloqueo}`
            : undefined
        }
      >
        {isBoleto ? 'Buscar viaje' : 'Enviar encomienda'}
      </Button>

      {/* Un botón deshabilitado siempre dice qué falta (APP-12, APP-13). */}
      {motivoBloqueo ? (
        <Text variant="caption" color="muted" align="center" style={s.blockReason}>
          {motivoBloqueo}
        </Text>
      ) : null}

      {/* Kept outside the pressable so its state survives re-renders of the row */}
      <CalendarModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        value={fecha}
        onChange={(d) => {
          setFecha(d);
          setFechaAjustada(false);
        }}
        minimumDate={new Date()}
        // Si no pudimos leer las fechas, el calendario queda sin restricción.
        activeDates={errorDates ? undefined : (activeDates ?? undefined)}
      />
    </View>
  );
}

// ─── Location trigger ────────────────────────────────────────────────────────

function LocationTrigger({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleValue={Motion.press.button}
      style={s.locationBtn}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? 'sin seleccionar'}`}
    >
      <View style={s.locationIcon}>
        <MapPin size={Sizes.icon.sm} color={Colors.primary} weight="fill" />
      </View>
      <View style={s.locationInfo}>
        <Text variant="overline" color="muted" uppercase compact>
          {label}
        </Text>
        <Text
          variant="bodyStrong"
          size="sm"
          color={value ? 'foreground' : 'muted'}
          numberOfLines={1}
          compact
          style={s.locationValue}
        >
          {value ?? 'Seleccionar'}
        </Text>
      </View>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  modeToggle: {
    marginBottom: Spacing.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    marginBottom: Spacing.md,
  },
  locationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    minHeight: Sizes.control.xl,
  },
  locationIcon: {
    width: Sizes.iconBox.sm,
    height: Sizes.iconBox.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  locationValue: {
    marginTop: Spacing.xs / 2,
  },
  swap: {
    width: Sizes.iconBox.md - 2,
    height: Sizes.iconBox.md - 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    height: Sizes.control.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
  },
  dateRowDisabled: {
    backgroundColor: Colors.surface,
    opacity: Opacity.dimmed,
  },
  dateText: {
    flex: 1,
    textTransform: 'capitalize',
  },
  dateHelp: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  dateHelpText: {
    flexShrink: 1,
  },
  link: {
    textDecorationLine: 'underline',
  },
  /** Área táctil cómoda alrededor de un enlace de texto pequeño */
  linkBox: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  blockReason: {
    marginTop: Spacing.sm,
  },
});
