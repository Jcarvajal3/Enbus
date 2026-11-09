// push-panel
// Notificaciones push (Web Push) del panel de cooperativas instalado como web app.
// La invocan, con la service role del vault: el disparador de pagos al registrarse un pago digital
// por verificar (envío inmediato, vía pg_net después del COMMIT) y el cron 'procesar_push_panel'
// cada minuto si quedan avisos pendientes (migración 20261109000004).
//
// Toma la cola panel_push_cola con fn_tomar_push_panel (FOR UPDATE SKIP LOCKED + reserva: dos
// ejecuciones solapadas no mandan el mismo aviso), cifra el mensaje para cada equipo suscrito del
// personal de la cooperativa (VAPID + aes128gcm, ver webpush.ts) y devuelve el resultado con
// fn_resultado_push_panel: borra las suscripciones caducadas (404/410) y reintenta con espera si
// ningún equipo recibió el aviso por un fallo transitorio.
//
// El aviso no lleva datos sensibles: tipo (boleto/encomienda), monto esperado y nombre corto del
// cliente (nombre + inicial). Los logs no incluyen endpoints, claves ni nombres.
//
// Secretos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys) y VAPID_SUBJECT
// ("mailto:…"). La pública es la misma que NEXT_PUBLIC_VAPID_PUBLIC_KEY del panel.
import '@supabase/functions-js/edge-runtime.d.ts';
import { errorInterno, fallar, filtrarMetodo, responder } from '../_shared/http.ts';
import { clienteAdmin, soloServiceRole } from '../_shared/supabase.ts';
import { type ClavesVapid, enviarPush, type ResultadoEnvio, type SuscripcionPush } from './webpush.ts';

const LOTE = 50;
const MAX_LOTES = 5;
const PRESUPUESTO_MS = 25_000;
const ENVIOS_EN_PARALELO = 10;
// Un aviso de pago que no se pudo entregar en 2 h (o en 6 intentos) se descarta: el pago ya se ve
// en "Pagos por verificar" y el aviso dejó de ser oportuno.
const MAX_REINTENTO_MS = 2 * 60 * 60 * 1000;
const MAX_INTENTOS = 6;
// El servicio de push guarda el aviso hasta 12 h si el equipo está apagado.
const TTL_SEG = 12 * 60 * 60;

/** Mismos servicios que _endpoint_push_valido en la base. */
const ENDPOINT_RE = new RegExp(
  '^https://(fcm\\.googleapis\\.com|android\\.googleapis\\.com|updates\\.push\\.services\\.mozilla\\.com' +
    '|[a-z0-9.-]+\\.push\\.services\\.mozilla\\.com|web\\.push\\.apple\\.com|[a-z0-9.-]+\\.push\\.apple\\.com' +
    '|[a-z0-9.-]+\\.notify\\.windows\\.com)/',
  'i',
);

interface Fila {
  cola_id: string;
  pago_id: string;
  cooperativa_id: string;
  intentos: number;
  creado_at: string;
  pendiente: boolean;
  tipo_recurso: 'boleto' | 'encomienda';
  n_boletos: number;
  moneda: 'VES' | 'USD' | null;
  monto: number | string | null;
  cliente: string | null;
  suscripciones: (SuscripcionPush & { id: string })[] | null;
}

function clavesVapid(): ClavesVapid | null {
  const publica = Deno.env.get('VAPID_PUBLIC_KEY')?.trim() ?? '';
  const privada = Deno.env.get('VAPID_PRIVATE_KEY')?.trim() ?? '';
  const sujeto = Deno.env.get('VAPID_SUBJECT')?.trim() ?? '';
  if (!publica || !privada || !/^(mailto:|https:\/\/)/.test(sujeto)) return null;
  return { publica, privada, sujeto };
}

/** "1.250,00" (mismo formato que formatNumeroVE de shared/dinero). */
function numeroVE(n: number): string {
  const abs = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  const [entero, dec] = abs.toFixed(2).split('.');
  return `${n < 0 && abs !== 0 ? '-' : ''}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

function textoAviso(f: Fila): { titulo: string; cuerpo: string } {
  const que = f.tipo_recurso === 'encomienda'
    ? 'Encomienda'
    : f.n_boletos > 1 ? `${f.n_boletos} boletos` : 'Boleto';
  const n = Number(f.monto);
  const monto = Number.isFinite(n) ? `${f.moneda === 'USD' ? 'USD' : 'Bs'} ${numeroVE(n)}` : null;
  const partes = [que, monto, f.cliente?.slice(0, 40) || null].filter(Boolean);
  return { titulo: 'Pago por verificar', cuerpo: `${partes.join(' · ')}. Revísalo y apruébalo en el panel.` };
}

/** Ejecuta las tareas con un máximo de `n` a la vez. */
async function enParalelo<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const trabajador = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return out;
}

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;
  const sinPermiso = soloServiceRole(req);
  if (sinPermiso) return sinPermiso;

  const vapid = clavesVapid();
  if (!vapid) {
    // Sin claves no se toma la cola: los avisos esperan a que se configuren los secretos.
    console.error('[push-panel] faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT (mailto:/https:).');
    return fallar(503, 'EB_ERROR_INTERNO', 'Las notificaciones del panel no están configuradas.');
  }

  const inicio = Date.now();
  const totales = { avisos: 0, enviados: 0, caducadas: 0, fallidas: 0, reintentar: 0, descartados: 0 };

  try {
    const admin = clienteAdmin();
    for (let lote = 0; lote < MAX_LOTES && Date.now() - inicio < PRESUPUESTO_MS; lote++) {
      const { data, error } = await admin.rpc('fn_tomar_push_panel', { p_limite: LOTE, p_segundos: 120 });
      if (error) throw new Error(`fn_tomar_push_panel: ${error.message}`);
      const filas = (data ?? []) as Fila[];
      if (filas.length === 0) break;

      const hechos: string[] = [];
      const reintentar: string[] = [];
      const enviados: { cola_id: string; enviados: number }[] = [];
      const ok: string[] = [];
      const caducadas: string[] = [];
      const fallidas: string[] = [];

      for (const f of filas) {
        totales.avisos++;
        const subs = (f.suscripciones ?? []).filter((s) => ENDPOINT_RE.test(s.endpoint));
        // Ya aprobado o rechazado, o nadie con el aviso activado: nada que enviar.
        if (!f.pendiente || subs.length === 0) {
          hechos.push(f.cola_id);
          enviados.push({ cola_id: f.cola_id, enviados: 0 });
          continue;
        }
        const { titulo, cuerpo } = textoAviso(f);
        const datos = JSON.stringify({
          tipo: 'PAGO_POR_VERIFICAR',
          titulo,
          cuerpo,
          // Relativa al origen del panel: el service worker la resuelve. ?id= abre el pago.
          url: `/cooperativas/pagos?id=${f.pago_id}`,
          tag: 'pagos-por-verificar',
          pago_id: f.pago_id,
        });
        const resultados: ResultadoEnvio[] = await enParalelo(subs, ENVIOS_EN_PARALELO,
          (s) => enviarPush(s, datos, vapid, { ttl: TTL_SEG, urgencia: 'high' }));

        let entregados = 0;
        let transitorios = 0;
        resultados.forEach((r, i) => {
          const id = subs[i].id;
          if (r.estado === 'OK') { ok.push(id); entregados++; }
          else if (r.estado === 'CADUCADA') caducadas.push(id);
          else if (r.estado === 'FALLIDA') {
            fallidas.push(id);
            console.warn(`[push-panel] el servicio de push rechazó un envío (HTTP ${r.status ?? '-'}).`);
          } else transitorios++;
        });
        totales.enviados += entregados;

        const vieja = Date.now() - new Date(f.creado_at).getTime() > MAX_REINTENTO_MS;
        if (entregados === 0 && transitorios > 0 && !vieja && f.intentos < MAX_INTENTOS) {
          reintentar.push(f.cola_id);
          totales.reintentar++;
        } else {
          if (entregados === 0 && transitorios > 0) totales.descartados++;
          hechos.push(f.cola_id);
          enviados.push({ cola_id: f.cola_id, enviados: entregados });
        }
      }

      totales.caducadas += caducadas.length;
      totales.fallidas += fallidas.length;
      const { error: e2 } = await admin.rpc('fn_resultado_push_panel', {
        p_resultado: { hechos, reintentar, enviados, ok, caducadas, fallidas },
      });
      // Si no se pudo guardar, la reserva vence en 2 min y el aviso se vuelve a enviar: mejor un
      // duplicado (el service worker lo agrupa por tag) que perder el aviso.
      if (e2) console.error('[push-panel] no se pudo guardar el resultado:', e2.message);
      if (filas.length < LOTE || reintentar.length) break;
    }

    if (totales.avisos > 0) console.log('[push-panel]', JSON.stringify(totales));
    return responder(200, totales);
  } catch (e) {
    return errorInterno('push-panel', e);
  }
});
