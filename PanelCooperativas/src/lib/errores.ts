// ─── Traducción de errores para el usuario ──────────────────────────────────
// Convierte errores de Supabase Auth, Postgres, PostgREST y de red en mensajes
// claros en español. Nunca devuelve el texto técnico crudo: si el error no se
// reconoce, devuelve un mensaje genérico y accionable.
//
// Uso en server actions:
//   if (error) return { error: humanizeError(error, "guardar la ruta") };
// Uso en clientes:
//   toast.error(humanizeError(err, { accion: "enviar el enlace", email }));

export type ContextoError =
  | string
  | {
      /** Acción en infinitivo para el mensaje genérico, p. ej. "guardar la ruta". */
      accion?: string;
      /** Correo del usuario, para personalizar el aviso de confirmación. */
      email?: string;
    };

type ErrorNormalizado = {
  message: string;
  code: string;
  status?: number;
  details: string;
  /** `hint` de Postgres: en los errores EB_* es el texto para el usuario. */
  hint: string;
  name: string;
};

const MSG_RED = "No pudimos conectarnos. Revisa tu conexión a internet e intenta de nuevo.";
const MSG_INTERNO =
  "Tuvimos un problema interno al procesar tu solicitud. Intenta de nuevo en unos minutos; si sigue pasando, avísanos.";

function normalizar(err: unknown): ErrorNormalizado {
  if (typeof err === "string") {
    return { message: err, code: "", details: "", hint: "", name: "" };
  }
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const status = typeof e.status === "number" ? e.status : undefined;
    return {
      message: typeof e.message === "string" ? e.message : "",
      code: typeof e.code === "string" ? e.code : "",
      status,
      details: [e.details, e.hint].filter((v) => typeof v === "string").join(" "),
      hint: typeof e.hint === "string" ? e.hint : "",
      name: typeof e.name === "string" ? e.name : "",
    };
  }
  return { message: "", code: "", details: "", hint: "", name: "" };
}

// ─── Errores de negocio de las RPC (fase 2) ─────────────────────────────────
// Las RPC fallan con { code: 'P0001', message: 'EB_<CODIGO>', hint: '<texto para
// el usuario>', details: '<json>' }. Por defecto se muestra el `hint`; este mapa
// solo sobrescribe los casos en que el panel necesita un texto propio.
export type CodigoEB =
  | "EB_NO_AUTENTICADO"
  | "EB_SIN_PERMISO"
  | "EB_OPERACION_NO_PERMITIDA"
  | "EB_DATOS_INVALIDOS"
  | "EB_DATOS_PAGO_INVALIDOS"
  | "EB_ASIENTO_INVALIDO"
  | "EB_ASIENTO_OCUPADO"
  | "EB_VIAJE_NO_DISPONIBLE"
  | "EB_PRECIO_NO_DEFINIDO"
  | "EB_PAGO_YA_REGISTRADO"
  | "EB_PAGO_EN_VERIFICACION"
  | "EB_PAGO_PENDIENTE_EXISTE"
  | "EB_PAGO_YA_RESUELTO"
  | "EB_METODO_INVALIDO"
  | "EB_REFERENCIA_REPETIDA"
  | "EB_TASA_NO_DISPONIBLE"
  | "EB_TASA_CAMBIO"
  | "EB_TASA_INVALIDA"
  | "EB_TASA_SOSPECHOSA"
  | "EB_MONTO_INSUFICIENTE"
  | "EB_MOTIVO_REQUERIDO"
  | "EB_NO_ENCONTRADO"
  | "EB_ESTADO_CAMBIO"
  | "EB_VIAJE_YA_SALIO"
  | "EB_EMBARQUE_NO_VALIDO"
  | "EB_BOLETOS_NO_ACTIVABLES"
  | "EB_COBRO_PENDIENTE"
  | "EB_COSTO_PENDIENTE"
  | "EB_TARIFA_NO_DISPONIBLE"
  | "EB_PESO_INVALIDO"
  | "EB_SIN_RUTA"
  | "EB_VIAJE_REQUERIDO"
  | "EB_DESPACHO_INVALIDO"
  // Fase 3
  | "EB_DATOS_PASAJERO"
  | "EB_PAGOS_PENDIENTES"
  | "EB_SUCURSAL_REQUERIDA"
  | "EB_CEDULA_NO_VERIFICADA"
  | "EB_PIN_BLOQUEADO"
  | "EB_PIN_INCORRECTO"
  | "EB_DEMASIADOS_REPORTES"
  // Fase 4
  | "EB_PIN_NO_VALIDADO"
  | "EB_CUENTA_CON_ACTIVIDAD"
  /** Solo de cliente: lo devuelven las server actions cuando `fn_consumir_limite` dice `permitido: false`. */
  | "EB_DEMASIADOS_INTENTOS";

const TEXTOS_EB: Partial<Record<CodigoEB, string>> = {
  EB_PAGO_YA_RESUELTO: "Otro compañero ya resolvió este pago. Actualiza la lista.",
  EB_TASA_NO_DISPONIBLE:
    "No hay tasa BCV registrada hoy. Pídele al administrador que la cargue en Tarifas.",
  EB_PAGOS_PENDIENTES:
    "Primero resuelve los pagos por verificar de este viaje (apruébalos o recházalos) y vuelve a cancelarlo.",
  EB_PIN_NO_VALIDADO: "Vuelve a validar el PIN de retiro: la validación vence a los 15 minutos.",
};

/** Texto cuando el error no trae `hint` (códigos que también genera el cliente). */
const RESPALDO_EB: Partial<Record<CodigoEB, string>> = {
  EB_DEMASIADOS_INTENTOS: "Hiciste demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.",
};

/** "1 minuto", "10 minutos", "45 segundos" (redondeo hacia arriba a minutos desde 60 s). */
function esperaTexto(segundos: number) {
  const s = Math.max(1, Math.ceil(segundos));
  if (s < 60) return segundosTexto(s);
  const min = Math.ceil(s / 60);
  return min === 1 ? "1 minuto" : `${min} minutos`;
}

/**
 * Mensaje de `EB_DEMASIADOS_INTENTOS` para una server action, con la espera de
 * `fn_consumir_limite` (`reintentar_en_segundos`): "Hiciste demasiados intentos.
 * Espera 10 minutos y vuelve a intentarlo.".
 */
export function textoDemasiadosIntentos(reintentarEnSegundos?: number | null): string {
  return reintentarEnSegundos && reintentarEnSegundos > 0
    ? `Hiciste demasiados intentos. Espera ${esperaTexto(reintentarEnSegundos)} y vuelve a intentarlo.`
    : (RESPALDO_EB.EB_DEMASIADOS_INTENTOS as string);
}

/** Detalle estructurado de un error EB_* (`details` de PostgREST). */
export type DetalleEB = {
  campo?: string;
  asientos?: string[];
  tasa?: number;
  tasa_fecha?: string;
  total_usd?: number;
  total_bs?: number;
  esperado?: number;
  moneda?: "VES" | "USD";
  peso_max_kg?: number;
  ultima_fecha?: string | null;
  rechazadas?: { id: string; resultado: string; tracking_id: string | null; ciudad_destino: string | null }[];
  /** `EB_PAGOS_PENDIENTES`: pagos por verificar del viaje. */
  pendientes?: number;
  /** `EB_DATOS_INVALIDOS` de `fn_editar_viaje` (campo asientos): asientos mínimos del bus. */
  minimo?: number;
  /** `EB_CUENTA_CON_ACTIVIDAD`: lo que impide eliminar la cuenta. */
  boletos?: number;
  pagos?: number;
  encomiendas_enviadas?: number;
  encomiendas_por_recibir?: number;
  reembolsos?: number;
  /** `EB_DEMASIADOS_INTENTOS`: segundos hasta poder reintentar. */
  reintentar_en_segundos?: number;
  [clave: string]: unknown;
};

/** Código `EB_*` del error, o null si no es un error de negocio de las RPC. */
export function codigoEB(err: unknown): string | null {
  const { message } = normalizar(err);
  return message.startsWith("EB_") ? message.trim() : null;
}

/** true si `err` es el error `EB_*` indicado. */
export function esErrorEB(err: unknown, codigo: CodigoEB): boolean {
  return codigoEB(err) === codigo;
}

function esMensajeDeRed(msg: string) {
  return (
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound")
  );
}

/**
 * true si la petición no llegó al servidor (sin internet, DNS, servidor caído).
 * En el navegador también cuenta `navigator.onLine === false`.
 */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const { message, details, name } = normalizar(err);
  return (
    name === "AuthRetryableFetchError" ||
    name === "TimeoutError" ||
    esMensajeDeRed(message.toLowerCase()) ||
    esMensajeDeRed(details.toLowerCase())
  );
}

/** `details` del error como objeto (vacío si no es JSON válido). */
export function parseDetalleEB(err: unknown): DetalleEB {
  if (!err || typeof err !== "object") return {};
  const raw = (err as Record<string, unknown>).details;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as DetalleEB;
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const valor: unknown = JSON.parse(raw);
    return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as DetalleEB) : {};
  } catch {
    return {};
  }
}

function segundosTexto(n: number) {
  return n === 1 ? "1 segundo" : `${n} segundos`;
}

/** Mensaje para un valor duplicado (23505) según la columna afectada. */
function mensajeDuplicado(texto: string) {
  const t = texto.toLowerCase();
  if (t.includes("rif")) return "Ya existe una cooperativa registrada con este RIF.";
  if (t.includes("email") || t.includes("correo")) return "Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.";
  if (t.includes("cedula")) return "Ya existe un registro con esta cédula.";
  if (t.includes("telefono")) return "Ya existe un registro con este teléfono.";
  if (t.includes("placa")) return "Ya existe un vehículo registrado con esta placa.";
  return "Ese registro ya existe. Revisa los datos e intenta con otros.";
}

/**
 * Traduce cualquier error (Supabase, Postgres, red o Error genérico) a un
 * mensaje en español para mostrar al usuario.
 */
export function humanizeError(err: unknown, contexto?: ContextoError): string {
  const ctx = typeof contexto === "string" ? { accion: contexto } : contexto ?? {};
  const { message, code, status, details, hint, name } = normalizar(err);
  const msg = message.toLowerCase();

  // ── Errores de negocio de las RPC (EB_*): texto propio o el `hint` del servidor ──
  if (message.startsWith("EB_")) {
    const propio = TEXTOS_EB[message.trim() as CodigoEB];
    if (propio) return propio;
    if (hint.trim()) return hint.trim();
    const respaldo = RESPALDO_EB[message.trim() as CodigoEB];
    if (respaldo) return respaldo;
    return ctx.accion
      ? `No pudimos ${ctx.accion}. Actualiza la página e intenta de nuevo.`
      : "No pudimos completar la operación. Actualiza la página e intenta de nuevo.";
  }

  // ── Red ──
  if (name === "AuthRetryableFetchError" || name === "TimeoutError" || esMensajeDeRed(msg)) {
    return MSG_RED;
  }

  // ── Límite de intentos (Supabase Auth) ──
  const espera = message.match(/after (\d+) seconds?/i);
  if (espera) {
    return `Ya pediste un enlace hace poco. Espera ${segundosTexto(Number(espera[1]))} y vuelve a intentarlo.`;
  }
  if (code === "over_email_send_rate_limit" || msg.includes("email rate limit")) {
    return "Enviamos demasiados correos en poco tiempo. Espera unos minutos y vuelve a intentarlo.";
  }
  if (code === "over_request_rate_limit" || code === "over_sms_send_rate_limit" || status === 429 || msg.includes("rate limit")) {
    return "Hiciste demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.";
  }

  // ── Supabase Auth ──
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña.";
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return ctx.email
      ? `Confirma tu correo: te enviamos un enlace a ${ctx.email}.`
      : "Confirma tu correo: revisa tu bandeja de entrada (y la carpeta de spam) y abre el enlace que te enviamos.";
  }
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("user already registered") ||
    msg.includes("a user with this email")
  ) {
    return "Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.";
  }
  if (code === "weak_password" || msg.includes("password should be")) {
    return "La contraseña es muy débil. Usa al menos 8 caracteres, combinando letras y números.";
  }
  if (code === "same_password" || msg.includes("should be different from the old password")) {
    return "La nueva contraseña debe ser distinta a la anterior.";
  }
  if (code === "otp_expired" || msg.includes("invalid or has expired") || msg.includes("token has expired")) {
    return "El enlace venció o ya se usó. Pide uno nuevo e intenta de nuevo.";
  }
  if (code === "user_banned") {
    return "Tu cuenta está suspendida. Comunícate con el administrador para reactivarla.";
  }
  if (code === "user_not_found" || msg.includes("user not found")) {
    return "No encontramos una cuenta con esos datos. Revisa el correo e intenta de nuevo.";
  }
  if (code === "email_address_invalid" || msg.includes("unable to validate email address")) {
    return "El correo no es válido. Revisa que esté bien escrito (por ejemplo, nombre@correo.com).";
  }
  if (
    code === "session_not_found" ||
    code === "refresh_token_not_found" ||
    msg.includes("auth session missing") ||
    msg.includes("jwt expired")
  ) {
    return "Tu sesión expiró. Inicia sesión de nuevo para continuar.";
  }

  // ── Postgres ──
  switch (code) {
    case "23505":
      return mensajeDuplicado(`${message} ${details}`);
    case "23503":
      return msg.includes("update or delete")
        ? "No se puede eliminar porque tiene información relacionada (por ejemplo, viajes, boletos o encomiendas). Desactívalo en su lugar."
        : "Uno de los datos seleccionados ya no existe. Actualiza la página y vuelve a intentarlo.";
    case "23514":
      return "Algún dato no tiene un valor permitido. Revisa el formulario e intenta de nuevo.";
    case "23502":
      return "Falta un dato obligatorio. Completa todos los campos marcados e intenta de nuevo.";
    case "22P02":
    case "22007":
    case "22008":
      return "Algún dato tiene un formato inválido. Revisa el formulario e intenta de nuevo.";
    case "42501":
      return "No tienes permiso para hacer esta acción. Si crees que es un error, avísale al administrador.";
    case "42703":
    case "42P01":
    case "42883":
    case "PGRST204":
    case "PGRST202":
      return MSG_INTERNO;
    case "PGRST116":
      return "No encontramos el registro. Puede que se haya eliminado; actualiza la página e intenta de nuevo.";
  }
  // Triggers de máquina de estados ("Transición no válida: X -> Y").
  if (msg.includes("transición no válida") || msg.includes("no se permite salir de un estado terminal")) {
    return "Este registro cambió de estado mientras trabajabas. Actualiza la página e intenta de nuevo.";
  }
  if (msg.includes("row-level security")) {
    return "No tienes permiso para hacer esta acción. Si crees que es un error, avísale al administrador.";
  }

  // ── Genérico ──
  return ctx.accion
    ? `No pudimos ${ctx.accion}. Intenta de nuevo; si sigue fallando, avísanos.`
    : "Algo salió mal. Intenta de nuevo; si sigue fallando, avísanos.";
}
