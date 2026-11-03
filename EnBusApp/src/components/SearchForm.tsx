import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ArrowRight,
  ArrowsDownUp,
  Bus,
  CalendarBlank,
  MapPin,
  Package,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LocationSelector } from './LocationSelector';
import { CalendarModal } from './CalendarModal';
import { PressableScale } from './PressableScale';
import { Button, Chip, SegmentedControl, Text } from '@/src/components/ui';
import {
  CIUDADES_POPULARES,
  Localidad,
  VENEZUELA_LOCATIONS,
  normalizeCityForDb,
} from '../utils/venezuela';
import { ciudadesRecientes, guardarBusquedaReciente } from '../utils/busquedasRecientes';
import { fechaVE, formatCity } from '../utils/formatters';
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

const DIAS_CORTOS = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'];
const MESES_CORTOS = [
  'ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.',
  'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.',
];

/** "vie. 9 oct." (día local, el mismo que usa el calendario). */
function formatDiaCorto(date: Date): string {
  return `${DIAS_CORTOS[date.getDay()]} ${date.getDate()} ${MESES_CORTOS[date.getMonth()]}`;
}

/** Nombre legible de una ciudad elegida ("Mérida", "Puerto La Cruz"). */
const nombreCiudad = (l: Localidad | null | undefined) => {
  const t = formatCity(l?.ciudad);
  return t === '—' ? (l?.ciudad ?? '') : t;
};

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
  /** Ciudades de las últimas búsquedas, para la sección "Recientes" del selector (APP-15). */
  const [recientes, setRecientes] = useState<Localidad[]>([]);

  const isBoleto = currentMode === 'boletos';

  useEffect(() => {
    let vivo = true;
    // `ciudadesRecientes` nunca lanza: sin almacenamiento devuelve [].
    void ciudadesRecientes().then((lista) => {
      if (vivo) setRecientes(lista);
    });
    return () => {
      vivo = false;
    };
  }, []);

  /** "Cambiar destino" del aviso sin salidas abre el mismo selector del destino. */
  const abrirDestinoRef = useRef<(() => void) | null>(null);
  const registrarAbrirDestino = useCallback((abrir: () => void) => {
    abrirDestinoRef.current = abrir;
  }, []);

  // ── Swap animation ─────────────────────────────────────────────────────────
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const swapStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const swapLocations = () => {
    Haptics.selectionAsync();
    // Con "reducir movimiento" la flecha no gira: solo se intercambian las ciudades.
    if (!reduceMotion) {
      rotation.value = withTiming(rotation.value + 180, {
        duration: Motion.duration.base,
        easing: Motion.easing.out,
      });
    }
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
          .select(
            'fecha_hora_salida, rutas!inner ( ciudad_origen, ciudad_destino ), cooperativas!inner ( estado )'
          )
          .eq('estado', 'PROGRAMADO')
          .gt('asientos_disponibles', 0)
          .eq('rutas.ciudad_origen', normalizeCityForDb(origen.ciudad))
          .eq('rutas.ciudad_destino', normalizeCityForDb(destino.ciudad))
          // Mismas condiciones que la lista de salidas (`boletos/buscar`).
          .eq('rutas.activa', true)
          .gt('rutas.precio_pasaje', 0)
          .eq('cooperativas.estado', 'ACTIVA')
          .gte('fecha_hora_salida', new Date().toISOString())
          .order('fecha_hora_salida', { ascending: true })
          .limit(1000);

        if (error) throw error;
        if (!isMounted) return;

        // Día de la salida en Venezuela, igual que la búsqueda de `boletos/buscar`.
        const unique = Array.from(
          new Set((data ?? []).map((v: { fecha_hora_salida: string }) => fechaVE(v.fecha_hora_salida)))
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
    // Corto: el bloque de arriba ya ofrece otros destinos (M-09).
    if (sinSalidas) return 'No hay salidas en esta ruta';
    return null;
  })();

  const canSubmit = motivoBloqueo === null;

  const handleSubmit = () => {
    if (!origen || !destino || !canSubmit) return;
    if (isBoleto) {
      // Nunca lanza; la lista se refresca para la próxima vez que se abra el selector.
      void guardarBusquedaReciente(origen, destino).then(() =>
        ciudadesRecientes().then(setRecientes)
      );
    }
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

      {/* ── Origen ⇅ Destino (APP-14): apilados, a ancho completo ─────────── */}
      <View style={s.locationStack}>
        <LocationSelector
          label="Origen"
          value={origen}
          onChange={setOrigen}
          excluir={destino}
          excluirAyuda="Ya es tu destino"
          recientes={recientes}
          populares={CIUDADES_POPULARES}
          customTrigger={(open) => (
            <LocationTrigger label="Desde" value={origen?.ciudad} onPress={open} />
          )}
        />

        <LocationSelector
          label="Destino"
          value={destino}
          onChange={setDestino}
          excluir={origen}
          excluirAyuda="Ya es tu origen"
          recientes={recientes}
          populares={CIUDADES_POPULARES}
          customTrigger={(open) => (
            <LocationTrigger
              label="Hacia"
              value={destino?.ciudad}
              onPress={open}
              registrarAbrir={registrarAbrirDestino}
            />
          )}
        />

        {/* 44 × 44 pt, a la derecha y entre ambos campos. */}
        <PressableScale
          onPress={swapLocations}
          scaleValue={0.9}
          duration={Motion.duration.instant}
          style={s.swap}
          accessibilityRole="button"
          accessibilityLabel="Intercambiar origen y destino"
        >
          <Animated.View style={swapStyle}>
            <ArrowsDownUp size={Sizes.icon.md} color={Colors.foreground} weight="bold" />
          </Animated.View>
        </PressableScale>
      </View>

      {/* ── Ruta sin salidas: otros destinos desde el mismo origen (M-09) ─── */}
      {isBoleto && sinSalidas && !loadingDates && origen && destino && !mismaCiudad ? (
        <SinSalidasRuta
          origen={origen}
          destino={destino}
          onElegirDestino={setDestino}
          onCambiarDestino={() => abrirDestinoRef.current?.()}
        />
      ) : null}

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
          {`Próxima salida disponible: ${formatDiaCorto(fecha)}`}
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

// ─── Ruta sin salidas ────────────────────────────────────────────────────────

/** Como mucho, seis destinos alternativos. */
const MAX_ALTERNATIVAS = 6;

/** La entrada del catálogo para una ciudad de la base ("merida" → Mérida, Mérida). */
function localidadDeDb(valor: string): Localidad {
  const clave = normalizeCityForDb(valor);
  return (
    VENEZUELA_LOCATIONS.find((l) => normalizeCityForDb(l.ciudad) === clave) ?? {
      ciudad: formatCity(valor),
      estado: '',
    }
  );
}

type EstadoAlternativas =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'listo'; destinos: Localidad[] };

/**
 * Bloque para una ruta sin salidas (M-09, APP-13): dice que no hay y ofrece
 * hasta seis destinos que sí tienen salidas desde el mismo origen. Tocar uno lo
 * fija como destino; "Cambiar destino" abre el selector.
 *
 * Lo usan el buscador de Inicio y el paso 1 de `boletos/buscar`.
 */
export function SinSalidasRuta({
  origen,
  destino,
  onElegirDestino,
  onCambiarDestino,
}: {
  origen: Localidad;
  destino: Localidad;
  onElegirDestino: (destino: Localidad) => void;
  onCambiarDestino?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoAlternativas>({ tipo: 'cargando' });
  const claveOrigen = normalizeCityForDb(origen.ciudad);
  const claveDestino = normalizeCityForDb(destino.ciudad);

  useEffect(() => {
    let vivo = true;
    setEstado({ tipo: 'cargando' });
    (async () => {
      try {
        const { data, error } = await supabase
          .from('viajes')
          .select('rutas!inner ( ciudad_origen, ciudad_destino ), cooperativas!inner ( estado )')
          .eq('estado', 'PROGRAMADO')
          .gt('asientos_disponibles', 0)
          .eq('rutas.ciudad_origen', claveOrigen)
          .eq('rutas.activa', true)
          .gt('rutas.precio_pasaje', 0)
          .eq('cooperativas.estado', 'ACTIVA')
          .gte('fecha_hora_salida', new Date().toISOString())
          .order('fecha_hora_salida', { ascending: true })
          .limit(200);
        if (error) throw error;
        if (!vivo) return;
        const vistos = new Set<string>([claveDestino]);
        const destinos: Localidad[] = [];
        for (const fila of (data ?? []) as { rutas: unknown }[]) {
          const ruta = (Array.isArray(fila.rutas) ? fila.rutas[0] : fila.rutas) as
            | { ciudad_destino?: string | null }
            | null
            | undefined;
          const valor = ruta?.ciudad_destino;
          if (!valor) continue;
          const clave = normalizeCityForDb(valor);
          if (!clave || vistos.has(clave) || clave === claveOrigen) continue;
          vistos.add(clave);
          destinos.push(localidadDeDb(valor));
          if (destinos.length >= MAX_ALTERNATIVAS) break;
        }
        setEstado({ tipo: 'listo', destinos });
      } catch {
        // Sin la lista se muestra igual el aviso y el enlace para cambiar el destino.
        if (vivo) setEstado({ tipo: 'error' });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [claveOrigen, claveDestino]);

  const deOrigen = nombreCiudad(origen);
  const aDestino = nombreCiudad(destino);
  const sinNinguna = estado.tipo === 'listo' && estado.destinos.length === 0;

  return (
    <View style={s.sinSalidas} accessibilityLiveRegion="polite">
      {sinNinguna ? (
        <Text variant="secondary" color="foreground">
          {`Por ahora no hay salidas desde ${deOrigen}. Prueba con otra ciudad de origen.`}
        </Text>
      ) : (
        <>
          <Text variant="bodyStrong" size="sm">
            {`No hay salidas programadas de ${deOrigen} a ${aDestino}.`}
          </Text>
          {estado.tipo === 'cargando' ? (
            <Text variant="caption" color="muted">
              Buscando otros destinos…
            </Text>
          ) : null}
          {estado.tipo === 'listo' ? (
            <>
              <Text variant="caption" color="muted">
                {`Destinos con salidas desde ${deOrigen}:`}
              </Text>
              <View style={s.alternativas}>
                {estado.destinos.map((l) => (
                  <Chip
                    key={normalizeCityForDb(l.ciudad)}
                    label={nombreCiudad(l)}
                    onPress={() => onElegirDestino(l)}
                    accessibilityLabel={`Viajar a ${nombreCiudad(l)}`}
                  />
                ))}
              </View>
            </>
          ) : null}
          {onCambiarDestino ? (
            <PressableScale
              onPress={onCambiarDestino}
              haptic
              hapticType="selection"
              style={[s.linkBox, s.cambiarDestino]}
              accessibilityRole="button"
              accessibilityLabel="Cambiar destino"
            >
              <Text variant="caption" weight="bold" color="foreground" style={s.link}>
                Cambiar destino
              </Text>
            </PressableScale>
          ) : null}
        </>
      )}
    </View>
  );
}

// ─── Location trigger ────────────────────────────────────────────────────────

function LocationTrigger({
  label,
  value,
  onPress,
  registrarAbrir,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  /** Recibe la función que abre el selector (para abrirlo desde otro lugar). */
  registrarAbrir?: (abrir: () => void) => void;
}) {
  useEffect(() => {
    registrarAbrir?.(onPress);
  }, [registrarAbrir, onPress]);

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
          numberOfLines={2}
          compact
          style={s.locationValue}
        >
          {value ?? 'Seleccionar'}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Botón de intercambio: 44 × 44 pt (APP-14). */
const SWAP_SIZE = Sizes.control.md;

const s = StyleSheet.create({
  modeToggle: {
    marginBottom: Spacing.md,
  },
  locationStack: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    justifyContent: 'center',
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    paddingLeft: Spacing.lg,
    // Deja libre el botón de intercambio, que flota a la derecha.
    paddingRight: SWAP_SIZE + Spacing.lg + Spacing.sm,
    paddingVertical: Spacing.sm,
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
    position: 'absolute',
    right: Spacing.lg,
    top: '50%',
    marginTop: -SWAP_SIZE / 2,
    width: SWAP_SIZE,
    height: SWAP_SIZE,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinSalidas: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
  },
  cambiarDestino: {
    alignSelf: 'flex-start',
    marginLeft: -Spacing.xs,
  },
  alternativas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
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
