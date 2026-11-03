// actualizar-tasa-bcv
// La invoca pg_cron cada 30 min (job 'actualizar_tasa_bcv', migración 20260719000001) con la
// service role key. Consulta la misma fuente que la app (dolarapi) y guarda la tasa del día con
// fn_guardar_tasa_bcv, que rechaza saltos de más de 25 % y nunca pisa una tasa cargada a mano.
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const BCV_API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

const jsonHeaders = { 'Content-Type': 'application/json' };

function responder(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/**
 * Solo la invoca pg_cron con la service role key. verify_jwt = true en config.toml: la pasarela de
 * Supabase ya verificó la firma del JWT antes de llegar aquí, así que basta con exigir el rol
 * service_role en sus claims. También se acepta la coincidencia exacta con la variable del runtime
 * (en proyectos con las API keys nuevas, SUPABASE_SERVICE_ROLE_KEY puede no ser la clave legacy
 * que guarda el vault, y la comparación exacta sola fallaba con 401).
 */
function esServiceRole(authHeader: string, serviceKey: string): boolean {
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return false;
  if (token === serviceKey) return true;
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

const fechaCaracas = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Caracas',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Misma regla que fechaDeLaTasa() de la app: la API informa el día de vigencia. Un timestamp de
 * medianoche es una fecha sin hora y se toma literal (convertirlo desde UTC lo correría un día).
 * Cualquier otro valor se lleva al día de Caracas.
 */
function fechaDeLaTasa(valor: unknown): string {
  if (typeof valor === 'string') {
    const soloDia = valor.match(/^(\d{4}-\d{2}-\d{2})(?:$|T00:00:00)/);
    if (soloDia) return soloDia[1];
    const date = new Date(valor);
    if (!Number.isNaN(date.getTime())) return fechaCaracas.format(date);
  }
  return fechaCaracas.format(new Date());
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return responder(405, { error: 'Método no permitido' });
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!serviceKey || !esServiceRole(authHeader, serviceKey)) {
    return responder(401, { error: 'No autorizado' });
  }

  // 1. Consultar dolarapi
  let tasa: number;
  let fecha: string;
  try {
    const res = await fetch(BCV_API_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const valor = typeof json?.promedio === 'number'
      ? json.promedio
      : typeof json?.precio === 'number'
      ? json.precio
      : null;
    if (valor === null || !(valor > 0)) throw new Error('La respuesta no trae una tasa válida');
    tasa = valor;
    fecha = fechaDeLaTasa(json?.fechaActualizacion);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error('[actualizar-tasa-bcv] dolarapi falló:', mensaje);
    return responder(502, { error: 'No se pudo consultar la tasa BCV', detalle: mensaje });
  }

  // 2. Guardar con la RPC (solo service_role puede ejecutarla)
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc('fn_guardar_tasa_bcv', { p_fecha: fecha, p_tasa: tasa });

  if (error) {
    if (error.message === 'EB_TASA_SOSPECHOSA') {
      console.warn('[actualizar-tasa-bcv] tasa rechazada por salto > 25 %:', error.details);
      return responder(422, { error: error.message, hint: error.hint, detalle: error.details, fecha, tasa });
    }
    console.error('[actualizar-tasa-bcv] fn_guardar_tasa_bcv falló:', error.message, error.details);
    return responder(500, { error: error.message, hint: error.hint ?? null });
  }

  return responder(200, (data as Record<string, unknown> | null) ?? { fecha, tasa });
});
