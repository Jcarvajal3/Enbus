// procesar-notificaciones-pendientes
// La invoca pg_cron cada minuto (job 'procesar_notificaciones_pendientes') con la service role.
// Toma la cola pending_notifications en lotes, reclamando las filas de forma atómica para que dos
// ejecuciones solapadas no manden el mismo aviso dos veces, y envía los push a Expo en lotes de 100.
//
// Reclamo: si existe la RPC fn_tomar_notificaciones_pendientes (migración 20261103000004: FOR UPDATE
// SKIP LOCKED + reserva tomada_hasta + intentos) se usa, y un fallo transitorio se reintenta con
// espera exponencial (1, 2, 4… min). Si la RPC no existe, se marca procesado = true con un UPDATE
// condicionado (procesado = false) antes de enviar y se devuelve a false si hay que reintentar.
import '@supabase/functions-js/edge-runtime.d.ts';
import { errorInterno, filtrarMetodo, responder } from '../_shared/http.ts';
import { clienteAdmin, soloServiceRole, type SupabaseClient } from '../_shared/supabase.ts';
import { type Aviso, enviarAvisos, revisarRecibos } from '../_shared/push.ts';

const LOTE = 100;
const MAX_LOTES = 5;
const PRESUPUESTO_MS = 25_000;
// Un aviso que sigue fallando después de 24 h (o de 8 intentos) se descarta: ya no sería oportuno.
const MAX_REINTENTO_MS = 24 * 60 * 60 * 1000;
const MAX_INTENTOS = 8;

interface Fila {
  id: string;
  destinatario_id: string | null;
  recurso_tipo: string | null;
  recurso_id: string | null;
  tipo_notificacion: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  intentos?: number;
}

type Modo = 'rpc' | 'directo';
// Sin la RPC se vuelve a probar cada 5 min (por si la migración se aplica con el isolate vivo).
let sinRpcHasta = 0;

async function reclamar(admin: SupabaseClient): Promise<{ filas: Fila[]; modo: Modo }> {
  if (Date.now() >= sinRpcHasta) {
    const { data, error } = await admin.rpc('fn_tomar_notificaciones_pendientes', { p_limite: LOTE, p_segundos: 120 });
    if (!error) return { filas: (data ?? []) as Fila[], modo: 'rpc' };
    if (error.code !== 'PGRST202') throw new Error(`fn_tomar_notificaciones_pendientes: ${error.message}`);
    sinRpcHasta = Date.now() + 5 * 60_000;
  }
  const { data: candidatas, error: e1 } = await admin.from('pending_notifications')
    .select('id').eq('procesado', false).order('created_at', { ascending: true }).limit(LOTE);
  if (e1) throw new Error(`No se pudo leer la cola: ${e1.message}`);
  if (!candidatas?.length) return { filas: [], modo: 'directo' };
  // UPDATE … WHERE procesado = false: si otra ejecución ya tomó una fila, aquí no vuelve.
  const { data: tomadas, error: e2 } = await admin.from('pending_notifications')
    .update({ procesado: true })
    .in('id', candidatas.map((c) => c.id as string))
    .eq('procesado', false)
    .select('id, destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload, created_at');
  if (e2) throw new Error(`No se pudo reclamar la cola: ${e2.message}`);
  return { filas: (tomadas ?? []) as Fila[], modo: 'directo' };
}

function avisoDeFila(f: Fila): Aviso | null {
  if (!f.destinatario_id) return null;
  const p = f.payload ?? {};
  const base = {
    ref: f.id, usuarioId: f.destinatario_id, recursoTipo: f.recurso_tipo, recursoId: f.recurso_id,
    tipo: f.tipo_notificacion, escribirBandeja: p.sin_bandeja !== true,
  };
  if (f.tipo_notificacion?.includes('DEVOLUCION')) {
    // Devolución automática (cron auto_devolver_encomienda): la bandeja se escribe aquí.
    const tracking = typeof p.tracking_id === 'string' && p.tracking_id ? ` ${p.tracking_id}` : '';
    return {
      ...base,
      titulo: 'Tu encomienda volvió a origen',
      mensaje: `Nadie retiró la encomienda${tracking} a tiempo y la devolvimos a la oficina de origen. Pasa a buscarla con tu cédula.`,
    };
  }
  if (typeof p.titulo === 'string' && p.titulo.trim() && typeof p.mensaje === 'string' && p.mensaje.trim()) {
    // Genérica (RPC de pagos, boletos y encomiendas): la bandeja ya la escribió la RPC (sin_bandeja).
    return { ...base, titulo: p.titulo.trim(), mensaje: p.mensaje.trim() };
  }
  return null;
}

async function marcarProcesadas(admin: SupabaseClient, ids: string[]) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await admin.from('pending_notifications').update({ procesado: true }).in('id', ids.slice(i, i + 100));
    if (error) console.error('[procesar-notificaciones] no se pudieron marcar procesadas:', error.message);
  }
}

/** Cuándo se vuelve a intentar: 1, 2, 4, 8… minutos según los intentos (tope 2 h). */
function liberacion(f: Fila, modo: Modo): Record<string, unknown> {
  if (modo === 'directo') return { procesado: false };
  const minutos = Math.min(2 ** Math.max((f.intentos ?? 1) - 1, 0), 120);
  return { tomada_hasta: new Date(Date.now() + minutos * 60_000).toISOString() };
}

/** Devuelve filas a la cola. Si su bandeja ya se escribió, el reintento no la duplica (sin_bandeja). */
async function liberar(admin: SupabaseClient, filas: Fila[], modo: Modo, bandejaEscrita: Set<string>) {
  const grupos = new Map<string, string[]>();
  for (const f of filas.filter((f) => !bandejaEscrita.has(f.id))) {
    const clave = JSON.stringify(liberacion(f, modo));
    grupos.set(clave, [...(grupos.get(clave) ?? []), f.id]);
  }
  for (const [clave, ids] of grupos) {
    const { error } = await admin.from('pending_notifications').update(JSON.parse(clave)).in('id', ids);
    if (error) console.error('[procesar-notificaciones] no se pudieron liberar filas:', error.message);
  }
  for (const f of filas.filter((f) => bandejaEscrita.has(f.id))) {
    const { error } = await admin.from('pending_notifications')
      .update({ ...liberacion(f, modo), payload: { ...(f.payload ?? {}), sin_bandeja: true } }).eq('id', f.id);
    if (error) console.error(`[procesar-notificaciones] no se pudo liberar ${f.id}:`, error.message);
  }
}

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;
  const sinPermiso = soloServiceRole(req);
  if (sinPermiso) return sinPermiso;

  const inicio = Date.now();
  let procesadas = 0;
  let fallidas = 0;
  let reintentar = 0;
  let descartadas = 0;

  try {
    const admin = clienteAdmin();
    for (let lote = 0; lote < MAX_LOTES && Date.now() - inicio < PRESUPUESTO_MS; lote++) {
      const { filas, modo } = await reclamar(admin);
      if (filas.length === 0) break;

      const avisos: Aviso[] = [];
      const sinAviso: string[] = [];
      for (const f of filas) {
        const a = avisoDeFila(f);
        if (a) avisos.push(a);
        else sinAviso.push(f.id);
      }
      if (sinAviso.length) {
        console.warn(`[procesar-notificaciones] ${sinAviso.length} fila(s) sin destinatario o sin texto: se descartan.`);
        descartadas += sinAviso.length;
      }

      let resultado = new Map<string, string>();
      let bandejaEscrita = new Set<string>();
      try {
        ({ resultado, bandejaEscrita } = await enviarAvisos(admin, avisos));
      } catch (e) {
        // Fallo leyendo perfiles: todo el lote se reintenta.
        console.error('[procesar-notificaciones] lote sin enviar:', (e as Error)?.message ?? e);
      }

      const hechas: string[] = [...sinAviso];
      const aLiberar: Fila[] = [];
      for (const f of filas) {
        if (sinAviso.includes(f.id)) continue;
        const r = resultado.get(f.id) ?? 'REINTENTAR';
        if (r === 'REINTENTAR') {
          const vieja = Date.now() - new Date(f.created_at).getTime() > MAX_REINTENTO_MS;
          const agotada = (f.intentos ?? 0) >= MAX_INTENTOS;
          if (vieja || agotada) {
            console.error(`[procesar-notificaciones] ${f.id} descartada tras reintentos.`);
            descartadas++;
            hechas.push(f.id);
          } else {
            reintentar++;
            aLiberar.push(f);
          }
        } else {
          if (r === 'FALLIDO') fallidas++;
          else procesadas++;
          hechas.push(f.id);
        }
      }

      if (modo === 'rpc') await marcarProcesadas(admin, hechas);
      if (aLiberar.length) await liberar(admin, aLiberar, modo, bandejaEscrita);
      if (filas.length < LOTE || aLiberar.length) break; // cola vacía, o Expo con problemas
    }

    const recibos = Date.now() - inicio < PRESUPUESTO_MS ? await revisarRecibos(admin) : null;
    return responder(200, { procesadas, fallidas, reintentar, descartadas, ...(recibos ? { recibos } : {}) });
  } catch (e) {
    return errorInterno('procesar-notificaciones-pendientes', e);
  }
});
