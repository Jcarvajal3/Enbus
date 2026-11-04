/**
 * SearchForm — el buscador de Inicio: "Viajar | Enviar encomienda", la ruta
 * (`RouteField`, el mismo del paso 1 de la compra y del envío), la fecha y el
 * botón del dominio ("Buscar viaje" con `Ticket`, "Enviar encomienda" con
 * `Package`, SY-16).
 *
 * Un motivo se dice una vez (AN-26, AU-14): sin ruta o mientras se buscan las
 * fechas, lo dice el campo de fecha; con una ruta sin salidas, el campo de
 * fecha desaparece y queda solo el bloque con otros destinos.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CalendarBlank, Package, Ticket } from 'phosphor-react-native';
import { RouteField } from './RouteField';
import { CalendarModal } from './CalendarModal';
import { PressableScale } from './PressableScale';
import { Button, Chip, SegmentedControl, Text, TextLink } from '@/src/components/ui';
import {
  CIUDADES_POPULARES,
  Localidad,
  VENEZUELA_LOCATIONS,
  normalizeCityForDb,
} from '../utils/venezuela';
import { ciudadesRecientes, guardarBusquedaReciente } from '../utils/busquedasRecientes';
import { fechaVE, formatCity, formatDiaVE, toDateKey } from '../utils/formatters';
import { supabase } from '../utils/supabase';
import { Colors, Motion, Radius, Sizes, Spacing } from '@/src/theme';

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

/** Nombre legible de una ciudad elegida ("Mérida", "Puerto La Cruz"). */
const nombreCiudad = (l: Localidad | null | undefined) => {
  const t = formatCity(l?.ciudad);
  return t === '—' ? (l?.ciudad ?? '') : t;
};

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

  const intercambiar = () => {
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

  /** El campo de fecha dice qué falta mientras no hay fecha que elegir. */
  const fechaTexto = !hasRoute
    ? 'Elige origen y destino'
    : loadingDates
      ? 'Buscando fechas…'
      : formatDiaVE(toDateKey(fecha));

  /** Por qué el botón está deshabilitado. `null` = se puede continuar. */
  const motivoBloqueo = (() => {
    if (!origen && !destino) return 'Elige origen y destino';
    if (!origen) return 'Elige el origen';
    if (!destino) return 'Elige el destino';
    if (mismaCiudad) return 'El origen y el destino deben ser ciudades distintas';
    if (!isBoleto) return null;
    if (loadingDates) return 'Buscando fechas con salidas';
    if (sinSalidas) return 'No hay salidas en esta ruta';
    return null;
  })();

  const canSubmit = motivoBloqueo === null;
  /** En boletos el motivo ya lo dicen el campo de fecha o el bloque sin salidas. */
  const motivoVisible = isBoleto ? (mismaCiudad ? motivoBloqueo : null) : motivoBloqueo;

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

  const verSinSalidas = isBoleto && sinSalidas && !loadingDates && !!origen && !!destino && !mismaCiudad;

  return (
    <View style={s.form}>
      {showModeToggle && (
        <SegmentedControl<SearchMode>
          value={currentMode}
          onChange={setCurrentMode}
          options={[
            { value: 'boletos', label: 'Viajar', icon: Ticket },
            { value: 'encomiendas', label: 'Enviar encomienda', icon: Package },
          ]}
        />
      )}

      <RouteField
        origen={origen}
        destino={destino}
        onOrigen={setOrigen}
        onDestino={setDestino}
        onIntercambiar={intercambiar}
        recientes={recientes}
        populares={CIUDADES_POPULARES}
        registrarAbrirDestino={registrarAbrirDestino}
      />

      {/* ── Ruta sin salidas: otros destinos desde el mismo origen (M-09) ─── */}
      {verSinSalidas && origen && destino ? (
        <SinSalidasRuta
          origen={origen}
          destino={destino}
          onElegirDestino={setDestino}
          onCambiarDestino={() => abrirDestinoRef.current?.()}
        />
      ) : null}

      {/* ── Fecha (solo boletos y con salidas posibles) ──────────────────── */}
      {isBoleto && !verSinSalidas ? (
        <View>
          <CampoFecha
            valor={fechaTexto}
            pendiente={!calendarEnabled}
            onPress={() => setShowDatePicker(true)}
          />
          {errorDates && hasRoute ? (
            <View style={s.ayudaFecha} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text variant="caption" color="warningText" style={s.ayudaTexto}>
                No pudimos ver qué días tienen salidas. Puedes buscar igual.
              </Text>
              <TextLink onPress={() => setReintentoDates((n) => n + 1)} accessibilityLabel="Reintentar la carga de fechas">
                Reintentar
              </TextLink>
            </View>
          ) : fechaAjustada && !loadingDates ? (
            <Text variant="caption" color="muted" style={s.ayudaFecha}>
              Es la próxima fecha con salidas.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View>
        <Button
          size="lg"
          fullWidth
          icon={isBoleto ? Ticket : Package}
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

        {/* Un botón deshabilitado dice qué falta, una sola vez (APP-12, AN-26). */}
        {motivoVisible ? (
          <Text variant="caption" color="muted" align="center" style={s.motivo}>
            {motivoVisible}
          </Text>
        ) : null}
      </View>

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

// ─── Campo de fecha ──────────────────────────────────────────────────────────

/**
 * La fecha del viaje, con la misma forma que los bloques de `RouteField` pero en
 * un pozo neutro: la ruta manda ("Fecha" + "mar. 3 nov."). Lo usan Inicio y el
 * paso 1 de la compra.
 * `pendiente`: aún no se puede elegir (falta la ruta o se buscan las fechas);
 * el valor dice por qué.
 */
export function CampoFecha({
  valor,
  pendiente = false,
  onPress,
}: {
  valor: string;
  pendiente?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={pendiente}
      dimWhenDisabled={false}
      haptic
      hapticType="selection"
      scaleValue={Motion.press.button}
      style={s.campoFecha}
      accessibilityRole="button"
      accessibilityLabel={`Fecha: ${valor}`}
      accessibilityState={{ disabled: pendiente }}
    >
      <View style={s.campoIcono}>
        <CalendarBlank
          size={Sizes.icon.lg}
          color={pendiente ? Colors.placeholder : Colors.accentStrong}
          weight="duotone"
        />
      </View>
      <View style={s.campoTextos}>
        <Text variant="caption" color="muted" compact>
          Fecha
        </Text>
        <Text
          variant={pendiente ? 'body' : 'subheading'}
          color={pendiente ? Colors.placeholder : 'foreground'}
          numberOfLines={1}
        >
          {valor}
        </Text>
      </View>
    </PressableScale>
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
 * Lo usan el buscador de Inicio y el paso 1 de `boletos/buscar` (pantallas
 * blanco con borde fino: se lee igual sobre el fondo y dentro de una tarjeta).
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
        <Text variant="secondary">
          {`Por ahora no hay salidas desde ${deOrigen}. Prueba con otra ciudad de origen.`}
        </Text>
      ) : (
        <>
          <Text variant="bodyStrong">{`No hay salidas de ${deOrigen} a ${aDestino}`}</Text>
          {estado.tipo === 'cargando' ? (
            <Text variant="caption" color="muted">
              Buscando otros destinos…
            </Text>
          ) : null}
          {estado.tipo === 'listo' ? (
            <>
              <Text variant="caption" color="muted">
                {`Con salidas desde ${deOrigen}:`}
              </Text>
              <View style={s.alternativas}>
                {estado.destinos.map((l) => (
                  <Chip
                    key={normalizeCityForDb(l.ciudad)}
                    label={nombreCiudad(l)}
                    sobre="surface"
                    onPress={() => onElegirDestino(l)}
                    accessibilityLabel={`Viajar a ${nombreCiudad(l)}`}
                  />
                ))}
              </View>
            </>
          ) : null}
          {onCambiarDestino ? (
            <View style={s.cambiarDestino}>
              <TextLink onPress={onCambiarDestino}>Cambiar destino</TextLink>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  form: {
    gap: Spacing.md,
  },
  campoFecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Sizes.control.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  campoIcono: {
    width: Sizes.icon.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  campoTextos: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  ayudaFecha: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  ayudaTexto: {
    flexShrink: 1,
  },
  motivo: {
    marginTop: Spacing.sm,
  },
  sinSalidas: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    backgroundColor: Colors.warningLight,
  },
  cambiarDestino: {
    alignSelf: 'flex-start',
  },
  alternativas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
