// actualizar-tasa-bcv
// La invoca pg_cron cada 30 min (job 'actualizar_tasa_bcv', migración 20260719000001) con la
// service role key. Consulta la misma fuente que la app (dolarapi) y guarda la tasa del día con
// fn_guardar_tasa_bcv, que rechaza saltos de más de 25 % y nunca pisa una tasa cargada a mano.
import '@supabase/functions-js/edge-runtime.d.ts';
import { errorInterno, fallar, fetchConReintentos, filtrarMetodo, responder } from '../_shared/http.ts';
import { clienteAdmin, soloServiceRole } from '../_shared/supabase.ts';

const BCV_API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

// Rango plausible de Bs por USD. Fuera de él la respuesta de la API se considera basura (p. ej. un
// 0,0001 o un 1e12 por un error de la fuente) y no se guarda. Ajustar si hay reconversión monetaria.
const TASA_MIN = 0.01;
const TASA_MAX = 10_000_000;
// Una tasa con más de 10 días de antigüedad no es "la del día": no se guarda.
const MAX_DIAS_ANTIGUEDAD = 10;

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

/** Número de la API (acepta "889,57" o "889.57" por si cambia el formato). */
function numeroApi(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

function diasEntre(fecha: string, hoy: string): number {
  return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha}T00:00:00Z`)) / 86_400_000);
}

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;
  const sinPermiso = soloServiceRole(req);
  if (sinPermiso) return sinPermiso;

  // 1. Consultar dolarapi (timeout de 10 s y hasta 3 intentos con backoff).
  let tasa: number;
  let fecha: string;
  try {
    const res = await fetchConReintentos(BCV_API_URL, { headers: { Accept: 'application/json' } }, { intentos: 3, timeoutMs: 10_000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as Record<string, unknown> | null;
    const valor = numeroApi(json?.promedio) ?? numeroApi(json?.precio);
    if (valor === null || valor < TASA_MIN || valor > TASA_MAX) {
      throw new Error(`La respuesta no trae una tasa válida (${JSON.stringify(json?.promedio ?? json?.precio ?? null)})`);
    }
    tasa = Math.round(valor * 10_000) / 10_000;
    fecha = fechaDeLaTasa(json?.fechaActualizacion);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error('[actualizar-tasa-bcv] dolarapi falló:', mensaje);
    return fallar(502, 'EB_TASA_NO_DISPONIBLE', 'No se pudo consultar la tasa BCV.', { detalle: mensaje });
  }

  const hoy = fechaCaracas.format(new Date());
  const antiguedad = diasEntre(fecha, hoy);
  if (antiguedad > MAX_DIAS_ANTIGUEDAD) {
    console.warn(`[actualizar-tasa-bcv] la fuente trae una tasa vieja (${fecha}); no se guarda.`);
    return fallar(422, 'EB_TASA_INVALIDA', 'La fuente devolvió una tasa desactualizada.', { fecha, tasa });
  }

  // 2. Guardar con la RPC (solo service_role puede ejecutarla).
  try {
    const { data, error } = await clienteAdmin().rpc('fn_guardar_tasa_bcv', { p_fecha: fecha, p_tasa: tasa });
    if (error) {
      if (error.message === 'EB_TASA_SOSPECHOSA' || error.message === 'EB_TASA_INVALIDA') {
        console.warn(`[actualizar-tasa-bcv] tasa rechazada (${error.message}):`, error.details);
        return fallar(422, error.message, error.hint ?? 'Tasa rechazada.', { detalle: error.details, fecha, tasa });
      }
      throw new Error(`fn_guardar_tasa_bcv: ${error.message}`);
    }
    return responder(200, (data as Record<string, unknown> | null) ?? { fecha, tasa });
  } catch (e) {
    return errorInterno('actualizar-tasa-bcv', e);
  }
});
