import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/src/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '@/src/components/Toast';
import { useTasaBCV } from '@/src/hooks/useTasaBCV';
import { codigoEB, humanizeError, parseDetalleEB } from '@/src/utils/errores';
import { nuevaClaveIdempotencia } from '@/src/utils/ids';
import { formatBs, usdABs } from '@/src/utils/dinero';
import type {
  CotizacionPago,
  Encomienda,
  Pago,
  PagoDeclarado,
  PagoEstadoMinimo,
  ResultadoPagoEncomienda,
  SucursalPunto,
} from '@/src/types';

interface UseEncomiendasOptions {
  /**
   * When false, tears down the subscription and stops fetching.
   * Use with useFocusEffect to save battery when the screen isn't visible.
   */
  enabled?: boolean;
  limit?: number;
}

/** Forma de la caché: la lista y cuándo se cargó (las versiones previas guardaban solo la lista). */
interface CacheEncomiendas {
  at: number | null;
  data: Encomienda[];
}

function guardarCache(data: Encomienda[], at: number): CacheEncomiendas {
  return { at, data };
}

function leerCache(texto: string): CacheEncomiendas | null {
  const valor: unknown = JSON.parse(texto);
  if (Array.isArray(valor)) return { at: null, data: valor as Encomienda[] };
  if (valor && typeof valor === 'object' && Array.isArray((valor as CacheEncomiendas).data)) {
    const c = valor as CacheEncomiendas;
    return { at: typeof c.at === 'number' ? c.at : null, data: c.data };
  }
  return null;
}

/**
 * Specialized hook for encomiendas that supports OR-filter (sender + receiver)
 * and focus-aware pause/resume lifecycle with local SWR offline caching.
 *
 * C5 Fix — Realtime subscription overhead:
 * Supabase Realtime does not support compound OR filters at the server level
 * (e.g. `sender_id=eq.X,receiver_user_id=eq.X`). To avoid broadcasting ALL
 * encomienda changes to every connected client, this hook uses TWO separate
 * channels, each with a single server-side equality filter:
 *   - Channel A: `sender_id=eq.${userId}`
 *   - Channel B: `receiver_user_id=eq.${userId}`
 *
 * Each channel only receives rows that match the filter at the Supabase
 * Realtime server, drastically reducing unnecessary WebSocket traffic in
 * production environments with many concurrent users.
 */
export function useEncomiendas(
  userId?: string,
  { enabled = true, limit = 30 }: UseEncomiendasOptions = {}
) {
  const [data, setData] = useState<Encomienda[]>([]);
  const [loading, setLoading] = useState(true);
  /** Texto para el usuario si la última carga falló (`humanizeError`); null si fue bien */
  const [error, setError] = useState<string | null>(null);
  /** `Date.now()` de la última carga buena (de red o de la caché), para `StaleBanner` */
  const [actualizadoAt, setActualizadoAt] = useState<number | null>(null);
  /** La última lectura llenó la página: puede haber más envíos (`cargarMas`). */
  const [hayMas, setHayMas] = useState(false);
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  const cacheKey = `cache:encomiendas_or:${userId || 'anon'}:${limit}`;

  /** Filas pedidas: `limit` y una página más con cada `cargarMas` (máx. 1000). */
  const filasRef = useRef(limit);
  const claveFilasRef = useRef(cacheKey);
  if (claveFilasRef.current !== cacheKey) {
    claveFilasRef.current = cacheKey;
    filasRef.current = limit;
  }
  /** Descarta respuestas viejas (dos lecturas en vuelo) y las que llegan tras desmontar. */
  const turnoRef = useRef(0);
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);
  const ultimaLecturaRef = useRef(0);

  const fetchData = useCallback(async (): Promise<void> => {
    const turno = ++turnoRef.current;
    const vigente = () => montadoRef.current && turno === turnoRef.current;
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true); // REF-05: Show spinner on manual refetch too
    const pedidas = filasRef.current;
    try {
      const { data: result, error: err } = await supabase
        .from('encomiendas')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(pedidas);

      if (err) throw err;
      if (!vigente()) return;
      const filas = (result ?? []) as Encomienda[];
      const ahora = Date.now();
      ultimaLecturaRef.current = ahora;
      setData(filas);
      setHayMas(filas.length >= pedidas && pedidas < 1000);
      setError(null);
      setActualizadoAt(ahora);
      // Persist fresh data to cache, with the time so the stale banner can say "hace 2 h"
      if (filas.length > 0) {
        AsyncStorage.setItem(cacheKey, JSON.stringify(guardarCache(filas, ahora))).catch(() => {
          // Sin caché la lista sigue funcionando; solo no habrá datos sin conexión.
        });
      }
    } catch (err) {
      if (__DEV__) console.warn('[useEncomiendas] Error cargando encomiendas:', err);
      // APP-37: la pantalla decide entre ErrorState (sin datos) y StaleBanner (con caché).
      if (vigente()) setError(humanizeError(err, 'carga'));
    } finally {
      if (vigente()) setLoading(false);
    }
  }, [userId, cacheKey]);

  /** Página siguiente (lista con más de `limit` envíos). */
  const cargarMas = useCallback(() => {
    if (!hayMas || filasRef.current >= 1000) return;
    filasRef.current = Math.min(filasRef.current + limit, 1000);
    void fetchData();
  }, [hayMas, limit, fetchData]);

  // ── Efecto principal: cache secuencial → fetch → dos canales Realtime ───────
  //
  // La carga de cache y el fetch de red son SECUENCIALES para evitar la misma
  // race condition que en useRealtime. Se usan DOS canales Realtime en lugar
  // de uno sin filtro para reducir el tráfico WebSocket en producción (C5 Fix).
  useEffect(() => {
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const initialize = async () => {
      // ── Paso 1: Cache ─────────────────────────────────────────────────────
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        const leida = cached ? leerCache(cached) : null;
        if (leida && isMounted) {
          setData(leida.data);
          setActualizadoAt((prev) => prev ?? leida.at);
          setLoading(false);
        }
      } catch {
        // Caché ilegible: se ignora y manda la carga de red.
      }

      // ── Paso 2: Fetch de red ──────────────────────────────────────────────
      if (isMounted) {
        await fetchData();
      }
    };

    initialize();

    // ── Realtime: DOS canales con filtros de servidor individuales ────────────
    //
    // Un único canal sin filtro recibiría TODOS los cambios de la tabla.
    // Con dos canales, cada uno filtra en el servidor — sólo llegan al cliente
    // los eventos relevantes para este usuario.
    const makeRealtimeHandler = () => (payload: any) => {
      if (!isMounted) return;

      setDataRef.current((current) => {
        let updatedList = current;

        if (payload.eventType === 'INSERT') {
          const newRec = payload.new as any;
          // Guard: solo añadir si el registro pertenece al usuario
          // y si todavía no existe en la lista (deduplicación por los dos canales)
          const alreadyExists = current.some((item) => item.id === newRec.id);
          if (!alreadyExists && (newRec.sender_id === userId || newRec.receiver_user_id === userId)) {
            updatedList = [newRec, ...current];
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Encomienda;
          if (current.some((item) => item.id === updated.id)) {
            updatedList = current.map((item) => (item.id === updated.id ? updated : item));
          } else if (updated.sender_id === userId || updated.receiver_user_id === userId) {
            // M-50: la base vinculó al destinatario después de crear el envío
            // (se registró o completó su cédula o teléfono): aparece en "Para mí".
            updatedList = [updated, ...current];
          }
        } else if (payload.eventType === 'DELETE') {
          updatedList = current.filter((item) => item.id !== payload.old.id);
        }

        // Persistir parche en cache
        if (updatedList !== current && updatedList.length > 0) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(guardarCache(updatedList, Date.now()))).catch(
            () => {}
          );
        }

        return updatedList;
      });
    };

    const uniqueId = Math.random().toString(36).substring(2, 9);

    // Tras una caída del socket (o al volver a primer plano) lo que cambió en el
    // hueco no llegó por los canales: se relee la lista una vez.
    let recargaTimer: ReturnType<typeof setTimeout> | null = null;
    const programarRecarga = () => {
      if (recargaTimer) clearTimeout(recargaTimer);
      recargaTimer = setTimeout(() => {
        recargaTimer = null;
        if (isMounted) void fetchData();
      }, 400);
    };
    const alSuscribir = () => {
      let suscritoAntes = false;
      return (status: string) => {
        if (status !== 'SUBSCRIBED') return;
        if (suscritoAntes) programarRecarga();
        suscritoAntes = true;
      };
    };
    const appState = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && Date.now() - ultimaLecturaRef.current >= 30_000) programarRecarga();
    });

    // Canal A: encomiendas enviadas por este usuario
    const channelSender = supabase
      .channel(`rt:enc:sender:${userId}:${uniqueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'encomiendas',
          filter: `sender_id=eq.${userId}`,
        },
        makeRealtimeHandler()
      )
      .subscribe(alSuscribir());

    // Canal B: encomiendas recibidas por este usuario
    const channelReceiver = supabase
      .channel(`rt:enc:receiver:${userId}:${uniqueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'encomiendas',
          filter: `receiver_user_id=eq.${userId}`,
        },
        makeRealtimeHandler()
      )
      .subscribe(alSuscribir());

    return () => {
      isMounted = false;
      if (recargaTimer) clearTimeout(recargaTimer);
      appState.remove();
      supabase.removeChannel(channelSender);
      supabase.removeChannel(channelReceiver);
    };
  // fetchData is stable (useCallback), re-run only on enabled/userId change
  }, [enabled, userId, fetchData, cacheKey]);

  return { data, loading, error, actualizadoAt, setData, refetch: fetchData, hayMas, cargarMas };
}

// ─── Pago de una encomienda desde la app (#5, P-29) ───────────────────────────

/** Columnas de `pagos` que leen las pantallas de detalle de una encomienda. */
export const PAGO_ENCOMIENDA_COLUMNAS =
  'id, pagador_id, estado_verificacion, verificado, rechazado_at, motivo_rechazo, tipo_pago, monto, monto_bs, moneda, monto_declarado, tasa_bcv, tasa_bcv_fecha, numero_referencia, created_at';

export type PagoEncomienda = PagoEstadoMinimo &
  Pick<Pago, 'id'> &
  Partial<
    Pick<
      Pago,
      | 'tipo_pago'
      | 'monto'
      | 'monto_bs'
      | 'moneda'
      | 'monto_declarado'
      | 'tasa_bcv'
      | 'tasa_bcv_fecha'
      | 'numero_referencia'
      | 'pagador_id'
    >
  >;

/**
 * Pagos de la encomienda que el usuario puede leer. Desde la fase 3 (política
 * "Partes de la encomienda ven su cobro") el remitente y el destinatario ven
 * todos los pagos de la encomienda: `pagador_id` dice si es el propio ("Tu
 * pago…") o el de la otra parte. Con la base anterior solo llegan los propios y
 * `getCobroEncomienda` deduce el resto del estado.
 */
export async function cargarPagosEncomienda(encomiendaId: string): Promise<PagoEncomienda[]> {
  const { data, error } = await supabase
    .from('pagos')
    .select(PAGO_ENCOMIENDA_COLUMNAS)
    .eq('encomienda_id', encomiendaId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as PagoEncomienda[];
}

/** La tasa cambió entre que el usuario vio el monto y registró el pago. */
export interface TasaCambioEncomienda {
  /** Total en Bs que el usuario vio (y quizá transfirió) */
  anteriorBs: number | null;
  /** Total en Bs a la tasa vigente según el servidor */
  nuevoBs: number | null;
  nuevaTasa: number;
  /** Lo que el usuario declaró; se reenvía tal cual con la tasa nueva */
  declarado: PagoDeclarado;
}

/** Texto del aviso de `EB_TASA_CAMBIO` (mismo copy que en boletos). */
export function textoTasaCambio(t: TasaCambioEncomienda): string {
  const ahora = t.nuevoBs !== null ? `El total ahora es ${formatBs(t.nuevoBs)}` : 'El total cambió';
  const antes = t.anteriorBs !== null ? ` (antes ${formatBs(t.anteriorBs)})` : '';
  return `La tasa BCV se actualizó. ${ahora}${antes}. Si ya transferiste el monto anterior, regístralo igual: la cooperativa verá la diferencia.`;
}

interface UsePagoEncomiendaOpciones {
  /** El pago quedó registrado (PENDIENTE): recargar la pantalla y avisar. */
  onRegistrado: (r: ResultadoPagoEncomienda) => void;
  /** Los datos de la pantalla quedaron viejos (otro pago, otro estado): recargar. */
  onDesactualizada?: () => void;
}

/**
 * Registrar el pago de una encomienda con `fn_registrar_pago_encomienda`.
 *
 * - `cotizacion`: USD de referencia (`costo_calculado`) y Bs a la tasa BCV
 *   vigente; null mientras no hay costo.
 * - `registrar`: el `onRegistrar` de `PaymentFlow`. Envía la tasa que vio el
 *   usuario (`p_tasa_esperada`) y una clave de idempotencia que se conserva
 *   entre reintentos y se renueva tras un éxito (un doble toque no duplica).
 * - `EB_TASA_CAMBIO`: no lanza; deja `tasaCambio` con el total nuevo para que
 *   la pantalla lo muestre, y `confirmarNuevaTasa` reenvía lo que declaró el
 *   usuario (lo que de verdad pagó) con la tasa nueva. En Zelle (USD) el monto
 *   no cambia: se reintenta una vez sin preguntar.
 * - `EB_PAGO_YA_REGISTRADO`: no lanza; `pagoDeOtro` = true (lo más probable es
 *   que la otra parte ya pagó y por RLS no vemos su pago).
 */
export function usePagoEncomienda(
  encomienda: Pick<Encomienda, 'id' | 'costo_calculado'> | null,
  { onRegistrado, onDesactualizada }: UsePagoEncomiendaOpciones
) {
  const toast = useToast();
  const { tasa, fecha, loading: cargandoTasa, recargar } = useTasaBCV();

  /** Tasa confirmada por el servidor en un `EB_TASA_CAMBIO` (manda sobre la caché). */
  const [tasaServidor, setTasaServidor] = useState<{ tasa: number; fecha: string | null } | null>(
    null
  );
  const [tasaCambio, setTasaCambio] = useState<TasaCambioEncomienda | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const [pagoDeOtro, setPagoDeOtro] = useState(false);

  const idemKeyRef = useRef(nuevaClaveIdempotencia());
  const reintentoRef = useRef(false);

  const encomiendaId = encomienda?.id ?? null;
  const costo = Number(encomienda?.costo_calculado);

  const cotizacion = useMemo<CotizacionPago | null>(() => {
    if (!(costo > 0)) return null;
    const t = Number(tasaServidor?.tasa ?? tasa);
    const f = tasaServidor ? tasaServidor.fecha : fecha;
    if (!(t > 0)) return { totalUsd: costo, totalBs: null, tasa: null, tasaFecha: null };
    return { totalUsd: costo, totalBs: usdABs(costo, t), tasa: t, tasaFecha: f };
  }, [costo, tasa, fecha, tasaServidor]);

  const cotizacionRef = useRef(cotizacion);
  cotizacionRef.current = cotizacion;
  const callbacksRef = useRef({ onRegistrado, onDesactualizada });
  callbacksRef.current = { onRegistrado, onDesactualizada };

  const llamar = useCallback(
    async (d: PagoDeclarado, tasaEsperada: number | null) => {
      if (!encomiendaId) return;
      const { data, error } = await supabase.rpc('fn_registrar_pago_encomienda', {
        p_encomienda_id: encomiendaId,
        p_metodo_pago_id: d.metodo_pago_id,
        p_numero_referencia: d.numero_referencia,
        p_fecha_transaccion: d.fecha_transaccion,
        p_banco_emisor: d.banco_emisor,
        p_monto_declarado: d.monto_declarado,
        p_tasa_esperada: tasaEsperada,
        p_idempotency_key: idemKeyRef.current,
        p_comprobante_path: d.comprobante_path,
      });
      if (error) throw error;
      idemKeyRef.current = nuevaClaveIdempotencia();
      setTasaCambio(null);
      setPagoDeOtro(false);
      callbacksRef.current.onRegistrado(data as ResultadoPagoEncomienda);
    },
    [encomiendaId]
  );

  /** true si el error quedó resuelto aquí (la pantalla no debe mostrarlo como fallo). */
  const manejarError = useCallback(
    (err: unknown, d: PagoDeclarado): boolean => {
      const codigo = codigoEB(err);
      if (codigo === 'EB_TASA_CAMBIO') {
        const detalle = parseDetalleEB(err);
        const nuevaTasa = Number(detalle.tasa);
        if (nuevaTasa > 0) {
          const nuevoBs = Number(detalle.total_bs);
          setTasaServidor({ tasa: nuevaTasa, fecha: detalle.tasa_fecha ?? null });
          setTasaCambio({
            anteriorBs: cotizacionRef.current?.totalBs ?? null,
            nuevoBs: nuevoBs > 0 ? nuevoBs : costo > 0 ? usdABs(costo, nuevaTasa) : null,
            nuevaTasa,
            declarado: d,
          });
          recargar();
          return true;
        }
      }
      if (codigo === 'EB_PAGO_YA_REGISTRADO') {
        setTasaCambio(null);
        setPagoDeOtro(true);
        toast.show('info', humanizeError(err, 'pago'));
        callbacksRef.current.onDesactualizada?.();
        return true;
      }
      if (codigo === 'EB_ESTADO_CAMBIO' || codigo === 'EB_COSTO_PENDIENTE') {
        callbacksRef.current.onDesactualizada?.();
      }
      return false;
    },
    [costo, recargar, toast]
  );

  /** `onRegistrar` de `PaymentFlow`: lanza el error si el formulario debe marcarlo. */
  const registrar = useCallback(
    async (d: PagoDeclarado) => {
      try {
        await llamar(d, cotizacionRef.current?.tasa ?? null);
      } catch (err) {
        // Zelle se paga en USD: el monto a enviar no cambia con la tasa, así que
        // no tiene sentido preguntar. Se reintenta una vez con la tasa del servidor.
        const detalle = parseDetalleEB(err);
        const nuevaTasa = Number(detalle.tasa);
        if (codigoEB(err) === 'EB_TASA_CAMBIO' && d.banco_emisor === 'Zelle' && nuevaTasa > 0) {
          setTasaServidor({ tasa: nuevaTasa, fecha: detalle.tasa_fecha ?? null });
          try {
            await llamar(d, nuevaTasa);
            return;
          } catch (err2) {
            if (manejarError(err2, d)) return;
            throw err2;
          }
        }
        if (manejarError(err, d)) return;
        throw err;
      }
    },
    [llamar, manejarError]
  );

  /** "Registrar con el nuevo total": reenvía lo declarado con la tasa del servidor. */
  const confirmarNuevaTasa = useCallback(async () => {
    const pendiente = tasaCambio;
    if (!pendiente || reintentoRef.current) return;
    reintentoRef.current = true;
    setReintentando(true);
    try {
      await llamar(pendiente.declarado, pendiente.nuevaTasa);
    } catch (err) {
      if (__DEV__) console.error('[usePagoEncomienda] Error registrando con la tasa nueva:', err);
      if (!manejarError(err, pendiente.declarado)) {
        setTasaCambio(null);
        toast.show(
          'error',
          `No pudimos registrar tu pago; tus datos siguen aquí. ${humanizeError(err, 'pago')}`
        );
      }
    } finally {
      reintentoRef.current = false;
      setReintentando(false);
    }
  }, [tasaCambio, llamar, manejarError, toast]);

  /** "Revisar": cierra el aviso; el formulario ya muestra el total nuevo. */
  const descartarTasaCambio = useCallback(() => setTasaCambio(null), []);

  return {
    cotizacion,
    /** Aún no hay ninguna tasa (ni guardada): conviene esperar antes de pintar el formulario */
    cargandoTasa: cargandoTasa && tasa === null,
    registrar,
    tasaCambio,
    confirmarNuevaTasa,
    descartarTasaCambio,
    reintentando,
    pagoDeOtro,
  };
}

// ─── Puntos de entrega y retiro (#31, #32, M-44) ──────────────────────────────

/** Sucursales activas de la cooperativa en una ciudad (`fn_sucursales_en_ciudad`). */
export async function cargarSucursalesCiudad(
  cooperativaId: string,
  ciudad: string
): Promise<SucursalPunto[]> {
  const { data, error } = await supabase.rpc('fn_sucursales_en_ciudad', {
    p_cooperativa_id: cooperativaId,
    p_ciudad: ciudad,
  });
  if (error) throw error;
  return (data ?? []) as SucursalPunto[];
}

/**
 * Dónde se entrega (origen) y dónde se retira (destino) una encomienda.
 * `null` mientras carga o si no se pudo leer: la pantalla cae en "Pregunta en la
 * taquilla de {cooperativa} en {ciudad}", que siempre es cierto.
 */
export function useSucursalesEncomienda(
  enc: Pick<Encomienda, 'cooperativa_id' | 'ciudad_origen' | 'ciudad_destino'> | null
) {
  const [origen, setOrigen] = useState<SucursalPunto[] | null>(null);
  const [destino, setDestino] = useState<SucursalPunto[] | null>(null);

  const cooperativaId = enc?.cooperativa_id ?? null;
  const ciudadOrigen = enc?.ciudad_origen ?? null;
  const ciudadDestino = enc?.ciudad_destino ?? null;

  useEffect(() => {
    if (!cooperativaId) return;
    let vigente = true;
    const cargar = (ciudad: string | null, set: (v: SucursalPunto[] | null) => void) => {
      if (!ciudad) return;
      cargarSucursalesCiudad(cooperativaId, ciudad).then(
        (lista) => {
          if (vigente) set(lista);
        },
        () => {
          // Sin la lista se muestra el texto genérico; no bloquea el detalle.
          if (vigente) set(null);
        }
      );
    };
    cargar(ciudadOrigen, setOrigen);
    cargar(ciudadDestino, setDestino);
    return () => {
      vigente = false;
    };
  }, [cooperativaId, ciudadOrigen, ciudadDestino]);

  return { origen, destino };
}

/**
 * Texto de un punto de entrega o retiro:
 * - una sucursal (o la asignada): "Terminal La Bandera · Av. Nueva Granada";
 * - varias: "Terminal A o Terminal B";
 * - ninguna o sin datos: "la taquilla de {cooperativa} en {ciudad}".
 * `detalle` trae horario y teléfono cuando hay una sola.
 */
export function describirPunto(
  lista: SucursalPunto[] | null,
  opciones: { preferidaId?: string | null; cooperativa?: string | null; ciudad?: string | null }
): { nombre: string; completo: string; detalle: string | null; conocido: boolean } {
  const generico = `la taquilla de ${opciones.cooperativa || 'la cooperativa'}${
    opciones.ciudad ? ` en ${opciones.ciudad}` : ''
  }`;
  if (!lista || lista.length === 0) {
    return { nombre: generico, completo: generico, detalle: null, conocido: false };
  }
  const preferida = opciones.preferidaId ? lista.find((s) => s.id === opciones.preferidaId) : null;
  const una = preferida ?? (lista.length === 1 ? lista[0] : null);
  if (una) {
    const detalle = [una.horario, una.telefono ? `Tel. ${una.telefono}` : null].filter(Boolean).join(' · ');
    return {
      nombre: una.nombre,
      completo: [una.nombre, una.direccion].filter(Boolean).join(' · '),
      detalle: detalle || null,
      conocido: true,
    };
  }
  const nombres = lista.map((s) => s.nombre);
  const varias = `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}`;
  return { nombre: varias, completo: varias, detalle: null, conocido: true };
}
