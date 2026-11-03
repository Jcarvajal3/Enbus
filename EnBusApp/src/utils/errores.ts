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

export type { DetalleEB };

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

const MSG = {
  generico: 'Algo salió mal. Intenta de nuevo en unos segundos.',
  red: 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.',
  timeout: 'La conexión está tardando demasiado. Revisa tu señal e intenta de nuevo.',
  servidor: 'El servicio no responde en este momento. Intenta de nuevo en unos minutos.',
  credenciales: 'Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña.',
  correoSinConfirmar:
    'Confirma tu correo: te enviamos un enlace a tu bandeja de entrada (revisa también Spam).',
  cuentaExiste: 'Ya existe una cuenta con este correo. Inicia sesión.',
  correoInvalido: 'Ese correo no parece válido. Revísalo e intenta de nuevo.',
  claveIgual: 'La nueva contraseña debe ser distinta a la anterior.',
  sesionExpirada: 'Tu sesión expiró. Inicia sesión de nuevo.',
  enlaceVencido: 'El enlace venció o ya se usó. Pide uno nuevo.',
  cuentaSuspendida: 'Tu cuenta está suspendida. Contacta a soporte para revisarla.',
  registroCerrado: 'El registro no está disponible en este momento. Intenta más tarde.',
  usuarioNoExiste: 'No encontramos una cuenta con ese correo. Revísalo o regístrate.',
  demasiadosIntentos: 'Hiciste demasiados intentos. Espera un minuto y vuelve a intentarlo.',
  enlaceReciente: 'Ya pediste un enlace hace poco. Espera 1 minuto y vuelve a intentarlo.',
  asientoTomado: 'Ese asiento acaba de ser tomado. Elige otro.',
  yaCalificaste: 'Ya calificaste este viaje.',
  telefonoDuplicado: 'Ese teléfono ya está registrado en otra cuenta.',
  cedulaDuplicada: 'Esa cédula o RIF ya está registrada en otra cuenta.',
  duplicado: 'Ese registro ya existe.',
  referenciaRota:
    'No pudimos guardar porque un dato relacionado ya no existe. Actualiza la pantalla e intenta de nuevo.',
  datoFaltante: 'Falta completar un dato obligatorio. Revisa el formulario.',
  datoInvalido: 'Algún dato no es válido. Revísalo e intenta de nuevo.',
  sinPermiso: 'No tienes permiso para hacer esto. Si crees que es un error, inicia sesión de nuevo.',
  noEncontrado: 'No encontramos lo que buscas. Puede que ya no esté disponible.',
  estadoCambiado: 'Esto cambió de estado hace un momento. Actualiza la pantalla e intenta de nuevo.',
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
  | 'EB_DEMASIADOS_INTENTOS';

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
      if (asientos.length === 0) return MSG.asientoTomado;
      return asientos.length === 1
        ? `El asiento ${asientos[0]} ya no está disponible. Elige otro.`
        : `Los asientos ${listaAsientos(asientos)} ya no están disponibles. Elige otros.`;
    }
    case 'EB_OPERACION_NO_PERMITIDA':
      return 'Esta acción la hace la cooperativa.';
    case 'EB_NO_AUTENTICADO':
      return MSG.sesionExpirada;
    default:
      return null;
  }
}

/** Texto si un `EB_*` llega sin `hint` (no debería pasar, pero nunca mostramos el código). */
function respaldoEB(codigo: CodigoEB): string {
  switch (codigo) {
    case 'EB_SIN_PERMISO':
      return MSG.sinPermiso;
    case 'EB_NO_ENCONTRADO':
      return MSG.noEncontrado;
    case 'EB_ESTADO_CAMBIO':
      return MSG.estadoCambiado;
    case 'EB_DEMASIADOS_INTENTOS':
      return 'Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
    default:
      return MSG.generico;
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
  if (isNetworkError(err)) return esTimeout(info) ? MSG.timeout : MSG.red;

  // ── Supabase Auth ──────────────────────────────────────────────────────────
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return MSG.credenciales;
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return MSG.correoSinConfirmar;
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    msg.includes('already registered') ||
    msg.includes('already been registered')
  ) {
    return MSG.cuentaExiste;
  }
  if (
    code === 'weak_password' ||
    info.name === 'AuthWeakPasswordError' ||
    /password should|weak password|password is too weak|password.*at least/.test(msg)
  ) {
    const min = msg.match(/at least (\d+) characters/)?.[1] ?? '6';
    return `La contraseña es muy débil. Usa al menos ${min} caracteres, combinando letras y números.`;
  }
  if (code === 'same_password' || msg.includes('should be different from the old password')) {
    return MSG.claveIgual;
  }
  if (
    code === 'email_address_invalid' ||
    (code === 'validation_failed' && msg.includes('email')) ||
    msg.includes('unable to validate email address')
  ) {
    return MSG.correoInvalido;
  }
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
      ? MSG.enlaceReciente
      : MSG.demasiadosIntentos;
  }
  if (code === 'otp_expired' || msg.includes('link is invalid or has expired')) {
    return MSG.enlaceVencido;
  }
  // PKCE: el código ya se canjeó, venció o se abrió en otro teléfono/navegador
  // (falta el code verifier que guardó la app al pedir el enlace).
  if (
    code === 'flow_state_not_found' ||
    code === 'flow_state_expired' ||
    code === 'bad_code_verifier' ||
    code === 'bad_oauth_state' ||
    code === 'bad_oauth_callback' ||
    info.name === 'AuthPKCEGrantCodeExchangeError' ||
    /code verifier|flow state|auth code|invalid grant|code challenge/.test(msg)
  ) {
    return MSG.enlaceVencido;
  }
  if (
    code === 'session_expired' ||
    code === 'session_not_found' ||
    code === 'refresh_token_not_found' ||
    code === 'refresh_token_already_used' ||
    code === 'bad_jwt' ||
    code === 'invalid_jwt' ||
    code === 'PGRST301' || // PostgREST: JWT invalid/expired
    code === 'PGRST303' ||
    info.name === 'AuthSessionMissingError' ||
    /jwt expired|invalid refresh token|auth session missing/.test(msg)
  ) {
    return MSG.sesionExpirada;
  }
  if (code === 'user_banned') return MSG.cuentaSuspendida;
  if (code === 'signup_disabled') return MSG.registroCerrado;
  if (code === 'user_not_found') return MSG.usuarioNoExiste;

  // ── Postgres / PostgREST ───────────────────────────────────────────────────
  if (code === '23505') {
    const detalle = `${msg} ${info.details.toLowerCase()}`;
    if (contexto === 'asiento' || detalle.includes('asiento')) return MSG.asientoTomado;
    if (contexto === 'calificacion' || detalle.includes('calificaciones')) return MSG.yaCalificaste;
    if (detalle.includes('telefono')) return MSG.telefonoDuplicado;
    if (detalle.includes('cedula')) return MSG.cedulaDuplicada;
    return MSG.duplicado;
  }
  if (code === '23503') return MSG.referenciaRota;
  if (code === '23502') return MSG.datoFaltante;
  if (code === '23514' || code === '22P02' || code === '22001' || code === '22003') {
    return MSG.datoInvalido;
  }
  if (code === '42501' || msg.includes('row-level security')) return MSG.sinPermiso;
  if (code === 'PGRST116') return MSG.noEncontrado;
  // State-machine triggers (RAISE EXCEPTION in the transition guards)
  if (msg.includes('transición no válida') || msg.includes('estado terminal')) {
    return MSG.estadoCambiado;
  }

  // ── Storage / own upload helpers ───────────────────────────────────────────
  if (
    info.status === 413 ||
    msg.includes('payload too large') ||
    msg.includes('maximum allowed size') ||
    msg.includes('demasiado grande')
  ) {
    return MSG.archivoGrande;
  }
  if (msg.includes('el archivo de imagen no existe')) return MSG.archivoIlegible;

  // ── HTTP fallbacks ─────────────────────────────────────────────────────────
  if (info.status === 401) return MSG.sesionExpirada;
  if (info.status === 403) return MSG.sinPermiso;
  if (info.status !== undefined && info.status >= 500) return MSG.servidor;

  // Un enlace de correo o de Google que no se pudo canjear: casi siempre venció
  // o ya se usó; la salida es pedir otro.
  if (contexto === 'auth') return MSG.enlaceVencido;

  return MSG.generico;
}
