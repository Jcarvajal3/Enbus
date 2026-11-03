import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ReservaEstado, SeatSelector, TasaCambiadaSheet } from '@/src/components/SeatSelector';
import { PasajerosForm } from '@/src/components/PasajerosForm';
import { CompletarPerfilSheet } from '@/src/components/CompletarPerfilSheet';
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
  ErrorState,
  FloatingBar,
  InfoRow,
  LoadingState,
  Monto,
  RouteSummary,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useToast } from '@/src/components/Toast';
import { Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
import { dateFull, formatCity, formatDate, toDateKey } from '@/src/utils/formatters';
import { esErrorEB, humanizeError } from '@/src/utils/errores';
import { formatMoney, tasaRefDe } from '@/src/utils/dinero';
import { useWizardBack } from '@/src/hooks/useWizardBack';
import { useTasaBCV } from '@/src/hooks/useTasaBCV';
import { usePerfil } from '@/src/hooks/usePerfil';
import {
  asientosDelError,
  formatHora,
  mensajeAsientosTomados,
  unirAsientos,
  useCheckoutBoletos,
  useSegundosRestantes,
} from '@/src/hooks/useCheckoutBoletos';
import type { PasajeroAsiento, ResumenCompra } from '@/src/types';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-VE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Fecha que llega por parámetro: 'YYYY-MM-DD' (día local, p. ej. desde
 * `viajes/[id]`) o un ISO completo (desde el buscador de Inicio).
 */
function fechaDeParametro(valor?: string): Date {
  if (valor) {
    const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    if (dia) return new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3]));
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
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

/** Asistente de 4 pasos (#25): Salida · Asientos · Pasajeros · Pago. */
const STEP_TITLES = ['Elige tu salida', 'Elige tus asientos', '¿Quién viaja?', 'Registra tu pago'];
const PASOS_RESUMEN = 'Salida · Asientos · Pasajeros · Pago';

type Paso = 1 | 2 | 3 | 4;

export default function BuscarBoletoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    origen?: string;
    destino?: string;
    fecha?: string;
    /** Salida a preseleccionar (llega desde `viajes/[id]`) */
    viajeId?: string;
  }>();
  const toast = useToast();
  const mostrarToast = toast.show;
  const { tasaRef } = useTasaBCV();
  const { perfil, completo: perfilCompleto, loading: perfilCargando } = usePerfil();

  const [step, setStep] = useState<Paso>(1);

  const [origen, setOrigen] = useState<Localidad | null>(
    params.origen ? { ciudad: params.origen, estado: '' } : null
  );
  const [destino, setDestino] = useState<Localidad | null>(
    params.destino ? { ciudad: params.destino, estado: '' } : null
  );
  const [fecha, setFecha] = useState<Date>(() => fechaDeParametro(params.fecha));

  const [showCalendar, setShowCalendar] = useState(false);
  const [activeDates, setActiveDates] = useState<string[] | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  const [errorFechas, setErrorFechas] = useState(false);
  const [reintentoFechas, setReintentoFechas] = useState(0);

  const [viajes, setViajes] = useState<ViajeResumen[]>([]);
  const [loadingViajes, setLoadingViajes] = useState(false);
  const [errorViajes, setErrorViajes] = useState<string | null>(null);
  const [reintentoViajes, setReintentoViajes] = useState(0);
  const [seleccionado, setSeleccionado] = useState<ViajeResumen | null>(null);
  /** Salida pedida por parámetro: se elige en cuanto aparece en la lista. */
  const preseleccionRef = useRef<string | null>(
    typeof params.viajeId === 'string' && params.viajeId ? params.viajeId : null
  );

  // ── Asientos ocupados (fn_asientos_ocupados: la RLS oculta los de otros) ──
  const [asientosOcupados, setAsientosOcupados] = useState<string[]>([]);
  /** Viaje al que pertenecen `asientosOcupados` (`null` = aún no se leyeron). */
  const [ocupadosDe, setOcupadosDe] = useState<string | null>(null);
  const [errorOcupados, setErrorOcupados] = useState<string | null>(null);
  // Sube cuando hay que volver a leer los asientos ocupados (choque, realtime…).
  const [asientosVersion, setAsientosVersion] = useState(0);
  // Asientos de esta compra que otro pasajero tomó al vencer la reserva.
  const [asientosPerdidos, setAsientosPerdidos] = useState<string[]>([]);

  // ── Pasajeros ────────────────────────────────────────────────────────────
  const [pasajerosGuardados, setPasajerosGuardados] = useState<PasajeroAsiento[] | null>(null);
  const [asientosSinDatos, setAsientosSinDatos] = useState<string[]>([]);
  const [errorPasajeros, setErrorPasajeros] = useState<string | null>(null);

  // ── Datos del comprador antes de apartar (#24) ───────────────────────────
  const [pedirDatos, setPedirDatos] = useState(false);
  const [asientosPendientes, setAsientosPendientes] = useState<string[] | null>(null);

  const [filtersVisible, setFiltersVisible] = useState(false);
  const [selectedCoop, setSelectedCoop] = useState<string | null>(null);
  const [sortType, setSortType] = useState<SortType>('hora_asc');

  // ── Compra: reservar, asignar pasajeros, registrar el pago, liberar al salir ──
  const checkout = useCheckoutBoletos({
    viajeId: seleccionado?.id,
    onExito: (r) => irACompra(r, 'pago'),
    onAsientosOcupados: (tomados) => manejarAsientosTomados(tomados, true),
    onPagoYaRegistrado: (mensaje, reserva) => {
      toast.show('info', mensaje);
      irACompra(reserva, 'pago');
    },
    onDatosPasajero: (asientos, mensaje) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setAsientosSinDatos(asientos);
      setErrorPasajeros(mensaje);
      setStep(3);
    },
  });
  const { estaEnCurso, liberar } = checkout;

  // Atrás deshabilitado mientras corre una RPC; volver a la lista de salidas
  // suelta los asientos (la compra es de un solo viaje). Liberar una compra sin
  // asientos no llama al servidor.
  const irAPaso = useCallback(
    (paso: Paso) => {
      if (estaEnCurso()) return;
      if (paso === 1) {
        void liberar().finally(() => setAsientosVersion((v) => v + 1));
        // Otra salida, otra compra: los pasajeros guardados eran de esos asientos.
        setPasajerosGuardados(null);
        setAsientosSinDatos([]);
        setErrorPasajeros(null);
      }
      if (paso === 2) setAsientosVersion((v) => v + 1);
      setStep(paso);
    },
    [estaEnCurso, liberar]
  );

  // Atrás (header, botón de Android o gesto) retrocede un paso; en el paso 1
  // pide confirmación si ya se eligió una salida. Mientras corre una RPC
  // (apartar, guardar pasajeros, registrar el pago) no hace nada.
  const { handleBack, allowLeave } = useWizardBack({
    step,
    setStep: irAPaso,
    isDirty: seleccionado !== null,
    bloqueado: checkout.enCurso,
  });

  const segundosReserva = useSegundosRestantes(
    checkout.reserva?.reserva_expira_at,
    checkout.offsetServidor
  );
  const reservaVencida = (step === 3 || step === 4) && segundosReserva === 0;

  // ── Fechas con salidas ───────────────────────────────────────────────────
  useEffect(() => {
    if (!origen || !destino) {
      setActiveDates(null);
      setErrorFechas(false);
      return;
    }

    let isMounted = true;
    const fetchDates = async () => {
      try {
        setLoadingDates(true);
        setErrorFechas(false);
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
                toDateKey(new Date(v.fecha_hora_salida))
              )
            )
          ).sort()
        );
      } catch (err) {
        if (__DEV__) console.warn('[buscar] Error cargando fechas:', err);
        // Sin fechas el calendario no se restringe: se puede buscar igual (#19).
        if (isMounted) {
          setActiveDates(null);
          setErrorFechas(true);
        }
      } finally {
        if (isMounted) setLoadingDates(false);
      }
    };

    fetchDates();
    return () => {
      isMounted = false;
    };
  }, [origen, destino, reintentoFechas]);

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
        setErrorViajes(null);
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

        const lista = (data ?? []).map((viaje: any): ViajeResumen => {
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
            horaSalida: formatHora(viaje.fecha_hora_salida),
            duracion: `${Math.floor(minutos / 60)}h ${minutos % 60}m`,
            precio: ruta?.precio_pasaje ?? 0,
            asientosDisponibles: viaje.asientos_disponibles,
            asientosTotales: viaje.asientos_totales,
            ciudadOrigen: ruta?.ciudad_origen,
            ciudadDestino: ruta?.ciudad_destino,
          };
        });
        setViajes(lista);

        // La salida elegida ya no está en la lista (otro día, otra ruta o agotada).
        setSeleccionado((prev) => (prev && lista.some((v) => v.id === prev.id) ? prev : null));

        const objetivo = preseleccionRef.current;
        if (objetivo) {
          preseleccionRef.current = null;
          const viaje = lista.find((v) => v.id === objetivo);
          if (viaje) setSeleccionado(viaje);
          else mostrarToast('info', 'Esa salida ya no tiene asientos a la venta. Elige otra.');
        }
      } catch (err) {
        if (__DEV__) console.warn('[buscar] Error cargando viajes:', err);
        if (isMounted) setErrorViajes(humanizeError(err, 'carga'));
      } finally {
        if (isMounted) setLoadingViajes(false);
      }
    };

    fetchViajes();
    return () => {
      isMounted = false;
    };
  }, [origen, destino, fecha, reintentoViajes, mostrarToast]);

  // ── Asientos ocupados del viaje elegido ──────────────────────────────────
  const viajeElegidoId = seleccionado?.id ?? null;

  // Al cambiar de salida, los ocupados de la anterior no sirven (M-17).
  useEffect(() => {
    setAsientosOcupados([]);
    setOcupadosDe(null);
    setErrorOcupados(null);
  }, [viajeElegidoId]);

  const ocupadosDeRef = useRef<string | null>(null);
  ocupadosDeRef.current = ocupadosDe;

  useEffect(() => {
    if (!viajeElegidoId) return;
    let isMounted = true;

    const fallar = (err: unknown) => {
      if (!isMounted) return;
      if (__DEV__) console.warn('[buscar] Error cargando asientos ocupados:', err);
      // Si ya había una lista de este viaje (recarga por realtime), se conserva:
      // el servidor igual rechaza un asiento tomado al apartar.
      if (ocupadosDeRef.current !== viajeElegidoId) setErrorOcupados(humanizeError(err, 'carga'));
    };

    supabase.rpc('fn_asientos_ocupados', { p_viaje_id: viajeElegidoId }).then(({ data, error }) => {
      if (error) return fallar(error);
      if (!isMounted) return;
      setAsientosOcupados(Array.isArray(data) ? data.map((a) => String(a)) : []);
      setOcupadosDe(viajeElegidoId);
      setErrorOcupados(null);
    }, fallar);

    return () => {
      isMounted = false;
    };
  }, [viajeElegidoId, asientosVersion]);

  // Mientras se eligen asientos, cada cambio de `asientos_disponibles` del viaje
  // (otro pasajero apartó o liberó) vuelve a leer los ocupados.
  useEffect(() => {
    if (!viajeElegidoId || step !== 2) return;
    const channel = supabase
      .channel(`rt:viaje:${viajeElegidoId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'viajes', filter: `id=eq.${viajeElegidoId}` },
        () => setAsientosVersion((v) => v + 1)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [viajeElegidoId, step]);

  const cargandoOcupados = !!viajeElegidoId && ocupadosDe !== viajeElegidoId && !errorOcupados;

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
  /**
   * Éxito (pago registrado o "pagar en taquilla"): a "Tu compra", con todos los
   * boletos de la compra (M-16, APP-34).
   */
  function irACompra(r: ResumenCompra | null, recien: 'pago' | 'reserva') {
    checkout.conservar();
    allowLeave();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const compraId = r?.compra_id ?? checkout.compraId;
    router.replace({ pathname: '/boletos/compra/[id]', params: { id: compraId, recien } });
  }

  /** Otro pasajero tomó asientos: marcarlos ocupados y volver a elegir. */
  function manejarAsientosTomados(tomados: string[], desdePago = false) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // En el mapa, `SeatSelector` avisa "El asiento 14 acaba de ser tomado…".
    if (desdePago) toast.show('error', mensajeAsientosTomados(tomados));
    setAsientosOcupados((prev) => Array.from(new Set([...prev, ...tomados])));
    setAsientosPerdidos((prev) => Array.from(new Set([...prev, ...tomados])));
    setAsientosVersion((v) => v + 1);
    if (desdePago) setStep(2);
  }

  /** Aparta los asientos y pasa al paso "Pasajeros". */
  const apartar = async (asientos: string[]) => {
    try {
      await checkout.reservar(asientos);
      setAsientosPerdidos([]);
      setAsientosSinDatos([]);
      setErrorPasajeros(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(3);
    } catch (err) {
      if (esErrorEB(err, 'EB_ASIENTO_OCUPADO')) {
        manejarAsientosTomados(asientosDelError(err));
        return;
      }
      // El pago de esta compra ya se registró (p. ej. se perdió la respuesta): a sus boletos.
      if (esErrorEB(err, 'EB_PAGO_YA_REGISTRADO')) {
        toast.show('info', humanizeError(err));
        irACompra(checkout.reserva, 'pago');
        return;
      }
      if (__DEV__) console.warn('[buscar] Error apartando asientos:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', humanizeError(err, 'asiento'));
    }
  };

  /** "Apartar asientos": antes, la cédula y el teléfono del comprador (#24). */
  const confirmarAsientos = async (asientos: string[]) => {
    if (!perfilCargando && !perfilCompleto) {
      setAsientosPendientes(asientos);
      setPedirDatos(true);
      return;
    }
    await apartar(asientos);
  };

  /** Paso "Pasajeros": `fn_asignar_pasajeros` y al pago. */
  const guardarPasajeros = async (pasajeros: PasajeroAsiento[]) => {
    setErrorPasajeros(null);
    try {
      const r = await checkout.asignarPasajeros(pasajeros);
      setPasajerosGuardados(pasajeros);
      const faltan = Array.isArray(r.asientos_sin_datos) ? r.asientos_sin_datos : [];
      if (faltan.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setAsientosSinDatos(faltan);
        setErrorPasajeros(
          `Falta el nombre o la cédula del pasajero del asiento ${unirAsientos(faltan)}.`
        );
        return;
      }
      setAsientosSinDatos([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(4);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (esErrorEB(err, 'EB_DATOS_PASAJERO')) {
        setAsientosSinDatos(asientosDelError(err));
        setErrorPasajeros(humanizeError(err));
        return;
      }
      // La reserva venció o cambió mientras se escribían los datos.
      if (esErrorEB(err, 'EB_ESTADO_CAMBIO')) {
        toast.show('error', humanizeError(err));
        volverAElegirAsientos();
        return;
      }
      if (__DEV__) console.warn('[buscar] Error guardando pasajeros:', err);
      setErrorPasajeros(`No pudimos guardar los datos; siguen aquí. ${humanizeError(err)}`);
    }
  };

  /** La reserva venció en pantalla: soltar lo que quede y volver al mapa. */
  const volverAElegirAsientos = () => {
    // Releer los ocupados cuando el servidor ya soltó los asientos.
    void liberar().finally(() => setAsientosVersion((v) => v + 1));
    setAsientosPerdidos([]);
    setStep(2);
  };

  const confirmarTasaCambiada = async () => {
    try {
      await checkout.confirmarTasaCambiada();
    } catch (err) {
      if (__DEV__) console.warn('[buscar] Error registrando pago:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(
        'error',
        `No pudimos registrar tu pago; tus datos siguen aquí. ${humanizeError(err, 'pago')}`
      );
    }
  };

  // Los asientos de esta compra no cuentan como ocupados en el mapa.
  const misAsientos = checkout.asientosApartados.filter((a) => !asientosPerdidos.includes(a));
  const ocupadosAjenos = asientosOcupados.filter((a) => !misAsientos.includes(a));
  const cotizacion = checkout.cotizacion;

  /** Lo último que se guardó, o lo que el servidor tiene en cada boleto. */
  const reservaBoletos = checkout.reserva?.boletos;
  const pasajerosIniciales = useMemo<PasajeroAsiento[]>(
    () =>
      pasajerosGuardados ??
      (reservaBoletos ?? [])
        .filter((b) => b.estado === 'RESERVADO')
        .map((b) => ({
          asiento: b.asiento,
          nombre: b.pasajero_nombre ?? '',
          cedula: b.pasajero_cedula ?? '',
          telefono: b.pasajero_telefono ?? null,
        })),
    [pasajerosGuardados, reservaBoletos]
  );

  const calendarEnabled = !!origen && !!destino && !loadingDates;
  const nBoletos = checkout.asientosApartados.length;

  return (
    <Screen>
      <ScreenHeader
        variant="steps"
        title={STEP_TITLES[step - 1]}
        subtitle={PASOS_RESUMEN}
        step={step}
        totalSteps={4}
        onBack={handleBack}
        backLabel={step > 1 ? 'Volver al paso anterior' : 'Volver'}
      />

      <ScrollView
        contentContainerStyle={scrollContent({ floatingAction: step === 1, top: Spacing.sm })}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Paso 1: elegir la salida ─────────────────────────────────── */}
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

              {errorFechas ? (
                <View style={s.fechasAviso} accessibilityRole="alert">
                  <Text variant="caption" color="muted" style={s.fechasAvisoTexto}>
                    No pudimos verificar las fechas con salidas. Puedes buscar igual.
                  </Text>
                  <PressableScale
                    onPress={() => setReintentoFechas((n) => n + 1)}
                    haptic
                    hapticType="selection"
                    style={s.fechasReintentar}
                    accessibilityRole="button"
                    accessibilityLabel="Reintentar la carga de fechas con salidas"
                  >
                    <Text variant="caption" weight="bold" color="accent" style={s.enlace}>
                      Reintentar
                    </Text>
                  </PressableScale>
                </View>
              ) : null}
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
              ) : errorViajes ? (
                <ErrorState
                  title="No pudimos cargar las salidas"
                  description={errorViajes}
                  onRetry={() => setReintentoViajes((n) => n + 1)}
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
                          <Monto usd={viaje.precio} tasa={tasaRef} size="sm" align="right" />
                          <Text variant="caption" size="xs" color="muted" compact>
                            {`${viaje.asientosDisponibles} libres`}
                          </Text>
                        </View>
                      }
                      accessibilityLabel={`${viaje.cooperativa}, sale ${viaje.horaSalida}, ${
                        formatMoney({ usd: viaje.precio, tasa: tasaRef }).accesible
                      }, ${viaje.asientosDisponibles} asientos libres`}
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
              key={seleccionado.id}
              asientosTotales={seleccionado.asientosTotales ?? 0}
              asientosOcupados={ocupadosAjenos}
              precioUnitario={seleccionado.precio}
              seleccionInicial={misAsientos}
              confirmando={checkout.enCurso}
              cargandoOcupados={cargandoOcupados}
              errorOcupados={errorOcupados}
              onReintentarOcupados={() => {
                setErrorOcupados(null);
                setAsientosVersion((v) => v + 1);
              }}
              onConfirm={confirmarAsientos}
            />
          </>
        )}

        {/* ─── Paso 3: pasajeros ────────────────────────────────────────── */}
        {step === 3 && seleccionado && (
          <>
            <ReservaEstado
              asientos={checkout.asientosApartados}
              segundos={segundosReserva}
              onElegirDeNuevo={volverAElegirAsientos}
            />
            {!reservaVencida ? (
              <PasajerosForm
                asientos={checkout.asientosApartados}
                perfil={perfil}
                perfilCargando={perfilCargando}
                inicial={pasajerosIniciales}
                asientosConError={asientosSinDatos}
                mensajeError={errorPasajeros}
                guardando={checkout.enCurso}
                onSubmit={guardarPasajeros}
              />
            ) : null}
          </>
        )}

        {/* ─── Paso 4: pago ─────────────────────────────────────────────── */}
        {step === 4 && seleccionado && (
          <>
            <ReservaEstado
              asientos={checkout.asientosApartados}
              segundos={segundosReserva}
              onElegirDeNuevo={volverAElegirAsientos}
            />
            <TripCard
              viaje={seleccionado}
              extras={
                cotizacion ? (
                  <>
                    <Divider spacing={Spacing.lg} />
                    <View style={s.summaryRow}>
                      <InfoRow label="Asientos" value={unirAsientos(checkout.asientosApartados)} />
                      <View style={s.totalBlock}>
                        <Text variant="overline" color="muted" uppercase align="right">
                          Total a pagar
                        </Text>
                        <Monto
                          usd={cotizacion.totalUsd}
                          bs={cotizacion.totalBs}
                          tasa={tasaRefDe(cotizacion.tasa, cotizacion.tasaFecha)}
                          align="right"
                        />
                      </View>
                    </View>
                  </>
                ) : null
              }
            />
            {!reservaVencida && cotizacion ? (
              <PaymentFlow
                cooperativaId={seleccionado.cooperativa_id}
                concepto={`${nBoletos === 1 ? '1 boleto' : `${nBoletos} boletos`} · ${formatCity(
                  seleccionado.ciudadOrigen
                )} → ${formatCity(seleccionado.ciudadDestino)}`}
                tipoRecurso="boleto"
                cotizacion={cotizacion}
                onRegistrar={checkout.onRegistrar}
                onEfectivo={() => irACompra(checkout.reserva, 'reserva')}
                bloqueado={checkout.enCurso}
              />
            ) : null}
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
              irAPaso(2);
            }}
          >
            {seleccionado ? `Continuar con ${seleccionado.cooperativa}` : 'Elige una salida'}
          </Button>
        </FloatingBar>
      )}

      <CompletarPerfilSheet
        visible={pedirDatos}
        motivo="compra"
        onClose={() => {
          setPedirDatos(false);
          setAsientosPendientes(null);
        }}
        onCompletado={() => {
          setPedirDatos(false);
          const pendientes = asientosPendientes;
          setAsientosPendientes(null);
          if (pendientes && pendientes.length > 0) void apartar(pendientes);
        }}
      />

      <TasaCambiadaSheet
        cambio={checkout.tasaCambiada}
        enviando={checkout.enCurso}
        onConfirmar={confirmarTasaCambiada}
        onRevisar={checkout.descartarTasaCambiada}
      />

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
        <View style={s.totalBlock}>
          <Text variant="overline" color="muted" uppercase align="right">
            Por asiento
          </Text>
          <Monto usd={viaje.precio} size="sm" align="right" />
        </View>
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
  fechasAviso: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  fechasAvisoTexto: {
    flexShrink: 1,
  },
  /** Área táctil cómoda alrededor del enlace de texto */
  fechasReintentar: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  enlace: {
    textDecorationLine: 'underline',
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
  totalBlock: {
    alignItems: 'flex-end',
    gap: Spacing.xs / 2,
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
