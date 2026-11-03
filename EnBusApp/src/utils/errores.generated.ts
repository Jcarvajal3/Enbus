// GENERADO por shared/generar.mjs — no editar a mano. Fuente: shared/errores.ts

// ─── Mensajes de error para el usuario (fuente única) ────────────────────────
// Catálogo común de la app, el panel y la landing: el mismo error se cuenta igual
// en los tres productos. Cada proyecto conserva su `humanizeError` (firma y textos
// propios de su contexto, como "Ese asiento acaba de ser tomado" o "Otro compañero
// ya resolvió este pago") y toma de aquí los textos compartidos.
//
// TS puro: sin `\p{…}` ni lookbehind (Hermes). Solo importa `./ve` (en las copias,
// `./ve.generated`). `node shared/generar.mjs` lo copia como `errores.generated.ts`
// en los tres proyectos: no editar las copias.

import { CLAVE_ERROR } from "./ve.generated";

export interface CatalogoMensajes {
  /** Sin internet, DNS o servidor inalcanzable. */
  sinRed: string;
  /** Error que no se reconoce. */
  generico: string;
  sesionVencida: string;
  /** Enlace de correo (confirmación, recuperación, invitación) vencido o ya usado. */
  enlaceVencido: string;
  correoInvalido: string;
  credenciales: string;
  usuarioNoExiste: string;
  cedulaDuplicada: string;
  demasiadosIntentos: string;
  /** = `CLAVE_ERROR` de ve.ts. */
  claveCorta: string;
  tiempoAgotado: string;
  servidor: string;
  correoSinConfirmar: string;
  cuentaExiste: string;
  claveIgual: string;
  cuentaSuspendida: string;
  registroCerrado: string;
  /** Se pidió otro correo de enlace demasiado pronto. */
  enlaceReciente: string;
  telefonoDuplicado: string;
  duplicado: string;
  referenciaRota: string;
  datoFaltante: string;
  datoInvalido: string;
  sinPermiso: string;
  noEncontrado: string;
  estadoCambiado: string;
}

export const MSG: Readonly<CatalogoMensajes> = {
  sinRed: "Sin conexión. Revisa tu internet e intenta de nuevo.",
  generico: "Algo falló. Intenta de nuevo en unos segundos.",
  sesionVencida: "Tu sesión venció. Inicia sesión de nuevo.",
  enlaceVencido: "El enlace venció o ya se usó. Pide uno nuevo.",
  correoInvalido: "El correo no es válido. Revisa que esté bien escrito.",
  credenciales: "Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña.",
  usuarioNoExiste: "No encontramos una cuenta con ese correo. Revísalo e intenta de nuevo.",
  cedulaDuplicada: "Esa cédula ya está registrada en otra cuenta.",
  demasiadosIntentos: "Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
  claveCorta: CLAVE_ERROR,
  tiempoAgotado: "La conexión está tardando demasiado. Revisa tu internet e intenta de nuevo.",
  servidor: "El servicio no responde. Intenta de nuevo en unos minutos.",
  correoSinConfirmar: "Confirma tu correo: abre el enlace que te enviamos (revisa también Spam).",
  cuentaExiste: "Ya existe una cuenta con este correo. Inicia sesión.",
  claveIgual: "La nueva contraseña debe ser distinta a la anterior.",
  cuentaSuspendida: "Tu cuenta está suspendida. Escríbenos para revisarla.",
  registroCerrado: "El registro no está disponible ahora. Intenta más tarde.",
  enlaceReciente: "Ya pediste un enlace hace poco. Espera un minuto y vuelve a intentarlo.",
  telefonoDuplicado: "Ese teléfono ya está registrado en otra cuenta.",
  duplicado: "Ese registro ya existe.",
  referenciaRota: "Un dato relacionado ya no existe. Actualiza e intenta de nuevo.",
  datoFaltante: "Falta un dato obligatorio. Revisa el formulario.",
  datoInvalido: "Algún dato no es válido. Revísalo e intenta de nuevo.",
  sinPermiso: "No tienes permiso para hacer esto.",
  noEncontrado: "No encontramos lo que buscas. Puede que ya no exista.",
  estadoCambiado: "Esto cambió de estado hace un momento. Actualiza e intenta de nuevo.",
};

const propia = (tabla: Record<string, keyof CatalogoMensajes>, k: string): keyof CatalogoMensajes | null =>
  Object.prototype.hasOwnProperty.call(tabla, k) ? tabla[k] : null;

// ─── Supabase Auth ───────────────────────────────────────────────────────────

/** Código de error de Supabase Auth (`error.code`) → clave del catálogo. */
const CODIGOS_AUTH: Record<string, keyof CatalogoMensajes> = {
  invalid_credentials: "credenciales",
  email_not_confirmed: "correoSinConfirmar",
  user_already_exists: "cuentaExiste",
  email_exists: "cuentaExiste",
  weak_password: "claveCorta",
  same_password: "claveIgual",
  email_address_invalid: "correoInvalido",
  over_email_send_rate_limit: "enlaceReciente",
  over_request_rate_limit: "demasiadosIntentos",
  over_sms_send_rate_limit: "demasiadosIntentos",
  otp_expired: "enlaceVencido",
  flow_state_not_found: "enlaceVencido",
  flow_state_expired: "enlaceVencido",
  bad_code_verifier: "enlaceVencido",
  bad_oauth_state: "enlaceVencido",
  bad_oauth_callback: "enlaceVencido",
  session_expired: "sesionVencida",
  session_not_found: "sesionVencida",
  refresh_token_not_found: "sesionVencida",
  refresh_token_already_used: "sesionVencida",
  bad_jwt: "sesionVencida",
  invalid_jwt: "sesionVencida",
  user_banned: "cuentaSuspendida",
  signup_disabled: "registroCerrado",
  user_not_found: "usuarioNoExiste",
};

/** Fragmentos del mensaje en inglés de Supabase Auth → clave del catálogo (en orden). */
const MENSAJES_AUTH: [RegExp, keyof CatalogoMensajes][] = [
  [/invalid login credentials/, "credenciales"],
  [/email not confirmed/, "correoSinConfirmar"],
  [/already registered|already been registered|a user with this email/, "cuentaExiste"],
  [/password should|weak password|password is too weak|password.*at least/, "claveCorta"],
  [/should be different from the old password/, "claveIgual"],
  [/unable to validate email address|invalid email/, "correoInvalido"],
  [/email rate limit/, "enlaceReciente"],
  [/rate limit/, "demasiadosIntentos"],
  [/invalid or has expired|token has expired|code verifier|flow state|invalid grant|code challenge/, "enlaceVencido"],
  [/jwt expired|invalid refresh token|auth session missing/, "sesionVencida"],
  [/user not found/, "usuarioNoExiste"],
];

/**
 * Error de Supabase Auth (su `code` o su `message`) → texto del catálogo; null si no
 * se reconoce. La espera de "For security purposes… after 42 seconds" la arma cada
 * proyecto (lleva el número).
 */
export function mensajeAuth(codigoOMensaje: string | null | undefined): string | null {
  const texto = (codigoOMensaje ?? "").trim();
  if (!texto) return null;
  const porCodigo = propia(CODIGOS_AUTH, texto);
  if (porCodigo) return MSG[porCodigo];
  const bajo = texto.toLowerCase();
  for (const [patron, clave] of MENSAJES_AUTH) {
    if (patron.test(bajo)) return MSG[clave];
  }
  return null;
}

// ─── Postgres y PostgREST ────────────────────────────────────────────────────

const CODIGOS_POSTGRES: Record<string, keyof CatalogoMensajes> = {
  "23505": "duplicado",
  "23503": "referenciaRota",
  "23502": "datoFaltante",
  "23514": "datoInvalido",
  "22P02": "datoInvalido",
  "22001": "datoInvalido",
  "22003": "datoInvalido",
  "22007": "datoInvalido",
  "22008": "datoInvalido",
  "42501": "sinPermiso",
  "57014": "tiempoAgotado",
  PGRST116: "noEncontrado",
  PGRST301: "sesionVencida",
  PGRST303: "sesionVencida",
};

/**
 * Código de Postgres o PostgREST (`23505`, `42501`, `PGRST116`…) → texto del catálogo;
 * null si no se reconoce. Cada proyecto puede afinar el 23505 según la columna.
 */
export function mensajePostgres(code: string | null | undefined): string | null {
  const clave = propia(CODIGOS_POSTGRES, (code ?? "").trim());
  return clave ? MSG[clave] : null;
}
