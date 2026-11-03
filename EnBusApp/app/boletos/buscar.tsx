/**
 * boletos/buscar — el asistente de compra: Salida · Asientos · Pasajeros · Pago.
 *
 * Cada paso: tocar una opción la elige y el botón de la `FloatingBar` avanza,
 * con una línea de resumen encima ("Asiento 6 · Bs 17.822,11", §2.1 regla 6).
 * La forma de pago es un subpaso del paso 4: la ← lo cierra primero (AN-12).
 * Al terminar, "Tu compra" se abre sobre Mis boletos (AN-05).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarBlank, MapPin, SlidersHorizontal, Star } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { RouteField } from '@/src/components/RouteField';
import { CalendarModal } from '@/src/components/CalendarModal';
import { SeatSelector } from '@/src/components/SeatSelector';
import { PasajerosForm, type PasajerosFormHandle } from '@/src/components/PasajerosForm';
import { CampoFecha, SinSalidasRuta } from '@/src/components/SearchForm';
import { CompletarPerfilSheet } from '@/src/components/CompletarPerfilSheet';
import {
  PaymentFlow,
  TasaCambiadaSheet,
  tituloMetodo,
  type AccionPago,
  type MetodoElegido,
} from '@/src/components/PaymentFlow';
import { ReservaTimer, ReservaVencida } from '@/src/components/ReservaTimer';
import { CardSkeleton } from '@/src/components/CardSkeleton';
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
  Monto,
  RouteSummary,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  TextLink,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useToast } from '@/src/components/Toast';
import { CIUDADES_POPULARES, Localidad, normalizeCityForDb } from '@/src/utils/venezuela';
import { ciudadesRecientes } from '@/src/utils/busquedasRecientes';
import {
  fechaVE,
  formatCity,
  formatDiaVE,
  formatDuracion,
  formatHoraVE,
  toDateKey,
} from '@/src/utils/formatters';
import { esErrorEB, humanizeError } from '@/src/utils/errores';
import { formatMoney, formatNumeroVE } from '@/src/utils/dinero';
import { useWizardBack } from '@/src/hooks/useWizardBack';
import { useTasaBCV } from '@/src/hooks/useTasaBCV';
import { usePerfil } from '@/src/hooks/usePerfil';
import {
  asientosDelError,
  mensajeAsientosTomados,
  ordenarAsientos,
  unirAsientos,
  useCheckoutBoletos,
  useSegundosRestantes,
} from '@/src/hooks/useCheckoutBoletos';
import type { PasajeroAsiento, ResumenCompra } from '@/src/types';
import { Colors, Layout, Motion, Radius, Sizes, Spacing } from '@/src/theme';

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

/** Días de calendario (hora de Venezuela) entre la salida y la llegada: 0, 1, 2… */
function diasDeDiferenciaVE(desde: string, hasta: string): number {
  const a = Date.parse(`${fechaVE(desde)}T00:00:00Z`);
  const b = Date.parse(`${fechaVE(hasta)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ViajeResumen {
  id: string;
  cooperativa_id: string;
  cooperativa: string;
  calificacion: number;
  fecha_hora_salida: string;
  /** Llegada estimada (`viajes.fecha_hora_llegada_est` o salida + duración de la ruta) */
  llegada: string | null;
  /** "8:30 p. m." (hora de Venezuela) */
  horaSalida: string;
  /** "6:15 a. m. (+1)"; '' si no se conoce */
  horaLlegada: string;
  /** Días de diferencia entre la salida y la llegada (0 = el mismo día) */
  diasLlegada: number;
  /** "9 h 45 min"; '' si no se conoce */
  duracion: string;
  duracionMin: number;
  precio: number;
  asientosDisponibles: number;
  asientosTotales: number;
  ciudadOrigen?: string;
  ciudadDestino?: string;
}

type SortType = 'hora_asc' | 'precio_asc' | 'duracion_asc';

/** Orden en línea sobre la lista (APP-21). */
const SORT_OPTIONS: { id: SortType; label: string }[] = [
  { id: 'hora_asc', label: 'Más temprano' },
  { id: 'precio_asc', label: 'Más barato' },
  { id: 'duracion_asc', label: 'Más rápido' },
];

/** Con 5 o menos asientos libres se avisa "Quedan 3" (APP-20). */
const POCOS_ASIENTOS = 5;

/** "Expresos Mérida, sale 8:30 p. m., llega 6:15 a. m. del día siguiente, …, quedan 3 asientos" */
function etiquetaSalida(viaje: ViajeResumen, monto: string): string {
  const llegada = viaje.horaLlegada
    ? `, llega ${viaje.horaLlegada.replace(/\s*\(\+\d+\)$/, '')}${
        viaje.diasLlegada === 1
          ? ' del día siguiente'
          : viaje.diasLlegada > 1
            ? `, ${viaje.diasLlegada} días después`
            : ''
      }`
    : '';
  const asientos =
    viaje.asientosDisponibles <= POCOS_ASIENTOS
      ? `quedan ${viaje.asientosDisponibles} ${viaje.asientosDisponibles === 1 ? 'asiento' : 'asientos'}`
      : `${viaje.asientosDisponibles} asientos libres`;
  return `${viaje.cooperativa}, sale ${viaje.horaSalida}${llegada}, ${monto}, ${asientos}`;
}

/** Asistente de 4 pasos (#25): Salida · Asientos · Pasajeros · Pago. */
const STEP_TITLES = ['Elige tu salida', 'Elige tus asientos', '¿Quién viaja?', 'Elige cómo pagar'];

/** "Asiento 6" · "Asientos 6 y 7" */
const etiquetaAsientos = (asientos: readonly string[]) =>
  `${asientos.length > 1 ? 'Asientos' : 'Asiento'} ${unirAsientos(asientos)}`;

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

  /**
   * Elige una salida. Si es otra, los ocupados de la anterior se descartan en
   * el mismo render (M-17): el mapa nuevo nunca muestra los de la salida previa.
   */
  const seleccionadoIdRef = useRef<string | null>(null);
  seleccionadoIdRef.current = seleccionado?.id ?? null;
  const elegirSalida = useCallback((viaje: ViajeResumen) => {
    if (seleccionadoIdRef.current !== viaje.id) {
      setAsientosOcupados([]);
      setOcupadosDe(null);
      setErrorOcupados(null);
      setAsientosPerdidos([]);
    }
    seleccionadoIdRef.current = viaje.id;
    setSeleccionado(viaje);
  }, []);

  // ── Pasajeros ────────────────────────────────────────────────────────────
  const [pasajerosGuardados, setPasajerosGuardados] = useState<PasajeroAsiento[] | null>(null);
  const [asientosSinDatos, setAsientosSinDatos] = useState<string[]>([]);
  const [errorPasajeros, setErrorPasajeros] = useState<string | null>(null);

  // ── Datos del comprador antes de apartar (#24) ───────────────────────────
  const [pedirDatos, setPedirDatos] = useState(false);
  const [asientosPendientes, setAsientosPendientes] = useState<string[] | null>(null);

  // ── Selección en curso (asientos del mapa, subpaso de pago) ──────────────
  const [asientosElegidos, setAsientosElegidos] = useState<string[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoElegido | null>(null);
  const [accionPago, setAccionPago] = useState<AccionPago | null>(null);
  const pasajerosRef = useRef<PasajerosFormHandle>(null);

  const [filtersVisible, setFiltersVisible] = useState(false);
  const [selectedCoop, setSelectedCoop] = useState<string | null>(null);
  const [sortType, setSortType] = useState<SortType>('hora_asc');

  /** Ciudades de las últimas búsquedas para el selector (APP-15). Nunca lanza. */
  const [recientes, setRecientes] = useState<Localidad[]>([]);
  useEffect(() => {
    let vivo = true;
    void ciudadesRecientes().then((lista) => {
      if (vivo) setRecientes(lista);
    });
    return () => {
      vivo = false;
    };
  }, []);
  /** "Cambiar destino" del aviso de ruta sin salidas abre el selector del destino. */
  const abrirDestinoRef = useRef<(() => void) | null>(null);
  const registrarAbrirDestino = useCallback((abrir: () => void) => {
    abrirDestinoRef.current = abrir;
  }, []);

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
      setMetodoPago(null);
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
      if (paso !== 4) setMetodoPago(null);
      setStep(paso);
    },
    [estaEnCurso, liberar]
  );

  // Atrás (header, botón de Android o gesto) retrocede un paso; con una forma
  // de pago abierta, primero vuelve a la lista (AN-12). En el paso 1 pide
  // confirmación solo si ya hay algo que perder (AN-21). Mientras corre una
  // RPC (apartar, guardar pasajeros, registrar el pago) no hace nada.
  const retroceder = useCallback(
    (paso: Paso) => {
      if (step === 4 && metodoPago && paso === 3) {
        if (!estaEnCurso()) setMetodoPago(null);
        return;
      }
      irAPaso(paso);
    },
    [step, metodoPago, estaEnCurso, irAPaso]
  );
  const { handleBack, allowLeave } = useWizardBack({
    step,
    setStep: retroceder,
    isDirty: checkout.asientosApartados.length > 0 || pasajerosGuardados !== null,
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
            `id, fecha_hora_salida, fecha_hora_llegada_est, asientos_disponibles, asientos_totales,
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
          const salidaMs = Date.parse(viaje.fecha_hora_salida);
          const minutosRuta = Number(ruta?.duracion_estimada_min) || 0;
          // La llegada estimada del viaje manda; si falta, salida + duración de la ruta.
          const llegadaMs = viaje.fecha_hora_llegada_est
            ? Date.parse(viaje.fecha_hora_llegada_est)
            : minutosRuta > 0 && !Number.isNaN(salidaMs)
              ? salidaMs + minutosRuta * 60_000
              : NaN;
          const llegada = Number.isNaN(llegadaMs) ? null : new Date(llegadaMs).toISOString();
          const minutos =
            llegada && !Number.isNaN(salidaMs) && llegadaMs > salidaMs
              ? Math.round((llegadaMs - salidaMs) / 60_000)
              : minutosRuta;
          const dias = llegada ? diasDeDiferenciaVE(viaje.fecha_hora_salida, llegada) : 0;
          const horaLlegada = llegada
            ? `${formatHoraVE(llegada)}${dias > 0 ? ` (+${dias})` : ''}`
            : '';

          return {
            id: viaje.id,
            cooperativa_id: coop?.id ?? '',
            cooperativa: coop?.nombre ?? 'Cooperativa',
            calificacion: coop?.calificacion_promedio ?? 0,
            fecha_hora_salida: viaje.fecha_hora_salida,
            llegada,
            horaSalida: formatHoraVE(viaje.fecha_hora_salida),
            horaLlegada,
            diasLlegada: dias,
            duracion: minutos > 0 ? formatDuracion(minutos) : '',
            duracionMin: minutos,
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
          if (viaje) elegirSalida(viaje);
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
  }, [origen, destino, fecha, reintentoViajes, mostrarToast, elegirSalida]);

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
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'viajes',
          filter: `id=eq.${viajeElegidoId}`,
        },
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
    const porHora = (a: ViajeResumen, b: ViajeResumen) =>
      Date.parse(a.fecha_hora_salida) - Date.parse(b.fecha_hora_salida);
    return [...filtered].sort((a, b) => {
      if (sortType === 'precio_asc') return a.precio - b.precio || porHora(a, b);
      if (sortType === 'duracion_asc') {
        // Sin duración conocida, al final.
        const da = a.duracionMin > 0 ? a.duracionMin : Number.POSITIVE_INFINITY;
        const db = b.duracionMin > 0 ? b.duracionMin : Number.POSITIVE_INFINITY;
        return da === db ? porHora(a, b) : da - db;
      }
      return porHora(a, b);
    });
  }, [viajes, selectedCoop, sortType]);

  /** La hoja "Filtrar" solo sirve para elegir cooperativa, y solo si hay más de una. */
  const puedeFiltrar = cooperativas.length > 1;
  const filtroActivo = selectedCoop !== null;

  // Si la cooperativa elegida ya no está en la lista (otro día), se quita el filtro.
  useEffect(() => {
    if (selectedCoop && !cooperativas.includes(selectedCoop)) setSelectedCoop(null);
  }, [cooperativas, selectedCoop]);

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
    // La compra vive en Mis boletos: ← desde "Tu compra" cae en la lista (AN-05).
    router.dismissTo('/(tabs)/boletos');
    router.push({
      pathname: '/boletos/compra/[id]',
      params: { id: compraId, recien },
    });
  }

  /** Otro pasajero tomó asientos: marcarlos ocupados y volver a elegir. */
  function manejarAsientosTomados(tomados: string[], desdePago = false) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // En el mapa, `SeatSelector` avisa "El asiento 14 acaba de ser tomado…".
    if (desdePago) toast.show('error', mensajeAsientosTomados(tomados));
    setAsientosOcupados((prev) => Array.from(new Set([...prev, ...tomados])));
    setAsientosPerdidos((prev) => Array.from(new Set([...prev, ...tomados])));
    setAsientosVersion((v) => v + 1);
    if (desdePago) {
      setMetodoPago(null);
      setStep(2);
    }
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
    // Sin el perfil no se sabe si faltan la cédula y el teléfono: el botón espera.
    if (perfilCargando) return;
    if (!perfilCompleto) {
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
    setMetodoPago(null);
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
  // Solo los ocupados de esta salida (o los que se marcaron a mano tras un choque,
  // antes de la primera lectura): nunca los de la salida anterior (M-17).
  const ocupadosVigentes =
    ocupadosDe === null || ocupadosDe === viajeElegidoId ? asientosOcupados : [];
  const ocupadosAjenos = ocupadosVigentes.filter((a) => !misAsientos.includes(a));
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

  // Al entrar al mapa, lo elegido es lo que esta compra ya tiene apartado.
  const misAsientosRef = useRef(misAsientos);
  misAsientosRef.current = misAsientos;
  useEffect(() => {
    if (step === 2) setAsientosElegidos(misAsientosRef.current);
  }, [step, viajeElegidoId]);

  // ── Acción y resumen de cada paso (FloatingBar) ──────────────────────────
  const ordenados = ordenarAsientos(asientosElegidos);
  const precioDe = (n: number) =>
    seleccionado ? formatMoney({ usd: seleccionado.precio * n, tasa: tasaRef }).principal : '';
  const totalCompra = cotizacion
    ? formatMoney({
        usd: cotizacion.totalUsd,
        bs: cotizacion.totalBs,
        tasa: null,
      }).principal
    : precioDe(nBoletos);
  const resumenReserva =
    nBoletos > 0 ? `${etiquetaAsientos(checkout.asientosApartados)} · ${totalCompra}` : null;

  let barra: { resumen: string | null; boton: React.ReactNode } | null = null;
  if (step === 1 && visibles.length > 0 && !loadingViajes) {
    barra = {
      resumen: seleccionado
        ? `${seleccionado.horaSalida} · ${seleccionado.cooperativa} · ${precioDe(1)}`
        : 'Elige una salida',
      boton: (
        <Button
          fullWidth
          disabled={!seleccionado || checkout.enCurso}
          onPress={() => {
            if (seleccionado && !estaEnCurso()) irAPaso(2);
          }}
        >
          Continuar
        </Button>
      ),
    };
  } else if (step === 2 && seleccionado) {
    const sinMapa = cargandoOcupados || !!errorOcupados;
    barra = {
      resumen:
        ordenados.length > 0
          ? `${etiquetaAsientos(ordenados)} · ${precioDe(ordenados.length)}`
          : 'Te apartamos los asientos 30 minutos',
      boton: (
        <Button
          fullWidth
          loading={checkout.enCurso}
          disabled={ordenados.length === 0 || sinMapa || perfilCargando}
          onPress={() => {
            if (ordenados.length === 0 || sinMapa || perfilCargando || estaEnCurso()) return;
            void confirmarAsientos(ordenados);
          }}
          accessibilityLabel={
            ordenados.length > 0
              ? `Apartar ${etiquetaAsientos(ordenados).toLowerCase()}`
              : 'Apartar asientos'
          }
        >
          {ordenados.length === 1
            ? `Apartar asiento ${ordenados[0]}`
            : ordenados.length > 1
              ? `Apartar ${ordenados.length} asientos`
              : 'Apartar asientos'}
        </Button>
      ),
    };
  } else if (step === 3 && seleccionado && !reservaVencida) {
    barra = {
      resumen: resumenReserva,
      boton: (
        <Button
          fullWidth
          loading={checkout.enCurso}
          disabled={nBoletos === 0}
          onPress={() => pasajerosRef.current?.enviar()}
        >
          Continuar
        </Button>
      ),
    };
  } else if (step === 4 && seleccionado && !reservaVencida && accionPago) {
    barra = {
      resumen: resumenReserva,
      boton: (
        <Button
          fullWidth
          icon={accionPago.icon}
          loading={accionPago.cargando}
          disabled={accionPago.disabled}
          onPress={accionPago.onPress}
        >
          {accionPago.etiqueta}
        </Button>
      ),
    };
  }

  const tituloPaso =
    step === 4 ? (tituloMetodo(metodoPago) ?? STEP_TITLES[3]) : STEP_TITLES[step - 1];
  const tituloReserva = `${etiquetaAsientos(checkout.asientosApartados)} ${
    nBoletos > 1 ? 'apartados' : 'apartado'
  }`;

  return (
    <Screen>
      <ScreenHeader
        variant="steps"
        title={tituloPaso}
        step={step}
        totalSteps={4}
        onBack={handleBack}
        backLabel={step > 1 || metodoPago ? 'Volver al paso anterior' : 'Salir de la compra'}
      />

      <ScrollView
        contentContainerStyle={scrollContent({
          top: Spacing.lg,
          floatingAction: !!barra,
        })}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Paso 1: elegir la salida ─────────────────────────────────── */}
        {step === 1 && (
          <>
            <View style={s.busqueda}>
              <RouteField
                origen={origen}
                destino={destino}
                onOrigen={setOrigen}
                onDestino={setDestino}
                onIntercambiar={() => {
                  setOrigen(destino);
                  setDestino(origen);
                }}
                recientes={recientes}
                populares={CIUDADES_POPULARES}
                registrarAbrirDestino={registrarAbrirDestino}
              />
              <CampoFecha
                valor={
                  !origen || !destino ? 'Elige origen y destino' : formatDiaVE(toDateKey(fecha))
                }
                pendiente={!calendarEnabled}
                onPress={() => setShowCalendar(true)}
              />
              {errorFechas ? (
                <View style={s.fechasAviso} accessibilityRole="alert">
                  <Text variant="caption" color="warningText" style={s.fechasAvisoTexto}>
                    No pudimos ver qué días tienen salidas. Puedes buscar igual.
                  </Text>
                  <TextLink
                    onPress={() => setReintentoFechas((n) => n + 1)}
                    accessibilityLabel="Reintentar la carga de fechas con salidas"
                  >
                    Reintentar
                  </TextLink>
                </View>
              ) : null}
            </View>

            {viajes.length > 0 && !loadingViajes && (
              <>
                <View style={s.filterRow}>
                  <Text variant="label">
                    {`${visibles.length} ${visibles.length === 1 ? 'salida' : 'salidas'}`}
                    {selectedCoop ? ` · ${selectedCoop}` : ''}
                  </Text>
                  {puedeFiltrar ? (
                    <PressableScale
                      onPress={() => setFiltersVisible(true)}
                      haptic
                      hapticType="selection"
                      scaleValue={Motion.press.button}
                      style={s.filterTrigger}
                      accessibilityRole="button"
                      accessibilityLabel={
                        selectedCoop
                          ? `Filtrar por cooperativa. Ahora: ${selectedCoop}`
                          : 'Filtrar por cooperativa'
                      }
                    >
                      <SlidersHorizontal
                        color={Colors.foreground}
                        weight="bold"
                        size={Sizes.icon.md}
                      />
                      <Text variant="label">Filtrar</Text>
                      {filtroActivo && <View style={s.filterDot} />}
                    </PressableScale>
                  ) : null}
                </View>

                {/* Orden en línea (APP-21); con una sola salida no hay nada que ordenar. */}
                {visibles.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={s.sortScroll}
                    contentContainerStyle={s.sortRow}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Ordenar salidas"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <Chip
                        key={option.id}
                        label={option.label}
                        selected={sortType === option.id}
                        onPress={() => setSortType(option.id)}
                        accessibilityLabel={`Ordenar: ${option.label}`}
                      />
                    ))}
                  </ScrollView>
                ) : null}
              </>
            )}

            <View style={s.results}>
              {loadingViajes ? (
                <CardSkeleton count={3} />
              ) : !origen || !destino ? (
                <EmptyState
                  icon={MapPin}
                  title="Elige tu ruta"
                  description="Elige origen y destino para ver las salidas."
                  compact
                />
              ) : errorViajes ? (
                <ErrorState
                  title="No pudimos cargar las salidas"
                  description={errorViajes}
                  onRetry={() => setReintentoViajes((n) => n + 1)}
                  compact
                />
              ) : viajes.length === 0 &&
                !errorFechas &&
                !loadingDates &&
                activeDates?.length === 0 ? (
                // La ruta no tiene ninguna salida (no solo ese día): otros destinos (M-09).
                <SinSalidasRuta
                  origen={origen}
                  destino={destino}
                  onElegirDestino={setDestino}
                  onCambiarDestino={() => abrirDestinoRef.current?.()}
                />
              ) : viajes.length === 0 ? (
                <EmptyState
                  icon={CalendarBlank}
                  title="Sin salidas ese día"
                  description="Prueba con otra fecha."
                  action={
                    calendarEnabled
                      ? {
                          children: 'Cambiar fecha',
                          variant: 'secondary',
                          onPress: () => setShowCalendar(true),
                        }
                      : undefined
                  }
                  compact
                />
              ) : visibles.length === 0 ? (
                <EmptyState
                  icon={SlidersHorizontal}
                  title="Sin coincidencias"
                  description="Ninguna salida es de esa cooperativa."
                  action={{
                    children: 'Quitar filtro',
                    variant: 'secondary',
                    onPress: () => setSelectedCoop(null),
                  }}
                  compact
                />
              ) : (
                <View accessibilityRole="radiogroup" accessibilityLabel="Salidas">
                  {visibles.map((viaje, index) => (
                    <StaggerItem key={viaje.id} index={index}>
                      {/* Tocar elige la salida; "Continuar" avanza (§2.1 regla 6). */}
                      <EntityCard
                        selectable
                        selected={seleccionado?.id === viaje.id}
                        onPress={() => {
                          if (estaEnCurso()) return;
                          elegirSalida(viaje);
                        }}
                        title={viaje.cooperativa}
                        subtitle={[
                          viaje.horaLlegada
                            ? `${viaje.horaSalida} → ${viaje.horaLlegada}`
                            : viaje.horaSalida,
                          viaje.duracion,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        subtitleLines={2}
                        badge={<Valoracion calificacion={viaje.calificacion} />}
                        meta={
                          <View style={s.priceMeta}>
                            <Monto
                              usd={viaje.precio}
                              tasa={tasaRef}
                              size="sm"
                              align="right"
                              sinReferencia
                            />
                            {viaje.asientosDisponibles <= POCOS_ASIENTOS ? (
                              <Badge tone="pending">{`Quedan ${viaje.asientosDisponibles}`}</Badge>
                            ) : (
                              <Text variant="caption" color="muted" compact>
                                {`${viaje.asientosDisponibles} libres`}
                              </Text>
                            )}
                          </View>
                        }
                        accessibilityLabel={etiquetaSalida(
                          viaje,
                          formatMoney({ usd: viaje.precio, tasa: tasaRef }).accesible
                        )}
                      />
                    </StaggerItem>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {/* ─── Paso 2: asientos ─────────────────────────────────────────── */}
        {step === 2 && seleccionado && (
          <>
            <TripCard viaje={seleccionado} />
            <SeatSelector
              asientosTotales={seleccionado.asientosTotales ?? 0}
              asientosOcupados={ocupadosAjenos}
              seleccionados={asientosElegidos}
              onChange={setAsientosElegidos}
              confirmando={checkout.enCurso}
              cargandoOcupados={cargandoOcupados}
              errorOcupados={errorOcupados}
              onReintentarOcupados={() => {
                setErrorOcupados(null);
                setAsientosVersion((v) => v + 1);
              }}
            />
          </>
        )}

        {/* ─── Paso 3: pasajeros ────────────────────────────────────────── */}
        {step === 3 && seleccionado && (
          <>
            {reservaVencida ? (
              <ReservaVencida
                texto="Liberamos tus asientos. Si ya pagaste, elige de nuevo y registra la misma referencia."
                onElegirDeNuevo={volverAElegirAsientos}
              />
            ) : (
              <>
                <View style={s.bloque}>
                  <ReservaTimer
                    segundos={segundosReserva}
                    titulo={tituloReserva}
                    detalle="Termina antes de que venza."
                  />
                </View>
                <PasajerosForm
                  ref={pasajerosRef}
                  asientos={checkout.asientosApartados}
                  perfil={perfil}
                  perfilCargando={perfilCargando}
                  inicial={pasajerosIniciales}
                  asientosConError={asientosSinDatos}
                  mensajeError={errorPasajeros}
                  guardando={checkout.enCurso}
                  onSubmit={guardarPasajeros}
                />
              </>
            )}
          </>
        )}

        {/* ─── Paso 4: pago ─────────────────────────────────────────────── */}
        {step === 4 && seleccionado && (
          <>
            {reservaVencida ? (
              <ReservaVencida
                texto="Liberamos tus asientos. Si ya pagaste, elige de nuevo y registra la misma referencia."
                onElegirDeNuevo={volverAElegirAsientos}
              />
            ) : (
              <>
                <View style={s.bloque}>
                  <ReservaTimer segundos={segundosReserva} titulo={tituloReserva} />
                </View>
                {/* Una fila compacta del viaje (AN-14): el total va una sola vez, abajo. */}
                <View style={s.viajeFila}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {`${formatCity(seleccionado.ciudadOrigen)} → ${formatCity(seleccionado.ciudadDestino)}`}
                  </Text>
                  <Text variant="secondary" color="muted" numberOfLines={1}>
                    {`${formatDiaVE(seleccionado.fecha_hora_salida)} · ${seleccionado.horaSalida} · ${seleccionado.cooperativa}`}
                  </Text>
                </View>
                {cotizacion ? (
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
                    metodo={metodoPago}
                    onMetodo={setMetodoPago}
                    onAccion={setAccionPago}
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      {barra ? <FloatingBar resumen={barra.resumen}>{barra.boton}</FloatingBar> : null}

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
        title="Filtrar por cooperativa"
        footer={
          <Button fullWidth onPress={() => setFiltersVisible(false)}>
            Ver salidas
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
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

// ─── Valoración ──────────────────────────────────────────────────────────────

/** Insignia neutra con estrella (SY-27): la valoración no es un estado pendiente. */
function Valoracion({ calificacion }: { calificacion: number }) {
  if (!(calificacion > 0)) return <Badge tone="neutral">Nueva</Badge>;
  const valor = formatNumeroVE(calificacion, 1);
  return (
    <View style={s.valoracion} accessible accessibilityLabel={`Valoración ${valor} de 5`}>
      <Star size={Sizes.icon.xs} color={Colors.primaryText} weight="fill" />
      <Text variant="caption" size="badge" weight="semibold" compact>
        {valor}
      </Text>
    </View>
  );
}

// ─── Trip card ───────────────────────────────────────────────────────────────

function TripCard({ viaje }: { viaje: ViajeResumen }) {
  return (
    <Card tone="sunken" padding="md" style={s.tripCard}>
      <View style={s.tripHeader}>
        <Text variant="subheading" numberOfLines={1} style={s.tripName}>
          {viaje.cooperativa}
        </Text>
        <Valoracion calificacion={viaje.calificacion} />
      </View>

      <Divider spacing={Spacing.lg} />

      <RouteSummary
        origen={viaje.ciudadOrigen}
        destino={viaje.ciudadDestino}
        duration={viaje.duracion || undefined}
        horaSalida={viaje.horaSalida}
        horaLlegada={viaje.horaLlegada || undefined}
      />

      <Divider spacing={Spacing.lg} />

      <View style={s.tripFooter}>
        <View style={s.fechaBlock}>
          <Text variant="caption" color="muted">
            Fecha
          </Text>
          <Text variant="bodyStrong">{formatDiaVE(viaje.fecha_hora_salida)}</Text>
        </View>
        <View style={s.totalBlock}>
          <Text variant="caption" color="muted" align="right">
            Por asiento
          </Text>
          <Monto usd={viaje.precio} size="sm" align="right" />
        </View>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  busqueda: {
    gap: Spacing.md,
  },
  fechasAviso: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  fechasAvisoTexto: {
    flexShrink: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing['2xl'],
  },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Sizes.touchTarget,
    paddingLeft: Spacing.md,
  },
  filterDot: {
    width: Spacing.sm,
    height: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentStrong,
  },
  sortScroll: {
    marginHorizontal: -Layout.screenPadding,
  },
  sortRow: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingHorizontal: Layout.screenPadding,
  },
  results: {
    marginTop: Spacing.lg,
  },
  priceMeta: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  valoracion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: Sizes.badge.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  bloque: {
    marginBottom: Spacing.lg,
  },
  viajeFila: {
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  tripCard: {
    marginBottom: Spacing['2xl'],
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  fechaBlock: {
    gap: Spacing.xs,
  },
  totalBlock: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
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
});
