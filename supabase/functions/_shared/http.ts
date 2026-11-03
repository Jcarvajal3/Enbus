// Utilidades HTTP comunes de las edge functions de EnBus.
// Respuestas JSON con la convención del proyecto: { error: 'EB_<CODIGO>', hint: '<texto para el usuario>' }.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonHeaders: Record<string, string> = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export function responder(status: number, body: unknown, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: extra ? { ...jsonHeaders, ...extra } : jsonHeaders });
}

export function fallar(status: number, error: string, hint: string, extra?: Record<string, unknown>): Response {
  return responder(status, { error, hint, ...extra });
}

/** Preflight CORS (204) o método distinto de POST (405). null = seguir. */
export function filtrarMetodo(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') {
    return fallar(405, 'EB_OPERACION_NO_PERMITIDA', 'Usa POST para esta operación.', undefined);
  }
  return null;
}

/** Error de entrada que se traduce directamente en una respuesta 4xx. */
export class ErrorEntrada extends Error {
  constructor(public status: number, public codigo: string, public hint: string, public extra?: Record<string, unknown>) {
    super(codigo);
  }
  respuesta(): Response {
    return fallar(this.status, this.codigo, this.hint, this.extra);
  }
}

/**
 * Lee el cuerpo como objeto JSON con un tope de tamaño. Cuerpo vacío = {}.
 * Lanza ErrorEntrada (413 / 400) si es demasiado grande o no es un objeto JSON.
 */
export async function leerJson(req: Request, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const declarado = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    throw new ErrorEntrada(413, 'EB_DATOS_INVALIDOS', 'La solicitud es demasiado grande.');
  }
  const texto = await req.text();
  if (new TextEncoder().encode(texto).byteLength > maxBytes) {
    throw new ErrorEntrada(413, 'EB_DATOS_INVALIDOS', 'La solicitud es demasiado grande.');
  }
  if (texto.trim() === '') return {};
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErrorEntrada(400, 'EB_DATOS_INVALIDOS', 'La solicitud no es un JSON válido.');
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new ErrorEntrada(400, 'EB_DATOS_INVALIDOS', 'La solicitud debe ser un objeto JSON.');
  }
  return json as Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Texto recortado y sin espacios extremos; null si no es texto o queda vacío. */
export function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const limpio = v.trim();
  if (!limpio) return null;
  return limpio.length > max ? limpio.slice(0, max) : limpio;
}

/** Número finito (acepta "12,5" o "12.5"); null si no lo es. */
export function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** IP del cliente detrás de la pasarela de Supabase (Cloudflare). */
export function ipCliente(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf.slice(0, 64);
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return xff ? xff.slice(0, 64) : 'desconocida';
}

/** 500 genérico: el detalle va al log, no al cliente. */
export function errorInterno(funcion: string, e: unknown): Response {
  const detalle = e instanceof Error ? e.message : typeof e === 'object' ? JSON.stringify(e) : String(e);
  console.error(`[${funcion}] error inesperado:`, detalle);
  return fallar(500, 'EB_ERROR_INTERNO', 'Algo salió mal de nuestro lado. Intenta de nuevo en unos minutos.');
}

/** fetch con timeout y reintentos con backoff para errores de red, 429 y 5xx. */
export async function fetchConReintentos(
  url: string,
  init: RequestInit,
  { intentos = 3, timeoutMs = 10_000, baseMs = 500 }: { intentos?: number; timeoutMs?: number; baseMs?: number } = {},
): Promise<Response> {
  let ultimo: unknown = null;
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, baseMs * 3 ** (i - 1) + Math.floor(Math.random() * 200)));
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || res.status >= 500) {
        ultimo = new Error(`HTTP ${res.status}`);
        await res.body?.cancel();
        continue;
      }
      return res;
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
}
