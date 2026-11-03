// Clientes de Supabase, comprobación de credenciales y límites de uso comunes a las edge functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.3';
import { fallar } from './http.ts';

export type { SupabaseClient };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// En este proyecto el runtime trae las claves nuevas: SUPABASE_ANON_KEY = sb_publishable_…,
// SUPABASE_SERVICE_ROLE_KEY = sb_secret_… (la pg_cron del vault manda en cambio el JWT legacy).
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const sinSesion = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let admin: SupabaseClient | null = null;

/** Cliente con service role (salta RLS). Reutilizado entre peticiones del mismo isolate. */
export function clienteAdmin(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el runtime');
  admin ??= createClient(SUPABASE_URL, SERVICE_KEY, sinSesion);
  return admin;
}

/** Cliente que actúa con el JWT del usuario (aplica RLS y auth.uid() en las RPC). */
export function clienteUsuario(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...sinSesion,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function tokenBearer(req: Request): string {
  const h = req.headers.get('Authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function claimsSinVerificar(token: string): Record<string, unknown> | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')));
    return json && typeof json === 'object' ? json as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function igualSeguro(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function clavesSecretas(): string[] {
  const claves = [SERVICE_KEY];
  try {
    const extra = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (extra && typeof extra === 'object') {
      for (const v of Object.values(extra)) if (typeof v === 'string') claves.push(v);
    }
  } catch { /* variable ausente o sin JSON */ }
  return claves.filter(Boolean);
}

/**
 * ¿La petición viene con la service role? Acepta la clave secreta nueva (sb_secret_…, comparada
 * con las del runtime) o un JWT con role = service_role (el legacy que guarda el vault para pg_cron).
 * REQUIERE verify_jwt = true en config.toml: la pasarela ya validó la firma del JWT y rechaza
 * claves sb_ inexistentes; aquí solo se leen los claims.
 */
export function esServiceRole(req: Request): boolean {
  const token = tokenBearer(req);
  if (!token) return false;
  if (clavesSecretas().some((k) => igualSeguro(token, k))) return true;
  return claimsSinVerificar(token)?.role === 'service_role';
}

/** 401 estándar para funciones internas. */
export function soloServiceRole(req: Request): Response | null {
  return esServiceRole(req) ? null : fallar(401, 'EB_SIN_PERMISO', 'Esta función es de uso interno.');
}

/** Usuario autenticado del JWT (null si falta, es una clave de API o es inválido/expiró). */
export async function usuarioDelToken(req: Request): Promise<{ id: string; token: string } | null> {
  const token = tokenBearer(req);
  if (!token || claimsSinVerificar(token)?.role !== 'authenticated') return null;
  const { data, error } = await clienteAdmin().auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, token };
}

// ─── Límite de uso ────────────────────────────────────────────────────────────
// fn_consumir_limite (tabla limites_uso) es compartido entre isolates. Si la RPC falla, se usa un
// límite en memoria (por isolate, acotado) para no quedar sin protección ni romper la función.
const memoria = new Map<string, { conteo: number; resetAt: number }>();
const MAX_CLAVES_MEMORIA = 5_000;

function limiteEnMemoria(clave: string, maximo: number, ventanaSeg: number): { permitido: boolean; reintentar: number } {
  const ahora = Date.now();
  if (memoria.size > MAX_CLAVES_MEMORIA) {
    for (const [k, v] of memoria) if (v.resetAt <= ahora) memoria.delete(k);
    if (memoria.size > MAX_CLAVES_MEMORIA) memoria.clear();
  }
  const e = memoria.get(clave);
  if (!e || e.resetAt <= ahora) {
    memoria.set(clave, { conteo: 1, resetAt: ahora + ventanaSeg * 1000 });
    return { permitido: true, reintentar: 0 };
  }
  e.conteo++;
  return { permitido: e.conteo <= maximo, reintentar: Math.max(1, Math.ceil((e.resetAt - ahora) / 1000)) };
}

/** null si se permite; si no, la respuesta 429 para devolver. */
export async function aplicarLimite(clave: string, maximo: number, ventanaSeg: number): Promise<Response | null> {
  let permitido = true;
  let reintentar = 0;
  try {
    const { data, error } = await clienteAdmin().rpc('fn_consumir_limite', {
      p_clave: clave, p_maximo: maximo, p_ventana_segundos: ventanaSeg,
    });
    if (error) throw error;
    const r = data as { permitido?: boolean; reintentar_en_segundos?: number } | null;
    permitido = r?.permitido !== false;
    reintentar = Number(r?.reintentar_en_segundos) || 0;
  } catch (e) {
    console.warn('[limite] fn_consumir_limite falló, uso el límite en memoria:', (e as Error)?.message ?? e);
    const m = limiteEnMemoria(clave, maximo, ventanaSeg);
    permitido = m.permitido;
    reintentar = m.reintentar;
  }
  if (permitido) return null;
  return fallar(429, 'EB_DEMASIADOS_INTENTOS',
    'Hiciste demasiadas consultas seguidas. Espera un momento y vuelve a intentarlo.',
    { reintentar_en_segundos: reintentar || 60 });
}

// ─── Errores de las RPC ──────────────────────────────────────────────────────
const STATUS_EB: Record<string, number> = {
  EB_NO_AUTENTICADO: 401,
  EB_SIN_PERMISO: 403,
  EB_OPERACION_NO_PERMITIDA: 403,
  EB_NO_ENCONTRADO: 404,
  EB_SIN_RUTA: 404,
  EB_ESTADO_CAMBIO: 409,
  EB_TARIFA_NO_DISPONIBLE: 503,
  EB_TASA_NO_DISPONIBLE: 503,
};

/** Error de PostgREST/RPC → respuesta con el código EB_* y el hint del servidor; null si no es EB_*. */
export function respuestaErrorRpc(error: { message?: string; hint?: string | null; details?: string | null } | null): Response | null {
  const codigo = error?.message ?? '';
  if (!/^EB_[A-Z_]+$/.test(codigo)) return null;
  let detalle: unknown = undefined;
  try { detalle = error?.details ? JSON.parse(error.details) : undefined; } catch { detalle = undefined; }
  return fallar(STATUS_EB[codigo] ?? 400, codigo, error?.hint || 'No se pudo completar la operación.',
    detalle !== undefined ? { detalle } : undefined);
}
