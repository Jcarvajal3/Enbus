/**
 * boletos/[id] — un boleto. Ceja "Pase de abordaje" solo si está pagado; si
 * no, "Boleto" (AN-09). El estado va en la fila bajo el código.
 *
 * Lo que se vino a hacer va primero (AN-10): pagado → el QR tras la cabecera;
 * sin pagar → "Registrar pago" en la `FloatingBar` y "Cancelar reserva" en el
 * cuerpo. La reserva corre con `ReservaTimer` (aquí y en la hoja de pago).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowClockwise,
  ClockCounterClockwise,
  CreditCard,
  IdentificationCard,
  Info,
  Lifebuoy,
  MapPin,
  ShareNetwork,
  Ticket,
} from 'phosphor-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QRCodeViewer } from '@/src/components/QRCodeViewer';
import { StarRating } from '@/src/components/StarRating';
import {
  BotonesTasaCambiada,
  PaymentFlow,
  textoTasaCambiada,
  tituloMetodo,
  type AccionPago,
  type MetodoElegido,
} from '@/src/components/PaymentFlow';
import { PasajerosForm, type PasajerosFormHandle } from '@/src/components/PasajerosForm';
import { ReservaTimer } from '@/src/components/ReservaTimer';
import { ScreenSkeleton, SkeletonLoader } from '@/src/components/SkeletonLoader';
import { PressableScale } from '@/src/components/PressableScale';
import { useVolver } from '@/src/hooks/useVolver';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  FloatingBar,
  RouteSummary,
  Screen,
  ScreenHeader,
  StaleBanner,
  StatusBadge,
  Text,
  scrollContent,
} from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/components/Toast';
import { formatCity, formatDuracion } from '@/src/utils/formatters';
import {
  METODO_PAGO,
  getEstadoBoletoUi,
  getEstadoReembolso,
  getEstadoVisual,
  reservaPuedeVencer,
} from '@/src/utils/estados';
import { codigoEB, esErrorEB, humanizeError, parseDetalleEB } from '@/src/utils/errores';
import { formatBs, formatMoney, formatUsd, usdABs } from '@/src/utils/dinero';
import { formatCodigoBoleto } from '@/src/utils/codigos';
import { cedulaValida, formatCedula, formatTelefono, nombreValido } from '@/src/utils/validation';
import { useTasaBCV } from '@/src/hooks/useTasaBCV';
import { usePerfil } from '@/src/hooks/usePerfil';
import {
  asientosDelError,
  formatDiaMes,
  formatSalidaCorta,
  mensajeAsientosTomados,
  ordenarAsientos,
  salidaYaOcurrio,
  unirAsientos,
  useCheckoutBoletos,
  useSegundosRestantes,
} from '@/src/hooks/useCheckoutBoletos';
import type {
  Boleto,
  EstadoBoleto,
  PasajeroAsiento,
  ResultadoCancelacionBoleto,
  SucursalPunto,
} from '@/src/types';
import { Colors, Layout, Radius, Sizes, Spacing } from '@/src/theme';

/** Porcentaje del pasaje que se devuelve al cancelar un boleto pagado (lo calcula el servidor). */
const REFUND_RATE = 0.95;
/** Al vencer la reserva en pantalla: recargar cada 15 s, como mucho 4 veces. */
const RECARGA_VENCIDA_MS = 15_000;
const RECARGAS_VENCIDA_MAX = 4;
/** Prefijo con el que `fn_cancelar_viaje` guarda el motivo de la cooperativa. */
const PREFIJO_CANCELADO_COOPERATIVA = 'Viaje cancelado por la cooperativa';
/** Motivos de cancelación de un boleto pagado (§5 #27). */
const MOTIVOS_CANCELACION = ['Cambio de planes', 'Problema de salud', 'Compré otro boleto', 'Otro'];

const SELECT_BOLETO = `id, codigo_boleto, asiento, precio, estado, reserva_expira_at, cooperativa_id,
  comprador_id, compra_id, viaje_id, pago_id, motivo_cancelacion, monto_reembolso,
  reembolso_procesado, reembolso_procesado_at, reembolso_metodo, reembolso_referencia,
  qr_embarque_data, pasajero_nombre, pasajero_cedula, pasajero_telefono, created_at,
  viajes ( fecha_hora_salida, numero_unidad, nombre_chofer,
           rutas ( ciudad_origen, ciudad_destino, duracion_estimada_min ) ),
  cooperativas ( nombre ),
  profiles!comprador_id ( nombre_completo, cedula_rif ),
  pago:pagos!boletos_pago_id_fkey ( id, estado_verificacion, tipo_pago, motivo_rechazo,
    numero_referencia, banco_emisor, monto, monto_bs, moneda, monto_declarado,
    tasa_bcv, tasa_bcv_fecha, created_at )`;

/** Boletos de la misma compra (para pagar todos los asientos apartados juntos). */
interface BoletoCompra {
  id: string;
  asiento: string;
  estado: EstadoBoleto;
  precio: number;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  pasajero_telefono: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** ["Terminal La Bandera", "Sede Chacao", "Av. Bolívar"] → "Terminal La Bandera, Sede Chacao o Av. Bolívar". */
function unirConO(lista: readonly string[]): string {
  if (lista.length <= 1) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} o ${lista[lista.length - 1]}`;
}

export default function DetalleBoletoScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const volver = useVolver('/(tabs)/boletos');
  const toast = useToast();
  const { user } = useAuth();
  const tasaBCV = useTasaBCV();
  const { perfil, loading: perfilCargando } = usePerfil();

  const [boleto, setBoleto] = useState<Boleto | null>(null);
  const [compra, setCompra] = useState<BoletoCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [pagoSheetVisible, setPagoSheetVisible] = useState(false);
  /** Subpaso de la hoja de pago (la ← de la hoja vuelve a las formas de pago) */
  const [metodoPago, setMetodoPago] = useState<MetodoElegido | null>(null);
  const [accionPago, setAccionPago] = useState<AccionPago | null>(null);
  const pasajerosRef = useRef<PasajerosFormHandle>(null);
  const [recargasVencida, setRecargasVencida] = useState(0);

  // ── Cancelación (una sola hoja para reserva y boleto pagado, §5 #27) ──────
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [motivoChip, setMotivoChip] = useState<string | null>(null);
  const [motivoOtro, setMotivoOtro] = useState('');
  const [motivoError, setMotivoError] = useState<string | undefined>();
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  // ── Pasajeros que faltan antes de pagar (perfiles sin cédula, #25) ───────
  const [forzarPasajeros, setForzarPasajeros] = useState(false);
  const [asientosSinDatos, setAsientosSinDatos] = useState<string[]>([]);
  const [errorPasajeros, setErrorPasajeros] = useState<string | null>(null);

  // ── Punto de salida (fn_sucursales_en_ciudad) ────────────────────────────
  const [sucursales, setSucursales] = useState<SucursalPunto[] | null>(null);

  const [calificacion, setCalificacion] = useState<{ estrellas: number; comentario?: string } | null>(
    null
  );
  const [loadingCalificacion, setLoadingCalificacion] = useState(false);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const viewShotRef = useRef<ViewShot>(null);
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // ── Carga (cache primero, red después) ───────────────────────────────────
  const cacheKey = `cache:boleto:${id}`;

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const query = supabase.from('boletos').select(SELECT_BOLETO);
      const { data, error } = await (UUID_RE.test(id)
        ? query.eq('id', id)
        : query.eq('codigo_boleto', id)
      ).maybeSingle();
      if (error) throw error;
      // Sin fila (código mal escrito o boleto de otra cuenta): "Boleto no encontrado",
      // no un error de carga con "Reintentar".
      if (!data) {
        if (montadoRef.current) setErrorCarga(null);
        return;
      }

      const fila = data as unknown as Boleto;
      let deLaCompra: BoletoCompra[] = [];
      if (fila.compra_id) {
        const res = await supabase
          .from('boletos')
          .select('id, asiento, estado, precio, pasajero_nombre, pasajero_cedula, pasajero_telefono')
          .eq('compra_id', fila.compra_id);
        if (res.error) throw res.error;
        deLaCompra = (res.data ?? []) as BoletoCompra[];
      }

      if (!montadoRef.current) return;
      setBoleto(fila);
      setCompra(deLaCompra);
      setErrorCarga(null);
      AsyncStorage.setItem(cacheKey, JSON.stringify(fila)).catch(() => {});
    } catch (err) {
      if (__DEV__) console.warn('[boleto] Error cargando boleto:', err);
      if (montadoRef.current) setErrorCarga(humanizeError(err, 'carga'));
    } finally {
      if (montadoRef.current) setLoading(false);
    }
  }, [id, cacheKey]);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    AsyncStorage.getItem(cacheKey)
      .then((cached) => {
        if (cached && !cancelado) {
          setBoleto((prev) => prev ?? (JSON.parse(cached) as Boleto));
          setLoading(false);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) void cargar();
      });
    return () => {
      cancelado = true;
    };
  }, [id, cacheKey, cargar]);

  // ── Realtime: la cooperativa aprueba/rechaza el pago, registra el reembolso o el cron vence la reserva ──
  const boletoId = boleto?.id;
  useEffect(() => {
    if (!boletoId) return;
    const channel = supabase
      .channel(`rt:boleto:${boletoId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'boletos', filter: `id=eq.${boletoId}` },
        () => {
          void cargar();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [boletoId, cargar]);

  // ── Estado que ve el usuario ─────────────────────────────────────────────
  const estadoUi = getEstadoBoletoUi(boleto);
  const estadoVisual = getEstadoVisual('boleto', estadoUi);
  const estadoReembolso = getEstadoReembolso(boleto);
  const puedeVencer = reservaPuedeVencer(estadoUi);
  const segundos = useSegundosRestantes(puedeVencer ? boleto?.reserva_expira_at : null);
  const vencidaEnPantalla = puedeVencer && segundos === 0;

  // A la hora de salida la pantalla se vuelve a pintar (desaparece "Cancelar").
  const salidaIso = boleto?.viajes?.fecha_hora_salida ?? null;
  const [, setTickSalida] = useState(0);
  useEffect(() => {
    const falta = salidaIso ? Date.parse(salidaIso) - Date.now() : NaN;
    if (!(falta > 0) || falta > 2_147_000_000) return;
    const t = setTimeout(() => setTickSalida((n) => n + 1), falta + 500);
    return () => clearTimeout(t);
  }, [salidaIso]);

  // A 0 el servidor libera el asiento (cron cada minuto): recargar hasta verlo.
  useEffect(() => {
    setRecargasVencida(0);
  }, [boleto?.reserva_expira_at]);

  useEffect(() => {
    if (!vencidaEnPantalla || recargasVencida >= RECARGAS_VENCIDA_MAX) return;
    const t = setTimeout(() => {
      setRecargasVencida((n) => n + 1);
      void cargar();
    }, RECARGA_VENCIDA_MS);
    return () => clearTimeout(t);
  }, [vencidaEnPantalla, recargasVencida, cargar]);

  // ── Punto de salida: sucursales de la cooperativa en la ciudad de origen ──
  const coopId = boleto?.cooperativa_id;
  const ciudadOrigen = boleto?.viajes?.rutas?.ciudad_origen;
  useEffect(() => {
    if (!coopId || !ciudadOrigen) return;
    let vivo = true;
    const sinDatos = (err: unknown) => {
      if (__DEV__) console.warn('[boleto] Error cargando el punto de salida:', err);
      // Sin la lista se muestra "Pregunta en la taquilla…", que sigue siendo cierto.
      if (vivo) setSucursales([]);
    };
    supabase
      .rpc('fn_sucursales_en_ciudad', { p_cooperativa_id: coopId, p_ciudad: ciudadOrigen })
      .then(({ data, error }) => {
        if (error) return sinDatos(error);
        if (vivo) setSucursales((data ?? []) as SucursalPunto[]);
      }, sinDatos);
    return () => {
      vivo = false;
    };
  }, [coopId, ciudadOrigen]);

  // ── Registrar el pago de la compra (asientos RESERVADO) ──────────────────
  const asientosApartados = useMemo(
    () => ordenarAsientos(compra.filter((b) => b.estado === 'RESERVADO').map((b) => b.asiento)),
    [compra]
  );
  const totalUsd = useMemo(
    () =>
      compra
        .filter((b) => b.estado === 'RESERVADO')
        .reduce((sum, b) => sum + (Number(b.precio) || 0), 0),
    [compra]
  );
  /** Asientos apartados sin nombre o cédula válidos: el checkout los rechazaría. */
  const compraSinDatos = useMemo(
    () =>
      compra
        .filter(
          (b) =>
            b.estado === 'RESERVADO' &&
            (!nombreValido(b.pasajero_nombre) || !cedulaValida(b.pasajero_cedula ?? ''))
        )
        .map((b) => b.asiento),
    [compra]
  );
  const pasajerosIniciales = useMemo<PasajeroAsiento[]>(
    () =>
      compra
        .filter((b) => b.estado === 'RESERVADO')
        .map((b) => ({
          asiento: b.asiento,
          nombre: b.pasajero_nombre ?? '',
          cedula: b.pasajero_cedula ?? '',
          telefono: b.pasajero_telefono,
        })),
    [compra]
  );
  const pedirPasajeros = forzarPasajeros || compraSinDatos.length > 0;

  const cerrarPago = useCallback(() => setPagoSheetVisible(false), []);
  const abrirPago = () => {
    setMetodoPago(null);
    setPagoSheetVisible(true);
  };

  const checkout = useCheckoutBoletos({
    viajeId: boleto?.viaje_id,
    compraId: boleto?.compra_id,
    liberarAlSalir: false,
    onExito: () => {
      cerrarPago();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Registramos tu pago. La cooperativa lo revisará y te avisaremos.');
      void cargar();
    },
    onAsientosOcupados: (tomados) => {
      cerrarPago();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', mensajeAsientosTomados(tomados));
      void cargar();
    },
    onPagoYaRegistrado: (mensaje) => {
      cerrarPago();
      toast.show('info', mensaje);
      void cargar();
    },
    onDatosPasajero: (asientos, mensaje) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setForzarPasajeros(true);
      setAsientosSinDatos(asientos);
      setErrorPasajeros(mensaje);
    },
  });
  const { fijarCompra, tasaCambiada, confirmarTasaCambiada, descartarTasaCambiada } = checkout;

  // Mientras llega la tasa no se cotiza (la hoja muestra "Calculando el monto…"
  // en vez del aviso de "sin tasa").
  const esperandoTasa = tasaBCV.loading && tasaBCV.tasa == null;
  useEffect(() => {
    const tasa = tasaBCV.tasa;
    fijarCompra({
      asientos: asientosApartados,
      cotizacion:
        totalUsd > 0 && !esperandoTasa
          ? {
              totalUsd,
              totalBs: tasa ? usdABs(totalUsd, tasa) : null,
              tasa,
              tasaFecha: tasaBCV.fecha,
            }
          : null,
    });
  }, [asientosApartados, totalUsd, tasaBCV.tasa, tasaBCV.fecha, esperandoTasa, fijarCompra]);

  // EB_TASA_CAMBIO: la hoja de pago ya está abierta, así que el aviso se muestra
  // dentro de ella (AU-25; antes era una alerta del sistema que en web no salía).
  const { recargar: recargarTasa } = tasaBCV;
  useEffect(() => {
    if (tasaCambiada) recargarTasa();
  }, [tasaCambiada, recargarTasa]);

  const registrarConTasaNueva = () => {
    confirmarTasaCambiada().catch((err: unknown) => {
      if (__DEV__) console.warn('[boleto] Error registrando pago:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('error', `No pudimos registrar tu pago. ${humanizeError(err, 'pago')}`);
    });
  };

  // La reserva venció (o el bus salió) con la hoja abierta: no se puede pagar ni cancelar.
  const salidaOcurrida = salidaYaOcurrio(salidaIso);
  useEffect(() => {
    if (vencidaEnPantalla || salidaOcurrida) {
      setPagoSheetVisible(false);
      if (!canceling) setCancelSheetVisible(false);
    }
  }, [vencidaEnPantalla, salidaOcurrida, canceling]);

  // ── Calificación previa ──────────────────────────────────────────────────
  useEffect(() => {
    if (!boleto || boleto.estado !== 'USADO') return;
    let isMounted = true;

    setLoadingCalificacion(true);
    supabase
      .from('calificaciones')
      .select('estrellas, comentario')
      .eq('boleto_id', boleto.id)
      .maybeSingle()
      .then(({ data, error }) => {
        // Sin la calificación previa se muestra el formulario: el servidor
        // rechaza un duplicado y el error se ve al enviar.
        if (error && __DEV__) console.warn('[boleto] Error cargando calificación:', error.message);
        if (isMounted) {
          if (data) setCalificacion(data);
          setLoadingCalificacion(false);
        }
      });

    return () => {
      isMounted = false;
    };
    // La calificación sólo debe recargarse si cambia el boleto o su estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boleto?.id, boleto?.estado]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  const irAAyuda = () => {
    if (!boleto) return;
    router.push({
      pathname: '/ayuda',
      params: { tipo: 'boleto', id: boleto.id, codigo: boleto.codigo_boleto ?? '' },
    });
  };

  const handleShare = async () => {
    if (!boleto || !viewShotRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 0.9 });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartir pase de abordaje',
        UTI: 'public.png',
      });
    } catch (err) {
      if (__DEV__) console.warn('[boleto] Error compartiendo pase:', err);
      toast.show('error', `No pudimos compartir el pase. ${humanizeError(err)}`);
    }
  };

  const abrirCancelar = () => {
    if (canceling) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMotivoChip(null);
    setMotivoOtro('');
    setMotivoError(undefined);
    setErrorCancelar(null);
    setCancelSheetVisible(true);
  };

  const cerrarCancelar = () => {
    if (canceling) return;
    setCancelSheetVisible(false);
  };

  const confirmarCancelacion = async () => {
    if (!boleto || canceling) return;
    const pagado = estadoUi === 'PAGADO';

    let motivoTexto: string | null = null;
    if (pagado) {
      if (!motivoChip) {
        setMotivoError('Elige el motivo de la cancelación.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      motivoTexto = motivoChip === 'Otro' ? motivoOtro.trim() : motivoChip;
      if (motivoChip === 'Otro' && motivoTexto.length < 3) {
        setMotivoError('Cuéntanos brevemente el motivo.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
    }

    setCanceling(true);
    setErrorCancelar(null);
    try {
      const { data, error } = await supabase.rpc('fn_cancelar_boleto', {
        p_boleto_id: boleto.id,
        p_motivo: motivoTexto,
      });
      if (error) throw error;
      const r = data as ResultadoCancelacionBoleto | null;
      if (montadoRef.current) setCancelSheetVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(
        'success',
        pagado || r?.reembolso_usd != null
          ? 'Boleto cancelado. Te avisaremos cuando la cooperativa registre tu reembolso.'
          : 'Reserva cancelada. El asiento quedó libre.'
      );
      await cargar();
    } catch (err) {
      if (__DEV__) console.warn('[boleto] Error cancelando:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const mensaje = humanizeError(err);
      const codigo = codigoEB(err);
      if (parseDetalleEB(err).campo === 'motivo') {
        setMotivoError(mensaje);
      } else if (
        codigo === 'EB_PAGO_EN_VERIFICACION' ||
        codigo === 'EB_ESTADO_CAMBIO' ||
        codigo === 'EB_VIAJE_YA_SALIO'
      ) {
        // El boleto cambió mientras tanto: se cierra la hoja y se muestra el estado real.
        if (montadoRef.current) setCancelSheetVisible(false);
        toast.show('error', mensaje);
        void cargar();
      } else if (pagado) {
        if (montadoRef.current) setErrorCancelar(`No pudimos cancelar. ${mensaje}`);
      } else {
        // La confirmación de la reserva no tiene sitio para el error: se cierra y se avisa.
        if (montadoRef.current) setCancelSheetVisible(false);
        toast.show('error', `No pudimos cancelar. ${mensaje}`);
      }
    } finally {
      if (montadoRef.current) setCanceling(false);
    }
  };

  const guardarPasajeros = async (pasajeros: PasajeroAsiento[]) => {
    setErrorPasajeros(null);
    try {
      const r = await checkout.asignarPasajeros(pasajeros);
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
      setForzarPasajeros(false);
      // Lo guardado ya está en la respuesta: el pago se muestra sin esperar la recarga.
      setCompra((prev) =>
        prev.map((b) => {
          const nuevo = r.boletos.find((x) => x.id === b.id);
          return nuevo
            ? {
                ...b,
                pasajero_nombre: nuevo.pasajero_nombre,
                pasajero_cedula: nuevo.pasajero_cedula,
                pasajero_telefono: nuevo.pasajero_telefono,
              }
            : b;
        })
      );
      await cargar();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (esErrorEB(err, 'EB_DATOS_PASAJERO')) {
        setAsientosSinDatos(asientosDelError(err));
        setErrorPasajeros(humanizeError(err));
        return;
      }
      if (esErrorEB(err, 'EB_ESTADO_CAMBIO')) {
        cerrarPago();
        toast.show('error', humanizeError(err));
        void cargar();
        return;
      }
      if (__DEV__) console.warn('[boleto] Error guardando pasajeros:', err);
      setErrorPasajeros(`No pudimos guardar los datos; siguen aquí. ${humanizeError(err)}`);
    }
  };

  const handleSubmitRating = async () => {
    if (!user || !boleto || estrellas < 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show('error', 'Selecciona de 1 a 5 estrellas');
      return;
    }

    try {
      setSubmittingRating(true);
      const { error } = await supabase.from('calificaciones').insert({
        boleto_id: boleto.id,
        usuario_id: user.id,
        cooperativa_id: boleto.cooperativa_id,
        estrellas,
        comentario: comentario.trim() || null,
      });
      if (error) throw error;

      setCalificacion({ estrellas, comentario: comentario.trim() || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('success', 'Gracias. Registramos tu calificación.');
    } catch (err) {
      if (__DEV__) console.warn('[boleto] Error enviando calificación:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(
        'error',
        `No pudimos enviar tu calificación. ${humanizeError(err, 'calificacion')}`
      );
    } finally {
      setSubmittingRating(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Screen>
        <ScreenHeader variant="compact" eyebrow="Boleto" title={id ?? ''} onBack={volver} />
        <ScreenSkeleton variante="detalle" />
      </Screen>
    );
  }

  if (!boleto) {
    return (
      <Screen>
        <ScreenHeader variant="compact" title="Boleto" onBack={volver} />
        {errorCarga ? (
          <ErrorState title="No pudimos cargar tu boleto" description={errorCarga} onRetry={cargar} />
        ) : (
          <EmptyState
            icon={Ticket}
            title="Boleto no encontrado"
            description="Puede ser de otra cuenta o tener un error en el código."
            action={{
              children: 'Ir a Mis boletos',
              icon: Ticket,
              onPress: () => router.dismissTo('/(tabs)/boletos'),
            }}
          />
        )}
      </Screen>
    );
  }

  const ruta = boleto.viajes?.rutas;
  const minutos = ruta?.duracion_estimada_min ?? 0;
  const pago = Array.isArray(boleto.pago) ? boleto.pago[0] : boleto.pago;
  const cooperativa = boleto.cooperativas?.nombre ?? 'la cooperativa';
  const pasajero = boleto.pasajero_nombre || boleto.profiles?.nombre_completo || '—';
  const cedula = formatCedula(boleto.pasajero_cedula || boleto.profiles?.cedula_rif);
  const codigoLegible = formatCodigoBoleto(boleto.codigo_boleto);
  const precio = formatMoney({ usd: Number(boleto.precio) || 0, tasa: tasaBCV.tasaRef });
  const reservaActiva = estadoUi === 'RESERVA_SIN_PAGAR' || estadoUi === 'PAGO_RECHAZADO';
  const rechazado = estadoUi === 'PAGO_RECHAZADO';
  const enVerificacion = estadoUi === 'PAGO_EN_VERIFICACION';
  const pagado = estadoUi === 'PAGADO';
  const salioYa = salidaYaOcurrio(salidaIso);
  const vigente = (pagado || reservaActiva || enVerificacion) && !salioYa;
  const puedeCancelar = ((reservaActiva && !vencidaEnPantalla) || pagado) && !salioYa;
  const puedePagar = reservaActiva && !vencidaEnPantalla && !salioYa && nAsientosDe(compra) > 0;
  const cotizacion = checkout.cotizacion;
  const nAsientos = asientosApartados.length;
  const etiquetaAsientos =
    nAsientos > 1
      ? `Asientos ${unirAsientos(asientosApartados)}`
      : `Asiento ${asientosApartados[0] ?? boleto.asiento ?? ''}`;
  const tituloReserva = `${etiquetaAsientos} ${nAsientos > 1 ? 'apartados' : 'apartado'}`;

  // Lo que se devolvería al cancelar un boleto pagado (el servidor calcula el real).
  const reembolsoUsd = Math.round((Number(boleto.precio) || 0) * REFUND_RATE * 100) / 100;
  const tasaHoy = tasaBCV.tasa;
  const textoReembolso = tasaHoy
    ? `Te devolveremos ${formatBs(usdABs(reembolsoUsd, tasaHoy))} (95 % del pasaje; ≈ ${formatUsd(
        reembolsoUsd
      )}).`
    : `Te devolveremos ${formatUsd(reembolsoUsd)} (95 % del pasaje) en bolívares.`;

  // Detalle de una cancelación (§5 #27).
  const motivoCancelacion = boleto.motivo_cancelacion?.trim() ?? '';
  const porCooperativa = motivoCancelacion.startsWith(PREFIJO_CANCELADO_COOPERATIVA);
  const motivoCooperativa = motivoCancelacion
    .slice(PREFIJO_CANCELADO_COOPERATIVA.length)
    .replace(/^[:\s]+/, '');
  const montoReembolso = Number(boleto.monto_reembolso) || 0;

  // Hoja de pago: título y botón según el subpaso.
  const tituloHojaPago = tasaCambiada
    ? 'La tasa BCV cambió'
    : pedirPasajeros
      ? '¿Quién viaja?'
      : (tituloMetodo(metodoPago) ?? '¿Cómo vas a pagar?');
  const pieHojaPago = tasaCambiada ? (
    <BotonesTasaCambiada
      enviando={checkout.enCurso}
      onConfirmar={registrarConTasaNueva}
      onRevisar={descartarTasaCambiada}
    />
  ) : pedirPasajeros && nAsientos > 0 ? (
    <Button fullWidth loading={checkout.enCurso} onPress={() => pasajerosRef.current?.enviar()}>
      Continuar
    </Button>
  ) : accionPago ? (
    <Button
      fullWidth
      icon={accionPago.icon}
      loading={accionPago.cargando}
      disabled={accionPago.disabled}
      onPress={accionPago.onPress}
    >
      {accionPago.etiqueta}
    </Button>
  ) : undefined;

  const ticket = (
    <View style={s.ticket}>
      <View style={s.ticketCabecera}>
        <Text variant="caption" color="muted">
          Cooperativa
        </Text>
        <Text variant="subheading" numberOfLines={2}>
          {boleto.cooperativas?.nombre ?? 'Cooperativa'}
        </Text>
      </View>

      <View style={s.ticketRuta}>
        <RouteSummary
          origen={ruta?.ciudad_origen}
          destino={ruta?.ciudad_destino}
          duration={minutos > 0 ? formatDuracion(minutos) : undefined}
        />
      </View>

      {/* Perforación */}
      <View style={s.perforation}>
        <View style={[s.notch, s.notchLeft]} />
        <View style={s.dashes} />
        <View style={[s.notch, s.notchRight]} />
      </View>

      <View style={s.ticketDetails}>
        <TicketField label="Asiento" value={boleto.asiento ?? '—'} highlight />
        {/* Con la tarjeta "Salida" arriba, la fecha no se repite aquí (AU-18). */}
        {!vigente ? <TicketField label="Salida" value={formatSalidaCorta(salidaIso)} /> : null}
        <TicketField label="Pasajero" value={pasajero} />
        <TicketField label="Cédula" value={cedula} />
        <TicketField label="Unidad" value={boleto.viajes?.numero_unidad ?? 'Por asignar'} />
        <TicketField label="Chofer" value={boleto.viajes?.nombre_chofer ?? 'Por asignar'} />
        <TicketField label="Precio" value={precio.principal} hint={precio.secundario ?? undefined} />
      </View>

      {reservaActiva || enVerificacion ? (
        <View style={s.ticketPie}>
          <Text variant="caption" color="muted" align="center">
            El QR de abordaje aparece cuando la cooperativa confirme tu pago.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <ScreenHeader
        variant="compact"
        eyebrow={pagado ? 'Pase de abordaje' : 'Boleto'}
        title={codigoLegible || '—'}
        onBack={volver}
        status={
          estadoReembolso ? (
            <StatusBadge dominio="reembolso" estado={estadoReembolso} />
          ) : (
            <StatusBadge dominio="boleto" estado={estadoUi} />
          )
        }
      />

      <ScrollView
        contentContainerStyle={scrollContent({ top: Spacing.lg, floatingAction: puedePagar })}
        showsVerticalScrollIndicator={false}
      >
        {errorCarga ? <StaleBanner onRetry={() => void cargar()} /> : null}

        {/* ── Aviso de estado (uno solo) ──────────────────────────────── */}
        {reservaActiva ? (
          vencidaEnPantalla ? (
            <View style={[s.aviso, s.avisoNeutro]} accessibilityRole="alert">
              <ClockCounterClockwise size={Sizes.icon.lg} color={Colors.mutedForeground} weight="fill" />
              <View style={s.avisoCuerpo}>
                <Text variant="label">Se acabó el tiempo. Estamos liberando el asiento…</Text>
                {recargasVencida >= RECARGAS_VENCIDA_MAX ? (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={ArrowClockwise}
                    onPress={() => {
                      setRecargasVencida(0);
                      void cargar();
                    }}
                    style={s.inlineButton}
                  >
                    Actualizar
                  </Button>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={s.bloque}>
              <ReservaTimer
                segundos={segundos}
                titulo={rechazado ? 'Registra tu pago de nuevo' : tituloReserva}
                detalle={
                  rechazado
                    ? 'Antes de que venza la reserva.'
                    : `Registra tu pago o paga en la taquilla de ${cooperativa}.`
                }
              />
            </View>
          )
        ) : enVerificacion ? (
          <View style={[s.aviso, s.avisoInfo]}>
            <Info size={Sizes.icon.lg} color={Colors.infoText} weight="fill" />
            <Text variant="secondary" style={s.avisoCuerpo}>
              Te avisaremos cuando la cooperativa confirme tu pago.
            </Text>
          </View>
        ) : estadoUi === 'EXPIRADO' && estadoVisual.hint ? (
          <View style={[s.aviso, s.avisoNeutro]}>
            <ClockCounterClockwise size={Sizes.icon.lg} color={Colors.mutedForeground} weight="fill" />
            <Text variant="secondary" style={s.avisoCuerpo}>
              {estadoVisual.hint}
            </Text>
          </View>
        ) : null}

        {/* ── Pase: el QR primero (AN-10) y el boleto, juntos para compartir ── */}
        {pagado ? (
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }} style={s.captura}>
            <View style={s.qr}>
              <QRCodeViewer
                data={boleto.qr_embarque_data || `PASS-${boleto.codigo_boleto}`}
                codigoLegible={codigoLegible}
                ampliable
                size={200}
              />
              <Text variant="caption" color="muted" align="center" style={s.qrTexto}>
                Muéstralo en la taquilla antes de subir. Si el lector falla, dicta el código.
              </Text>
            </View>
            {ticket}
          </ViewShot>
        ) : null}

        {/* ── Cuándo y desde dónde sale (#26, M-33) ───────────────────── */}
        {vigente ? (
          <Card tone="sunken" padding="md" style={s.bloque}>
            <Text variant="caption" color="muted">
              Salida
            </Text>
            <Text variant="heading" style={s.salidaHora}>
              {formatSalidaCorta(salidaIso)}
            </Text>
            <View style={s.salidaFilas}>
              <PuntoDeSalida
                sucursales={sucursales}
                cooperativa={cooperativa}
                ciudad={formatCity(ruta?.ciudad_origen)}
              />
              <View style={s.salidaFila}>
                <IdentificationCard size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />
                <Text variant="secondary" style={s.salidaTexto}>
                  Llega 30 minutos antes con tu cédula.
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {!pagado ? <View style={s.bloque}>{ticket}</View> : null}

        {/* ── Pago registrado ─────────────────────────────────────────── */}
        {pago && pago.tipo_pago === 'DIGITAL' && (enVerificacion || rechazado) ? (
          <Card tone="sunken" padding="md" style={s.bloque}>
            <Text variant="subheading">{rechazado ? 'Pago rechazado' : 'Tu pago registrado'}</Text>
            <View style={s.pagoRows}>
              {rechazado && pago.motivo_rechazo ? (
                <Text variant="secondary" color="dangerText">
                  {`Motivo: ${pago.motivo_rechazo}`}
                </Text>
              ) : null}
              {pago.numero_referencia ? (
                <Text variant="secondary" color="muted">
                  {`Referencia ${pago.numero_referencia}`}
                </Text>
              ) : null}
              {pago.banco_emisor ? (
                <Text variant="secondary" color="muted">
                  {pago.banco_emisor}
                </Text>
              ) : null}
              {pago.monto_declarado != null ? (
                <Text variant="secondary" color="muted">
                  {`Pagaste ${
                    formatMoney({
                      usd: pago.moneda === 'USD' ? Number(pago.monto_declarado) : null,
                      bs: pago.moneda === 'USD' ? null : Number(pago.monto_declarado),
                      tasa: null,
                      moneda: pago.moneda,
                    }).principal
                  }`}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* ── Detalle de cancelación y reembolso ──────────────────────── */}
        {estadoUi === 'CANCELADO' && (
          <Card tone="sunken" padding="md" style={s.bloque}>
            <View style={s.cancelRows}>
              {porCooperativa ? (
                <Text variant="secondary">
                  {`La cooperativa canceló este viaje${
                    motivoCooperativa ? `: ${motivoCooperativa}` : ''
                  }.${montoReembolso > 0 ? ' Te devolverá el 100 % de tu pasaje.' : ''}`}
                </Text>
              ) : motivoCancelacion ? (
                <Text variant="secondary" color="muted">
                  {`Motivo: ${motivoCancelacion}`}
                </Text>
              ) : null}

              {estadoReembolso === 'PROCESADO' ? (
                <>
                  <Text variant="secondary">
                    {`Reembolso enviado${
                      boleto.reembolso_procesado_at
                        ? ` el ${formatDiaMes(boleto.reembolso_procesado_at)}`
                        : ''
                    }${
                      boleto.reembolso_metodo
                        ? ` por ${METODO_PAGO[boleto.reembolso_metodo] ?? boleto.reembolso_metodo}`
                        : ''
                    }${
                      boleto.reembolso_referencia ? ` (ref. ${boleto.reembolso_referencia})` : ''
                    }. Si no lo ves en tu cuenta, repórtalo.`}
                  </Text>
                </>
              ) : estadoReembolso === 'PENDIENTE' ? (
                <Text variant="secondary">
                  {`La cooperativa te devolverá ${formatUsd(montoReembolso)}${
                    tasaHoy ? ` (≈ ${formatBs(usdABs(montoReembolso, tasaHoy))})` : ''
                  } en 1 a 2 días hábiles, por el mismo medio con que pagaste.`}
                </Text>
              ) : (
                <Text variant="secondary">Cancelado sin costo: no habías pagado.</Text>
              )}
            </View>
          </Card>
        )}

        {/* ── Calificación ────────────────────────────────────────────── */}
        {estadoUi === 'USADO' && (
          <Card tone="sunken" padding="md" style={s.bloque}>
            <Text variant="subheading">Califica tu viaje</Text>
            <Text variant="secondary" color="muted" style={s.blockText}>
              {`¿Cómo estuvo viajar con ${cooperativa}?`}
            </Text>

            {loadingCalificacion ? (
              <SkeletonLoader height={Sizes.control.lg} borderRadius={Radius.lg} />
            ) : calificacion ? (
              <View style={s.ratingDone}>
                <StarRating rating={calificacion.estrellas} readonly />
                {calificacion.comentario ? (
                  <Text variant="secondary" style={s.quoteText}>
                    {`“${calificacion.comentario}”`}
                  </Text>
                ) : null}
                <Text variant="caption" color="successText">
                  Ya calificaste este viaje
                </Text>
              </View>
            ) : (
              <View style={s.ratingForm}>
                <StarRating
                  rating={estrellas}
                  onRatingChange={setEstrellas}
                  readonly={submittingRating}
                />
                <Field
                  label="Comentario (opcional)"
                  value={comentario}
                  onChangeText={setComentario}
                  editable={!submittingRating}
                  multiline
                  numberOfLines={2}
                  containerStyle={s.ultimoCampo}
                />
                <Button
                  size="md"
                  fullWidth
                  disabled={estrellas === 0}
                  loading={submittingRating}
                  onPress={handleSubmitRating}
                >
                  Enviar calificación
                </Button>
              </View>
            )}
          </Card>
        )}

        {/* ── Acciones secundarias ────────────────────────────────────── */}
        {pagado || puedeCancelar || (salioYa && vigenteAntes(estadoUi)) || enVerificacion ? (
          <View style={s.acciones}>
            {pagado ? (
              <Button variant="outline" icon={ShareNetwork} fullWidth onPress={handleShare}>
                Compartir pase
              </Button>
            ) : null}

            {puedeCancelar ? (
              <Button variant="dangerGhost" fullWidth disabled={canceling} onPress={abrirCancelar}>
                {pagado ? 'Cancelar boleto' : 'Cancelar reserva'}
              </Button>
            ) : null}

            {salioYa && vigenteAntes(estadoUi) ? (
              <Text variant="secondary" color="muted" align="center">
                Este viaje ya salió; no se puede cancelar desde la app.
              </Text>
            ) : enVerificacion ? (
              <Text variant="secondary" color="muted" align="center">
                Para cancelar, espera la respuesta de la cooperativa.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── Ayuda (#28) ─────────────────────────────────────────────── */}
        <PressableScale
          onPress={irAAyuda}
          haptic
          hapticType="selection"
          style={s.ayuda}
          accessibilityRole="link"
          accessibilityLabel="¿Problemas con este boleto? Reportar un problema"
        >
          <Lifebuoy size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />
          <Text variant="secondary" color="muted">
            {'¿Problemas con este boleto? '}
            <Text variant="label" color="link" style={s.enlace}>
              Reportar un problema
            </Text>
          </Text>
        </PressableScale>
      </ScrollView>

      {/* ── Sin pagar: "Registrar pago" fijo abajo (AN-10) ────────────── */}
      {puedePagar ? (
        <FloatingBar
          resumen={`${etiquetaAsientos} · ${
            cotizacion
              ? formatMoney({ usd: cotizacion.totalUsd, bs: cotizacion.totalBs, tasa: null }).principal
              : formatMoney({ usd: totalUsd, tasa: tasaBCV.tasaRef }).principal
          }`}
        >
          <Button icon={CreditCard} fullWidth disabled={canceling} onPress={abrirPago}>
            Registrar pago
          </Button>
        </FloatingBar>
      ) : null}

      {/* ── Hoja de pago ────────────────────────────────────────────────── */}
      <BottomSheet
        visible={pagoSheetVisible}
        onClose={() => {
          if (!checkout.estaEnCurso()) setPagoSheetVisible(false);
        }}
        title={tituloHojaPago}
        onBack={
          metodoPago && !pedirPasajeros && !tasaCambiada && !checkout.enCurso
            ? () => setMetodoPago(null)
            : undefined
        }
        footer={pieHojaPago}
      >
        <ScrollView
          contentContainerStyle={s.pagoSheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tasaCambiada ? (
            <Text variant="body">{textoTasaCambiada(tasaCambiada)}</Text>
          ) : (
            <>
              {segundos !== null && !vencidaEnPantalla ? (
                <View style={s.bloque}>
                  <ReservaTimer segundos={segundos} titulo={tituloReserva} />
                </View>
              ) : null}
              {pedirPasajeros && nAsientos > 0 ? (
                <PasajerosForm
                  ref={pasajerosRef}
                  asientos={asientosApartados}
                  perfil={perfil}
                  perfilCargando={perfilCargando}
                  inicial={pasajerosIniciales}
                  asientosConError={asientosSinDatos}
                  mensajeError={errorPasajeros}
                  guardando={checkout.enCurso}
                  onSubmit={guardarPasajeros}
                />
              ) : cotizacion && boleto.cooperativa_id ? (
                <PaymentFlow
                  cooperativaId={boleto.cooperativa_id}
                  concepto={`${nAsientos === 1 ? '1 boleto' : `${nAsientos} boletos`} · ${formatCity(
                    ruta?.ciudad_origen
                  )} → ${formatCity(ruta?.ciudad_destino)}`}
                  tipoRecurso="boleto"
                  cotizacion={cotizacion}
                  onRegistrar={checkout.onRegistrar}
                  bloqueado={checkout.enCurso || vencidaEnPantalla}
                  embebido
                  metodo={metodoPago}
                  onMetodo={setMetodoPago}
                  onAccion={setAccionPago}
                />
              ) : (
                <View style={s.esqueletoPago}>
                  <SkeletonLoader height={Sizes.iconBox['2xl']} borderRadius={Radius.lg} />
                  <SkeletonLoader height={Sizes.control.xl} borderRadius={Radius.lg} index={1} />
                </View>
              )}
            </>
          )}
        </ScrollView>
      </BottomSheet>

      {/* ── Cancelar una reserva: la confirmación común (D3) ─────────────── */}
      <ConfirmSheet
        visible={cancelSheetVisible && !pagado}
        cargando={canceling}
        titulo="¿Cancelar esta reserva?"
        mensaje={`Liberaremos el asiento ${boleto.asiento ?? ''}. No se te cobrará nada.`}
        confirmar="Cancelar reserva"
        onConfirm={() => void confirmarCancelacion()}
        onClose={cerrarCancelar}
      />

      {/* ── Cancelar un boleto pagado: misma hoja, con el motivo ─────────── */}
      <BottomSheet
        visible={cancelSheetVisible && pagado}
        onClose={cerrarCancelar}
        title="¿Cancelar este boleto?"
        footer={
          <View style={s.sheetButtons}>
            <Button variant="danger" fullWidth loading={canceling} onPress={confirmarCancelacion}>
              Cancelar boleto
            </Button>
            <Button variant="ghost" fullWidth disabled={canceling} onPress={cerrarCancelar}>
              Volver
            </Button>
          </View>
        }
      >
        <ScrollView
          contentContainerStyle={s.sheetBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="body" color="muted" style={s.sheetIntro}>
            {`${textoReembolso} El asiento queda libre y este pase deja de servir.`}
          </Text>
          <Text variant="label" style={s.motivoLabel}>
            Motivo
          </Text>
          <View style={s.chips} accessibilityRole="radiogroup">
            {MOTIVOS_CANCELACION.map((m) => (
              <Chip
                key={m}
                label={m}
                selected={motivoChip === m}
                onPress={() => {
                  if (canceling) return;
                  setMotivoChip(m);
                  setMotivoError(undefined);
                }}
                accessibilityLabel={`Motivo: ${m}`}
              />
            ))}
          </View>
          {motivoChip === 'Otro' ? (
            <Field
              label="Cuéntanos el motivo"
              value={motivoOtro}
              onChangeText={(v) => {
                setMotivoOtro(v);
                if (motivoError) setMotivoError(undefined);
              }}
              error={motivoError}
              tone="sunken"
              editable={!canceling}
              multiline
              numberOfLines={2}
            />
          ) : motivoError ? (
            <Text variant="caption" color="dangerText" accessibilityRole="alert">
              {motivoError}
            </Text>
          ) : null}

          {errorCancelar ? (
            <Text
              variant="secondary"
              color="dangerText"
              style={s.errorCancelar}
              accessibilityRole="alert"
            >
              {errorCancelar}
            </Text>
          ) : null}
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

/** Asientos apartados (RESERVADO) de la compra. */
function nAsientosDe(compra: readonly { estado: EstadoBoleto }[]): number {
  return compra.filter((b) => b.estado === 'RESERVADO').length;
}

/** Estados con los que el boleto seguía vivo antes de la salida. */
function vigenteAntes(estado: string | null): boolean {
  return (
    estado === 'PAGADO' ||
    estado === 'RESERVA_SIN_PAGAR' ||
    estado === 'PAGO_RECHAZADO' ||
    estado === 'PAGO_EN_VERIFICACION'
  );
}

// ─── Punto de salida ─────────────────────────────────────────────────────────

/**
 * "Desde: Terminal La Bandera · Av. Nueva Granada" con teléfono y horario; si
 * la cooperativa tiene varias sucursales en la ciudad, las nombra; si no tiene
 * ninguna registrada, dice dónde preguntar (§5 #26).
 */
function PuntoDeSalida({
  sucursales,
  cooperativa,
  ciudad,
}: {
  sucursales: SucursalPunto[] | null;
  cooperativa: string;
  ciudad: string;
}) {
  let principal: string;
  const extras: string[] = [];
  if (sucursales === null) {
    principal = 'Buscando el punto de salida…';
  } else if (sucursales.length === 0) {
    principal = `Pregunta en la taquilla de ${cooperativa} en ${ciudad} por el punto de salida.`;
  } else if (sucursales.length === 1) {
    const [suc] = sucursales;
    principal = `Sale de ${suc.nombre}${suc.direccion ? ` · ${suc.direccion}` : ''}`;
    if (suc.telefono) {
      const tel = formatTelefono(suc.telefono);
      extras.push(`Teléfono: ${tel === '—' ? suc.telefono : tel}`);
    }
    if (suc.horario) extras.push(`Horario: ${suc.horario}`);
  } else {
    principal = `Puede salir desde: ${unirConO(sucursales.map((x) => x.nombre))}. Confírmalo con la cooperativa.`;
  }

  return (
    <View style={s.salidaFila}>
      <MapPin size={Sizes.icon.md} color={Colors.mutedForeground} weight="bold" />
      <View style={s.salidaTexto}>
        <Text variant="secondary">{principal}</Text>
        {extras.map((linea) => (
          <Text key={linea} variant="caption" color="muted" selectable>
            {linea}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ─── Ticket field ────────────────────────────────────────────────────────────

function TicketField({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <View style={s.ticketField}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      {highlight ? (
        // El asiento es lo que más se busca al subir al bus: ≥ 30 pt (M-32).
        <Text variant="title" compact>
          {value}
        </Text>
      ) : (
        <Text variant="bodyStrong" numberOfLines={2}>
          {value}
        </Text>
      )}
      {hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const NOTCH = Spacing.xl;

const s = StyleSheet.create({
  bloque: {
    marginBottom: Spacing.lg,
  },
  // ── Avisos
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  avisoInfo: {
    backgroundColor: Colors.infoLight,
  },
  avisoNeutro: {
    backgroundColor: Colors.surface,
  },
  avisoCuerpo: {
    flex: 1,
    gap: Spacing.xs,
  },

  // ── QR
  captura: {
    backgroundColor: Colors.background,
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  qr: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
  },
  qrTexto: {
    maxWidth: 280,
  },

  // ── Salida
  salidaHora: {
    marginTop: Spacing.xs,
  },
  salidaFilas: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  salidaFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  salidaTexto: {
    flex: 1,
    gap: Spacing.xs,
  },

  // ── Ticket
  ticket: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  ticketCabecera: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    gap: Spacing.xs,
  },
  ticketRuta: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  perforation: {
    height: NOTCH,
    justifyContent: 'center',
  },
  dashes: {
    marginHorizontal: NOTCH,
    borderTopWidth: Sizes.borderStrong,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
  },
  notch: {
    position: 'absolute',
    width: NOTCH,
    height: NOTCH,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    top: 0,
  },
  notchLeft: {
    left: -NOTCH / 2,
  },
  notchRight: {
    right: -NOTCH / 2,
  },
  ticketDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  ticketField: {
    width: '50%',
    paddingRight: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  ticketPie: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderTopWidth: Sizes.hairline,
    borderTopColor: Colors.border,
  },

  // ── Bloques inferiores
  acciones: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  blockText: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  pagoRows: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  cancelRows: {
    gap: Spacing.sm,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  ratingDone: {
    gap: Spacing.md,
  },
  ratingForm: {
    gap: Spacing.lg,
  },
  quoteText: {
    fontStyle: 'italic',
  },
  ultimoCampo: {
    marginBottom: 0,
  },
  ayuda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Sizes.touchTarget,
    marginTop: Spacing.sm,
  },
  enlace: {
    textDecorationLine: 'underline',
  },

  // ── Hoja de pago
  pagoSheet: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  esqueletoPago: {
    gap: Spacing.md,
  },

  // ── Hoja de cancelación
  sheetBody: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  sheetIntro: {
    marginBottom: Spacing.lg,
  },
  sheetButtons: {
    gap: Spacing.sm,
  },
  motivoLabel: {
    marginBottom: Spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  errorCancelar: {
    marginTop: Spacing.md,
  },
});
