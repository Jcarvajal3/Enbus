/**
 * useCheckoutBoletos — compra de boletos desde la app (fase 2, #2).
 *
 * El dinero y los asientos se deciden en el servidor:
 *   1. Al confirmar asientos → `fn_reservar_asientos` los aparta 30 minutos
 *      (sin pago). Así el usuario puede pagar fuera de la app sin perderlos.
 *   2. Pasajeros (fase 3, #25) → `fn_asignar_pasajeros`: nombre y cédula de
 *      quien viaja en cada asiento. El checkout los exige (`EB_DATOS_PASAJERO`).
 *   3. Al registrar el pago → `fn_checkout_boletos` (atómico e idempotente):
 *      re-asegura los asientos, calcula el monto, crea el pago PENDIENTE y lo
 *      vincula a todos los boletos de la compra.
 *   4. Si el usuario sale sin terminar → `fn_liberar_reserva` (mejor esfuerzo;
 *      si falla, el cron libera la reserva al vencer).
 *
 * Identificadores:
 * - `compraId`: uno por intento de compra. Se renueva al liberar o al cambiar
 *   de viaje (el servidor no deja mezclar viajes en una compra).
 * - Clave de idempotencia: se conserva entre reintentos del mismo pago (doble
 *   toque, respuesta perdida, `EB_TASA_CAMBIO`) y se renueva tras un éxito.
 *
 * Uso típico (asistente de compra):
 *   const checkout = useCheckoutBoletos({ viajeId, onExito, onAsientosOcupados });
 *   await checkout.reservar(['14', '15']);
 *   await checkout.asignarPasajeros([{ asiento: '14', nombre, cedula }, …]);
 *   <PaymentFlow cotizacion={checkout.cotizacion} onRegistrar={checkout.onRegistrar} … />
 *
 * Detalle de un boleto (compra ya existente): pasar `compraId` y fijar los
 * asientos y la cotización con `fijarCompra`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/utils/supabase';
import { nuevaClaveIdempotencia, uuidv4 } from '@/src/utils/ids';
import { AppError, codigoEB, humanizeError, parseDetalleEB } from '@/src/utils/errores';
import { formatDiaHoraVE, formatDiaVE, formatHoraVE } from '@/src/utils/formatters';
import type {
  CotizacionPago,
  PagoDeclarado,
  PasajeroAsiento,
  ResultadoAsignarPasajeros,
  ResumenCompra,
  ResumenReserva,
} from '@/src/types';

// ─── Helpers de presentación ─────────────────────────────────────────────────

/** Asientos en orden numérico ("2", "10", "14"). */
export function ordenarAsientos(asientos: readonly string[]): string[] {
  return [...asientos].sort((a, b) => Number(a) - Number(b));
}

/** ["14", "15", "16"] → "14, 15 y 16". */
export function unirAsientos(asientos: readonly string[]): string {
  const lista = ordenarAsientos(asientos);
  if (lista.length <= 1) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
}

/** 1781 → "29:41". */
export function formatCuentaAtras(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Segundos que faltan para `expiraIso` según la hora del servidor
 * (`offsetMs = server_now - Date.now()`). Se actualiza cada segundo y se
 * detiene en 0. `null` si no hay vencimiento.
 */
export function useSegundosRestantes(
  expiraIso: string | null | undefined,
  offsetMs = 0
): number | null {
  const calcular = useCallback(() => {
    if (!expiraIso) return null;
    const fin = Date.parse(expiraIso);
    if (Number.isNaN(fin)) return null;
    return Math.max(0, Math.ceil((fin - (Date.now() + offsetMs)) / 1000));
  }, [expiraIso, offsetMs]);

  const [segundos, setSegundos] = useState<number | null>(calcular);

  useEffect(() => {
    setSegundos(calcular());
    if (!expiraIso) return;
    const id = setInterval(() => {
      const s = calcular();
      setSegundos(s);
      if (s === null || s <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [calcular, expiraIso]);

  return segundos;
}

/** Copy del toast cuando otro pasajero tomó los asientos. */
export function mensajeAsientosTomados(asientos: readonly string[]): string {
  if (asientos.length === 0) return 'Uno de los asientos acaba de ser tomado. Elige otro.';
  return asientos.length === 1
    ? `El asiento ${asientos[0]} acaba de ser tomado. Elige otro.`
    : `Los asientos ${unirAsientos(asientos)} acaban de ser tomados. Elige otros.`;
}

// Fechas del pasajero (D4): siempre en hora de Venezuela y con `shared/ve.ts`.

/** "8:30 a. m." (hora de Venezuela). `''` si no es fecha. */
export function formatHora(iso: string | null | undefined): string {
  return iso ? formatHoraVE(iso) : '';
}

/** "mar. 3 nov." (día de Venezuela). `''` si no es fecha. */
export function formatDiaMes(iso: string | null | undefined): string {
  return iso ? formatDiaVE(iso) : '';
}

/** "mar. 3 nov. · 8:30 a. m." (salida de un viaje). `'—'` si no es fecha. */
export function formatSalidaCorta(iso: string | null | undefined): string {
  return (iso ? formatDiaHoraVE(iso) : '') || '—';
}

/** true si la salida ya ocurrió (sin fecha válida se considera que no). */
export function salidaYaOcurrio(iso: string | null | undefined, ahora = Date.now()): boolean {
  const t = iso ? Date.parse(iso) : NaN;
  return !Number.isNaN(t) && t <= ahora;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Aviso pendiente cuando la tasa BCV cambió entre la cotización y el registro. */
export interface TasaCambiada {
  /** Total en Bs que el usuario estaba viendo */
  anteriorBs: number | null;
  /** Total en Bs a la tasa nueva */
  nuevoBs: number;
  tasa: number;
  tasaFecha: string | null;
  /** Lo que el usuario declaró; se reutiliza al confirmar */
  declarado: PagoDeclarado;
}

interface OpcionesCheckout {
  viajeId: string | null | undefined;
  /** Compra ya existente (detalle de un boleto). Sin él se crea una por intento. */
  compraId?: string | null;
  /** Libera la reserva al desmontar si no terminó (por defecto, solo sin `compraId`). */
  liberarAlSalir?: boolean;
  /** El pago quedó registrado (también cuando la respuesta es `repetido`). */
  onExito?: (r: ResumenCompra) => void;
  /** `EB_ASIENTO_OCUPADO` al registrar el pago: la pantalla vuelve al selector. */
  onAsientosOcupados?: (asientos: string[]) => void;
  /** `EB_PAGO_YA_REGISTRADO`: ya hay un pago para esta compra (recibe la última reserva). */
  onPagoYaRegistrado?: (mensaje: string, reserva: ResumenReserva | null) => void;
  /**
   * `EB_DATOS_PASAJERO` al registrar el pago: falta el nombre o la cédula de
   * algún pasajero. La pantalla vuelve al paso "Pasajeros" marcando `asientos`.
   */
  onDatosPasajero?: (asientos: string[], mensaje: string) => void;
}

export interface CheckoutBoletos {
  compraId: string;
  /** Última respuesta de `fn_reservar_asientos` / `fn_checkout_boletos` */
  reserva: ResumenReserva | null;
  /** Asientos RESERVADO de la reserva activa, en orden */
  asientosApartados: string[];
  /** Monto a pagar (USD de referencia + Bs a la tasa con la que se cotizó) */
  cotizacion: CotizacionPago | null;
  /** `server_now - Date.now()` de la última respuesta */
  offsetServidor: number;
  /** Hay una RPC en curso (deshabilita "atrás" y los botones) */
  enCurso: boolean;
  /** Lectura síncrona de `enCurso` (para guardas fuera del render) */
  estaEnCurso: () => boolean;
  /** Aviso de `EB_TASA_CAMBIO` pendiente de respuesta del usuario */
  tasaCambiada: TasaCambiada | null;
  reservar: (asientos: string[]) => Promise<ResumenReserva>;
  /**
   * Guarda quién viaja en cada asiento apartado (`fn_asignar_pasajeros`).
   * Lanza el error de la RPC (`EB_DATOS_PASAJERO` trae `detail.asientos`).
   */
  asignarPasajeros: (pasajeros: PasajeroAsiento[]) => Promise<ResultadoAsignarPasajeros>;
  /** Llama a `fn_checkout_boletos`; lanza el error de la RPC. */
  registrarPago: (d: PagoDeclarado, opts?: { tasaEsperada?: number | null }) => Promise<ResumenCompra>;
  /**
   * Para `PaymentFlow.onRegistrar`: maneja `EB_TASA_CAMBIO`,
   * `EB_ASIENTO_OCUPADO`, `EB_DATOS_PASAJERO` (si la pantalla pasó
   * `onDatosPasajero`) y `EB_PAGO_YA_REGISTRADO` sin lanzar; el resto se lanza
   * para que el formulario marque el campo.
   */
  onRegistrar: (d: PagoDeclarado) => Promise<void>;
  /** "Registrar con el nuevo total": reintenta con la tasa nueva. Lanza otros errores. */
  confirmarTasaCambiada: () => Promise<void>;
  /** "Revisar": cierra el aviso; el formulario ya muestra el total nuevo. */
  descartarTasaCambiada: () => void;
  /** Compra existente: asientos RESERVADO y cotización a usar en el checkout. */
  fijarCompra: (c: { asientos: string[]; cotizacion: CotizacionPago | null }) => void;
  /** Suelta los asientos (mejor esfuerzo) y empieza una compra nueva. */
  liberar: () => Promise<void>;
  /** Conserva la reserva al salir ("Apartar y pagar en taquilla"). */
  conservar: () => void;
}

const asientosReservados = (r: ResumenCompra | null): string[] =>
  r ? ordenarAsientos(r.boletos.filter((b) => b.estado === 'RESERVADO').map((b) => b.asiento)) : [];

const cotizacionDe = (r: ResumenReserva): CotizacionPago => ({
  totalUsd: Number(r.total_usd) || 0,
  totalBs: r.total_bs == null ? null : Number(r.total_bs),
  tasa: r.tasa_bcv == null ? null : Number(r.tasa_bcv),
  tasaFecha: r.tasa_bcv_fecha ?? null,
});

const OCUPADO = 'Estamos procesando tu solicitud. Espera un momento.';

/** `detail.asientos` de un error `EB_*` (asientos tomados o sin datos del pasajero). */
export function asientosDelError(err: unknown): string[] {
  const { asientos } = parseDetalleEB(err);
  return Array.isArray(asientos) ? asientos.filter((a): a is string => typeof a === 'string') : [];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCheckoutBoletos({
  viajeId,
  compraId: compraExterna,
  liberarAlSalir,
  onExito,
  onAsientosOcupados,
  onPagoYaRegistrado,
  onDatosPasajero,
}: OpcionesCheckout): CheckoutBoletos {
  const externa = !!compraExterna;
  const debeLiberar = liberarAlSalir ?? !externa;

  const [compraId, setCompraId] = useState<string>(() => compraExterna || uuidv4());
  const [reserva, setReservaState] = useState<ResumenReserva | null>(null);
  const [cotizacion, setCotizacionState] = useState<CotizacionPago | null>(null);
  const [asientosExternos, setAsientosExternos] = useState<string[]>([]);
  const [offsetServidor, setOffsetServidor] = useState(0);
  const [enCurso, setEnCurso] = useState(false);
  const [tasaCambiada, setTasaCambiada] = useState<TasaCambiada | null>(null);

  // Refs: lo que leen las RPC y la limpieza al desmontar (siempre el valor actual).
  const compraRef = useRef(compraId);
  const viajeRef = useRef(viajeId);
  const reservaRef = useRef<ResumenReserva | null>(null);
  const cotizacionRef = useRef<CotizacionPago | null>(null);
  const asientosExternosRef = useRef<string[]>([]);
  const idemKeyRef = useRef(nuevaClaveIdempotencia());
  const enCursoRef = useRef(false);
  /** Hay asientos apartados por esta compra que habría que soltar al salir */
  const apartadaRef = useRef(false);
  /** La compra terminó (pago registrado o "pagar en taquilla"): no liberar */
  const conservadaRef = useRef(false);
  const montadoRef = useRef(true);
  const callbacksRef = useRef({ onExito, onAsientosOcupados, onPagoYaRegistrado, onDatosPasajero });
  callbacksRef.current = { onExito, onAsientosOcupados, onPagoYaRegistrado, onDatosPasajero };

  const setReserva = useCallback((r: ResumenReserva | null) => {
    reservaRef.current = r;
    setReservaState(r);
  }, []);

  const setCotizacion = useCallback((c: CotizacionPago | null) => {
    cotizacionRef.current = c;
    setCotizacionState(c);
  }, []);

  const nuevaCompra = useCallback(() => {
    if (externa) return;
    const id = uuidv4();
    compraRef.current = id;
    setCompraId(id);
    idemKeyRef.current = nuevaClaveIdempotencia();
  }, [externa]);

  const actualizarOffset = useCallback((serverNow: string | null | undefined) => {
    const t = serverNow ? Date.parse(serverNow) : NaN;
    if (!Number.isNaN(t)) setOffsetServidor(t - Date.now());
  }, []);

  /** Un solo RPC a la vez (anti doble toque); `enCurso` deshabilita la UI. */
  const ejecutar = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (enCursoRef.current) throw new AppError(OCUPADO);
    enCursoRef.current = true;
    setEnCurso(true);
    try {
      return await fn();
    } finally {
      enCursoRef.current = false;
      if (montadoRef.current) setEnCurso(false);
    }
  }, []);

  /** Suelta los asientos de `id` sin mostrar errores (nunca rechaza). */
  const liberarEnServidor = useCallback(async (id: string): Promise<void> => {
    try {
      const { error } = await supabase.rpc('fn_liberar_reserva', { p_compra_id: id });
      if (error && __DEV__) console.warn('[checkout] No se pudo liberar la reserva:', error.message);
    } catch (err: unknown) {
      // A propósito sin aviso: el usuario ya salió de la compra y, si esto
      // falla, el cron libera los asientos al vencer la reserva (30 min).
      if (__DEV__) console.warn('[checkout] No se pudo liberar la reserva:', err);
    }
  }, []);

  // ── Reservar ───────────────────────────────────────────────────────────────
  const reservar = useCallback(
    (asientos: string[]) =>
      ejecutar(async () => {
        const viaje = viajeRef.current;
        if (!viaje) throw new AppError('Elige una salida antes de apartar asientos.');
        const id = compraRef.current;
        // Antes de llamar: si la respuesta se pierde (red) pero el servidor sí
        // apartó, al salir igual se sueltan (liberar una compra vacía no hace nada).
        apartadaRef.current = true;
        conservadaRef.current = false;
        const { data, error } = await supabase.rpc('fn_reservar_asientos', {
          p_compra_id: id,
          p_viaje_id: viaje,
          p_asientos: ordenarAsientos(asientos),
        });
        if (error) throw error;

        const r = data as ResumenReserva;

        // La pantalla se cerró mientras se apartaban: no dejarlos retenidos.
        if (!montadoRef.current) {
          if (debeLiberar) void liberarEnServidor(id);
          return r;
        }
        actualizarOffset(r.server_now);
        setReserva(r);
        setCotizacion(cotizacionDe(r));
        return r;
      }),
    [ejecutar, debeLiberar, liberarEnServidor, actualizarOffset, setReserva, setCotizacion]
  );

  // ── Pasajeros de cada asiento ──────────────────────────────────────────────
  const asignarPasajeros = useCallback(
    (pasajeros: PasajeroAsiento[]) =>
      ejecutar(async () => {
        if (pasajeros.length === 0) {
          throw new AppError('Tu reserva ya no tiene asientos apartados. Vuelve a elegirlos.');
        }
        const { data, error } = await supabase.rpc('fn_asignar_pasajeros', {
          p_compra_id: compraRef.current,
          p_pasajeros: pasajeros.map((p) => ({
            asiento: p.asiento,
            nombre: p.nombre,
            cedula: p.cedula,
            telefono: p.telefono ?? null,
          })),
        });
        if (error) throw error;

        const r = data as ResultadoAsignarPasajeros;
        if (montadoRef.current) {
          actualizarOffset(r.server_now);
          // Se conserva la cotización de la reserva (esta RPC no trae la tasa).
          const previa = reservaRef.current;
          if (previa) setReserva({ ...previa, ...r });
        }
        return r;
      }),
    [ejecutar, actualizarOffset, setReserva]
  );

  // ── Registrar el pago ──────────────────────────────────────────────────────
  const registrarPago = useCallback(
    (d: PagoDeclarado, opts: { tasaEsperada?: number | null } = {}) =>
      ejecutar(async () => {
        const viaje = viajeRef.current;
        const asientos = externa ? asientosExternosRef.current : asientosReservados(reservaRef.current);
        if (!viaje || asientos.length === 0) {
          throw new AppError('Tu reserva ya no tiene asientos apartados. Vuelve a elegirlos.');
        }
        const tasaEsperada =
          opts.tasaEsperada !== undefined ? opts.tasaEsperada : (cotizacionRef.current?.tasa ?? null);

        const { data, error } = await supabase.rpc('fn_checkout_boletos', {
          p_compra_id: compraRef.current,
          p_viaje_id: viaje,
          p_asientos: asientos,
          p_metodo_pago_id: d.metodo_pago_id,
          p_numero_referencia: d.numero_referencia,
          p_fecha_transaccion: d.fecha_transaccion,
          p_banco_emisor: d.banco_emisor,
          p_monto_declarado: d.monto_declarado,
          p_tasa_esperada: tasaEsperada,
          p_idempotency_key: idemKeyRef.current,
        });
        if (error) throw error;

        const r = data as ResumenCompra;
        idemKeyRef.current = nuevaClaveIdempotencia();
        conservadaRef.current = true;
        if (montadoRef.current) {
          actualizarOffset(r.server_now);
          const previa = reservaRef.current;
          if (previa) setReserva({ ...previa, ...r });
        }
        return r;
      }),
    [ejecutar, externa, actualizarOffset, setReserva]
  );

  /** Aplica la tasa nueva que mandó el servidor en `EB_TASA_CAMBIO`. */
  const aplicarTasaNueva = useCallback(
    (err: unknown, declarado: PagoDeclarado) => {
      const det = parseDetalleEB(err);
      const tasa = Number(det.tasa);
      const nuevoBs = Number(det.total_bs);
      const actual = cotizacionRef.current;
      if (!(tasa > 0) || !(nuevoBs > 0)) return false;
      setTasaCambiada({
        anteriorBs: actual?.totalBs ?? null,
        nuevoBs,
        tasa,
        tasaFecha: typeof det.tasa_fecha === 'string' ? det.tasa_fecha : (actual?.tasaFecha ?? null),
        declarado,
      });
      setCotizacion({
        totalUsd: Number(det.total_usd) > 0 ? Number(det.total_usd) : (actual?.totalUsd ?? 0),
        totalBs: nuevoBs,
        tasa,
        tasaFecha: typeof det.tasa_fecha === 'string' ? det.tasa_fecha : (actual?.tasaFecha ?? null),
      });
      return true;
    },
    [setCotizacion]
  );

  /** Errores que la pantalla resuelve sin volver al formulario. true = manejado. */
  const manejarErrorConocido = useCallback(
    (err: unknown, declarado: PagoDeclarado): boolean => {
      const codigo = codigoEB(err);
      const {
        onAsientosOcupados: ocupados,
        onPagoYaRegistrado: yaRegistrado,
        onDatosPasajero: datosPasajero,
      } = callbacksRef.current;
      if (codigo === 'EB_TASA_CAMBIO') return aplicarTasaNueva(err, declarado);
      if (codigo === 'EB_ASIENTO_OCUPADO' && ocupados) {
        ocupados(asientosDelError(err));
        return true;
      }
      if (codigo === 'EB_DATOS_PASAJERO' && datosPasajero) {
        datosPasajero(asientosDelError(err), humanizeError(err, 'pago'));
        return true;
      }
      if (codigo === 'EB_PAGO_YA_REGISTRADO' && yaRegistrado) {
        const hint = (err as { hint?: unknown }).hint;
        yaRegistrado(
          typeof hint === 'string' && hint
            ? hint
            : 'Ya registraste un pago para esta compra. Revisa tus boletos en Mis boletos.',
          reservaRef.current
        );
        conservadaRef.current = true;
        return true;
      }
      return false;
    },
    [aplicarTasaNueva]
  );

  const onRegistrar = useCallback(
    async (d: PagoDeclarado) => {
      try {
        const r = await registrarPago(d);
        callbacksRef.current.onExito?.(r);
      } catch (err) {
        if (manejarErrorConocido(err, d)) return;
        throw err;
      }
    },
    [registrarPago, manejarErrorConocido]
  );

  const confirmarTasaCambiada = useCallback(async () => {
    const pendiente = tasaCambiada;
    if (!pendiente) return;
    try {
      const r = await registrarPago(pendiente.declarado, { tasaEsperada: pendiente.tasa });
      setTasaCambiada(null);
      callbacksRef.current.onExito?.(r);
    } catch (err) {
      // Otra vez cambió la tasa: el aviso se actualiza con el total nuevo.
      if (codigoEB(err) === 'EB_TASA_CAMBIO' && aplicarTasaNueva(err, pendiente.declarado)) return;
      setTasaCambiada(null);
      if (manejarErrorConocido(err, pendiente.declarado)) return;
      throw err;
    }
  }, [tasaCambiada, registrarPago, aplicarTasaNueva, manejarErrorConocido]);

  const descartarTasaCambiada = useCallback(() => setTasaCambiada(null), []);

  const fijarCompra = useCallback(
    ({ asientos, cotizacion: c }: { asientos: string[]; cotizacion: CotizacionPago | null }) => {
      asientosExternosRef.current = ordenarAsientos(asientos);
      setAsientosExternos(asientosExternosRef.current);
      setCotizacion(c);
    },
    [setCotizacion]
  );

  // ── Liberar / conservar ────────────────────────────────────────────────────
  const liberar = useCallback(async () => {
    const id = compraRef.current;
    const habia = apartadaRef.current && !conservadaRef.current;
    apartadaRef.current = false;
    conservadaRef.current = false;
    setReserva(null);
    setCotizacion(null);
    setTasaCambiada(null);
    nuevaCompra();
    // Se espera la respuesta para que la pantalla pueda releer los asientos ya libres.
    if (habia && !externa) await liberarEnServidor(id);
  }, [externa, nuevaCompra, liberarEnServidor, setReserva, setCotizacion]);

  const conservar = useCallback(() => {
    conservadaRef.current = true;
  }, []);

  // ── Cambio de viaje: la compra anterior no sirve para otro viaje ───────────
  useEffect(() => {
    if (viajeRef.current === viajeId) return;
    viajeRef.current = viajeId;
    if (!externa) void liberar();
  }, [viajeId, externa, liberar]);

  useEffect(() => {
    if (externa && compraExterna && compraRef.current !== compraExterna) {
      compraRef.current = compraExterna;
      setCompraId(compraExterna);
    }
  }, [externa, compraExterna]);

  // ── Salir sin terminar: soltar los asientos ────────────────────────────────
  const salida = useRef({ debeLiberar, liberarEnServidor });
  salida.current = { debeLiberar, liberarEnServidor };
  useEffect(() => {
    montadoRef.current = true;
    const refs = { montadoRef, apartadaRef, conservadaRef, compraRef, salida };
    return () => {
      refs.montadoRef.current = false;
      const { debeLiberar: liberarAhora, liberarEnServidor: soltar } = refs.salida.current;
      if (liberarAhora && refs.apartadaRef.current && !refs.conservadaRef.current) {
        void soltar(refs.compraRef.current);
      }
    };
  }, []);

  const estaEnCurso = useCallback(() => enCursoRef.current, []);

  return {
    compraId,
    reserva,
    asientosApartados: externa ? asientosExternos : asientosReservados(reserva),
    cotizacion,
    offsetServidor,
    enCurso,
    estaEnCurso,
    tasaCambiada,
    reservar,
    asignarPasajeros,
    registrarPago,
    onRegistrar,
    confirmarTasaCambiada,
    descartarTasaCambiada,
    fijarCompra,
    liberar,
    conservar,
  };
}
