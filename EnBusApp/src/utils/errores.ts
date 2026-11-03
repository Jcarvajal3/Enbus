/**
 * APP-04 / M-03: Human-readable error messages.
 *
 * Supabase (Auth, PostgREST, Storage) and `fetch` reject with English,
 * technical messages ("Invalid login credentials", "duplicate key value…").
 * Screens must never show those. Every `catch` that surfaces an error to the
 * user goes through `humanizeError(err, contexto)`:
 *
 *   } catch (err) {
 *     if (__DEV__) console.error('[login]', err);
 *     toast.show('error', humanizeError(err, 'login'));
 *   }
 *
 * Unknown errors fall back to a generic, actionable message — the raw text is
 * never returned. Log the original error yourself if you need it.
 */

import type { DetalleEB } from '@/src/types';
import { MSG as COMUN, mensajeAuth, mensajePostgres } from './errores.generated';

export type { DetalleEB };
// Catálogo común con el panel y la landing (shared/errores.ts).
export { COMUN as MSG, mensajeAuth, mensajePostgres };
export type { CatalogoMensajes } from './errores.generated';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Where the error happened. Changes the wording for ambiguous codes
 * (e.g. a duplicate key is a taken seat while booking, a duplicate rating
 * while rating). Any other string is accepted and treated as generic.
 */
export type ContextoError =
  | 'login'
  | 'registro'
  | 'recuperar'
  | 'perfil'
  | 'asiento'
  | 'pago'
  | 'calificacion'
  | 'encomienda'
  | 'carga'
  /** Enlaces de correo y acceso con Google (`auth/callback`, `revisa-correo`) */
  | 'auth'
  | (string & {});

/**
 * An error whose message is already written for the user (Spanish, actionable).
 * Throw it from app code when the message should reach the screen as-is.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

// ─── Copy ─────────────────────────────────────────────────────────────────────
// Los textos comunes salen de shared/errores.ts (mismo texto en app, panel y landing);
// aquí solo quedan los propios de la app.

const TEXTO = {
  generico: COMUN.generico,
  red: COMUN.sinRed,
  timeout: COMUN.tiempoAgotado,
  servidor: COMUN.servidor,
  sesionExpirada: COMUN.sesionVencida,
  enlaceVencido: COMUN.enlaceVencido,
  enlaceReciente: COMUN.enlaceReciente,
  demasiadosIntentos: COMUN.demasiadosIntentos,
  telefonoDuplicado: COMUN.telefonoDuplicado,
  cedulaDuplicada: COMUN.cedulaDuplicada,
  duplicado: COMUN.duplicado,
  sinPermiso: COMUN.sinPermiso,
  noEncontrado: COMUN.noEncontrado,
  estadoCambiado: COMUN.estadoCambiado,
  asientoTomado: 'Ese asiento acaba de ser tomado. Elige otro.',
  yaCalificaste: 'Ya calificaste este viaje.',
  archivoGrande: 'La imagen es demasiado grande. El tamaño máximo es 10 MB.',
  archivoIlegible: 'No pudimos leer la imagen. Selecciónala de nuevo.',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ErrorInfo {
  message: string;
  code: string;
  name: string;
  status?: number;
  /** `details` + `hint`, for keyword matching */
  details: string;
  /** PostgREST `hint` alone (the user-facing text of an `EB_*` error) */
  hint: string;
}

const VACIO: ErrorInfo = { message: '', code: '', name: '', details: '', hint: '' };

/** Normalises Error, AuthError, PostgrestError, StorageError and plain objects. */
function leerError(err: unknown): ErrorInfo {
  if (typeof err === 'string') return { ...VACIO, message: err };
  if (!err || typeof err !== 'object') return VACIO;

  const e = err as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const rawStatus = e.status ?? e.statusCode;
  const status =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string' && /^\d+$/.test(rawStatus)
        ? Number(rawStatus)
        : undefined;

  return {
    message: str(e.message),
    code: typeof e.code === 'number' ? String(e.code) : str(e.code),
    name: str(e.name),
    status,
    details: `${str(e.details)} ${str(e.hint)}`,
    hint: str(e.hint).trim(),
  };
}

// ─── Errores de negocio de las RPC (EB_*) ─────────────────────────────────────

/**
 * Las RPC fallan con `{ code: 'P0001', message: 'EB_<CODIGO>', hint: '<texto
 * para el usuario>', details: '<json>' }`; los triggers de protección usan
 * `code: '42501'` y `message: 'EB_OPERACION_NO_PERMITIDA' | 'EB_SIN_PERMISO'`.
 */
export type CodigoEB =
  | 'EB_NO_AUTENTICADO'
  | 'EB_SIN_PERMISO'
  | 'EB_OPERACION_NO_PERMITIDA'
  | 'EB_DATOS_INVALIDOS'
  | 'EB_DATOS_PAGO_INVALIDOS'
  | 'EB_ASIENTO_INVALIDO'
  | 'EB_ASIENTO_OCUPADO'
  | 'EB_VIAJE_NO_DISPONIBLE'
  | 'EB_PRECIO_NO_DEFINIDO'
  | 'EB_PAGO_YA_REGISTRADO'
  | 'EB_PAGO_EN_VERIFICACION'
  | 'EB_PAGO_PENDIENTE_EXISTE'
  | 'EB_PAGO_YA_RESUELTO'
  | 'EB_METODO_INVALIDO'
  | 'EB_REFERENCIA_REPETIDA'
  | 'EB_TASA_NO_DISPONIBLE'
  | 'EB_TASA_CAMBIO'
  | 'EB_TASA_INVALIDA'
  | 'EB_TASA_SOSPECHOSA'
  | 'EB_MONTO_INSUFICIENTE'
  | 'EB_MOTIVO_REQUERIDO'
  | 'EB_NO_ENCONTRADO'
  | 'EB_ESTADO_CAMBIO'
  | 'EB_VIAJE_YA_SALIO'
  | 'EB_EMBARQUE_NO_VALIDO'
  | 'EB_BOLETOS_NO_ACTIVABLES'
  | 'EB_COBRO_PENDIENTE'
  | 'EB_COSTO_PENDIENTE'
  | 'EB_TARIFA_NO_DISPONIBLE'
  | 'EB_PESO_INVALIDO'
  | 'EB_SIN_RUTA'
  | 'EB_VIAJE_REQUERIDO'
  | 'EB_DESPACHO_INVALIDO'
  // Fase 3 (§3.1): el `hint` del servidor ya trae el texto para el usuario.
  | 'EB_DATOS_PASAJERO'
  | 'EB_PAGOS_PENDIENTES'
  | 'EB_SUCURSAL_REQUERIDA'
  | 'EB_CEDULA_NO_VERIFICADA'
  | 'EB_PIN_BLOQUEADO'
  | 'EB_PIN_INCORRECTO'
  | 'EB_DEMASIADOS_REPORTES'
  // Fase 4 (§3.1)
  | 'EB_PIN_NO_VALIDADO'
  /** `fn_eliminar_mi_cuenta`: detalle `{boletos, pagos, encomiendas_enviadas, encomiendas_por_recibir, reembolsos}` */
  | 'EB_CUENTA_CON_ACTIVIDAD'
  /** Solo de cliente: lo devuelven las server actions cuando `fn_consumir_limite` dice `permitido:false` */
  | 'EB_DEMASIADOS_INTENTOS'
  /** Edge function `eliminar-cuenta`: la baja quedó hecha pero la identidad de Auth no se borró aún */
  | 'EB_BAJA_PENDIENTE';

/**
 * Errores de `supabase.functions.invoke`: llegan como `FunctionsHttpError` con
 * el mensaje genérico "Edge Function returned a non-2xx status code" y el cuerpo
 * de la respuesta (`{ error: 'EB_…', hint: '<texto para el usuario>' }`) sin leer
 * en `error.context` (un `Response`). Esto lo lee y devuelve un error con la
 * misma forma que el de una RPC (`message` = código, `hint` = texto), para que
 * `codigoEB` y `humanizeError` funcionen igual. Nunca lanza: si no hay cuerpo
 * legible devuelve el error original.
 */
export async function errorDeFuncion(err: unknown): Promise<unknown> {
  const contexto = (err as { context?: unknown } | null)?.context as
    | { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> }; status?: number }
    | undefined;
  if (!contexto || typeof contexto.json !== 'function') return err;
  try {
    const cuerpo = (await (contexto.clone ? contexto.clone().json() : contexto.json())) as
      | { error?: unknown; hint?: unknown; details?: unknown }
      | null;
    if (!cuerpo || typeof cuerpo !== 'object') return err;
    const codigo = typeof cuerpo.error === 'string' ? cuerpo.error : '';
    const hint = typeof cuerpo.hint === 'string' ? cuerpo.hint : '';
    if (!codigo && !hint) return err;
    return {
      message: codigo || (err as { message?: string }).message || '',
      hint,
      details: typeof cuerpo.details === 'string' ? cuerpo.details : '',
      status: contexto.status,
      name: 'FunctionsHttpError',
    };
  } catch {
    return err;
  }
}

/** `'EB_ASIENTO_OCUPADO'` si `err` es un error de negocio de una RPC; si no, `null`. */
export function codigoEB(err: unknown): CodigoEB | null {
  const { message } = leerError(err);
  return /^EB_[A-Z_]+$/.test(message.trim()) ? (message.trim() as CodigoEB) : null;
}

/** true si `err` es el error `EB_*` indicado. */
export function esErrorEB(err: unknown, codigo: CodigoEB): boolean {
  return codigoEB(err) === codigo;
}

/**
 * Lee el JSON de `details` de un error `EB_*` sin lanzar nunca: devuelve `{}`
 * si no hay detalle o no es un objeto JSON válido.
 *
 *   const { campo } = parseDetalleEB(err);   // 'referencia' | 'banco' | …
 */
export function parseDetalleEB(err: unknown): DetalleEB {
  if (!err || typeof err !== 'object') return {};
  const details = (err as Record<string, unknown>).details;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return details as DetalleEB;
  }
  if (typeof details !== 'string' || !details.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(details);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as DetalleEB) : {};
  } catch {
    return {};
  }
}

const listaAsientos = (asientos: string[]) =>
  asientos.length <= 1
    ? asientos.join('')
    : `${asientos.slice(0, -1).join(', ')} y ${asientos[asientos.length - 1]}`;

/**
 * Texto propio de la app para algunos códigos. Los demás muestran el `hint`
 * que manda el servidor (ya escrito para el usuario).
 */
function mensajeEB(codigo: CodigoEB, detalle: DetalleEB): string | null {
  switch (codigo) {
    case 'EB_ASIENTO_OCUPADO': {
      const asientos = Array.isArray(detalle.asientos)
        ? detalle.asientos.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
        : [];
      if (asientos.length === 0) return TEXTO.asientoTomado;
      return asientos.length === 1
        ? `El asiento ${asientos[0]} ya no está disponible. Elige otro.`
        : `Los asientos ${listaAsientos(asientos)} ya no están disponibles. Elige otros.`;
    }
    case 'EB_OPERACION_NO_PERMITIDA':
      return 'Esta acción la hace la cooperativa.';
    case 'EB_NO_AUTENTICADO':
      return TEXTO.sesionExpirada;
    default:
      return null;
  }
}

/** Texto si un `EB_*` llega sin `hint` (no debería pasar, pero nunca mostramos el código). */
function respaldoEB(codigo: CodigoEB): string {
  switch (codigo) {
    case 'EB_SIN_PERMISO':
      return TEXTO.sinPermiso;
    case 'EB_NO_ENCONTRADO':
      return TEXTO.noEncontrado;
    case 'EB_ESTADO_CAMBIO':
      return TEXTO.estadoCambiado;
    case 'EB_DEMASIADOS_INTENTOS':
      return TEXTO.demasiadosIntentos;
    default:
      return TEXTO.generico;
  }
}

const NETWORK_RE =
  /network request failed|failed to fetch|networkerror|network error|load failed|internet connection appears to be offline|econnrefused|enotfound|socket hang up/i;
const TIMEOUT_RE = /timed? ?out|timeout|aborterror|the operation was aborted/i;

function esTimeout(info: ErrorInfo): boolean {
  return (
    info.code === 'request_timeout' ||
    info.code === '57014' || // Postgres statement_timeout
    info.status === 408 ||
    info.status === 504 ||
    TIMEOUT_RE.test(info.message) ||
    info.name === 'AbortError' ||
    info.name === 'TimeoutError'
  );
}

/** True when the request never reached the server (offline, DNS, timeout). */
export function isNetworkError(err: unknown): boolean {
  const info = leerError(err);
  return (
    info.name === 'AuthRetryableFetchError' ||
    NETWORK_RE.test(info.message) ||
    NETWORK_RE.test(info.details) ||
    esTimeout(info)
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Translates any thrown value into a short Spanish message the user can act on.
 * Never returns the raw technical message.
 */
export function humanizeError(err: unknown, contexto?: ContextoError): string {
  if (err instanceof AppError) return err.message;

  const info = leerError(err);

  // Errores de negocio de las RPC: texto propio si lo hay; si no, el `hint`.
  const eb = codigoEB(err);
  if (eb) return mensajeEB(eb, parseDetalleEB(err)) ?? (info.hint || respaldoEB(eb));

  const msg = info.message.toLowerCase();
  const code = info.code;

  // Network first: offline errors come wrapped in every client.
  if (isNetworkError(err)) return esTimeout(info) ? TEXTO.timeout : TEXTO.red;

  // ── Supabase Auth (catálogo común) ─────────────────────────────────────────
  // "For security purposes, you can only request this after 42 seconds."
  const espera = msg.match(/for security purposes.*?after (\d+) seconds?/);
  if (espera) {
    return `Por seguridad, espera ${espera[1]} segundos antes de intentarlo de nuevo.`;
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    code === 'over_sms_send_rate_limit' ||
    info.status === 429 ||
    msg.includes('rate limit')
  ) {
    return contexto === 'recuperar' || code === 'over_email_send_rate_limit'
      ? TEXTO.enlaceReciente
      : TEXTO.demasiadosIntentos;
  }
  if (info.name === 'AuthWeakPasswordError') return COMUN.claveCorta;
  if (code === 'validation_failed' && msg.includes('email')) return COMUN.correoInvalido;
  if (info.name === 'AuthPKCEGrantCodeExchangeError') return TEXTO.enlaceVencido;
  if (info.name === 'AuthSessionMissingError') return TEXTO.sesionExpirada;
  const auth = mensajeAuth(code) ?? mensajeAuth(info.message);
  if (auth) return auth;

  // ── Postgres / PostgREST ───────────────────────────────────────────────────
  if (code === '23505') {
    const detalle = `${msg} ${info.details.toLowerCase()}`;
    if (contexto === 'asiento' || detalle.includes('asiento')) return TEXTO.asientoTomado;
    if (contexto === 'calificacion' || detalle.includes('calificaciones')) return TEXTO.yaCalificaste;
    if (detalle.includes('telefono')) return TEXTO.telefonoDuplicado;
    if (detalle.includes('cedula')) return TEXTO.cedulaDuplicada;
    return TEXTO.duplicado;
  }
  const postgres = mensajePostgres(code);
  if (postgres) return postgres;
  if (msg.includes('row-level security')) return TEXTO.sinPermiso;
  // State-machine triggers (RAISE EXCEPTION in the transition guards)
  if (msg.includes('transición no válida') || msg.includes('estado terminal')) {
    return TEXTO.estadoCambiado;
  }

  // ── Storage / own upload helpers ───────────────────────────────────────────
  if (
    info.status === 413 ||
    msg.includes('payload too large') ||
    msg.includes('maximum allowed size') ||
    msg.includes('demasiado grande')
  ) {
    return TEXTO.archivoGrande;
  }
  if (msg.includes('el archivo de imagen no existe')) return TEXTO.archivoIlegible;

  // ── HTTP fallbacks ─────────────────────────────────────────────────────────
  if (info.status === 401) return TEXTO.sesionExpirada;
  if (info.status === 403) return TEXTO.sinPermiso;
  if (info.status !== undefined && info.status >= 500) return TEXTO.servidor;

  // Un enlace de correo o de Google que no se pudo canjear: casi siempre venció
  // o ya se usó; la salida es pedir otro.
  if (contexto === 'auth') return TEXTO.enlaceVencido;

  return TEXTO.generico;
}
