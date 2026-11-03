// Envío de notificaciones push con Expo, en lotes, con manejo de tickets y recibos.
// Lo usan enviar-push (envío directo desde el panel) y procesar-notificaciones-pendientes (cola).
import type { SupabaseClient } from './supabase.ts';
import { fetchConReintentos } from './http.ts';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const LOTE_EXPO = 100;            // máximo de mensajes por petición a Expo
const LOTE_RECIBOS = 1_000;       // máximo de ids por petición de recibos
const LOTE_IN = 100;              // ids por filtro .in() (la URL de PostgREST tiene tope)
const TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export interface Aviso {
  /** Identificador del aviso para el llamador (p. ej. pending_notifications.id). */
  ref: string;
  usuarioId: string;
  titulo: string;
  mensaje: string;
  recursoTipo: string | null;
  recursoId: string | null;
  tipo: string | null;
  /** true = escribir también la bandeja in-app (si la RPC no la escribió ya). */
  escribirBandeja: boolean;
}

/**
 * ENVIADO: Expo aceptó el mensaje. FALLIDO: error definitivo (token inválido, mensaje rechazado…).
 * SIN_TOKEN: el usuario no tiene dispositivo registrado. PREFERENCIA: el usuario apagó ese tipo.
 * SIN_USUARIO: el perfil no existe o la cuenta fue eliminada. REINTENTAR: fallo transitorio.
 */
export type Resultado = 'ENVIADO' | 'FALLIDO' | 'SIN_TOKEN' | 'PREFERENCIA' | 'SIN_USUARIO' | 'REINTENTAR';

interface Perfil {
  id: string;
  expo_push_token: string | null;
  notif_encomiendas: boolean | null;
  notif_boletos: boolean | null;
  notif_recordatorios: boolean | null;
  eliminada_at: string | null;
}

interface Ticket {
  status?: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function trozos<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function recortar(v: string, max: number): string {
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function preferenciaApagada(p: Perfil, recursoTipo: string | null): boolean {
  if (recursoTipo === 'encomienda') return p.notif_encomiendas === false;
  if (recursoTipo === 'boleto') return p.notif_boletos === false;
  if (recursoTipo === 'recordatorio') return p.notif_recordatorios === false;
  return false;
}

function cabecerasExpo(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  // Con "Enhanced Push Security" activado en Expo hace falta el access token (secreto del proyecto).
  const token = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Contacto que se guarda en notificaciones_log (mismo formato de siempre: "push <token>"). */
function contacto(token: string | null): string {
  return `push ${token ?? 'no_token'}`;
}

/** Quita el token de un dispositivo que Expo ya no reconoce (solo si sigue siendo el mismo). */
async function limpiarToken(admin: SupabaseClient, usuarioId: string, token: string) {
  const { error } = await admin.from('profiles').update({ expo_push_token: null })
    .eq('id', usuarioId).eq('expo_push_token', token);
  if (error) console.error(`[push] no se pudo limpiar el token de ${usuarioId}:`, error.message);
}

/** Inserta en notificaciones_log; si la columna expo_ticket_id no existe todavía, reintenta sin ella. */
async function registrarLog(admin: SupabaseClient, filas: Record<string, unknown>[]) {
  if (filas.length === 0) return;
  let { error } = await admin.from('notificaciones_log').insert(filas);
  if (error && /expo_ticket_id/.test(`${error.message} ${error.details ?? ''}`)) {
    ({ error } = await admin.from('notificaciones_log').insert(filas.map(({ expo_ticket_id: _t, ...resto }) => resto)));
  }
  if (error) console.error('[push] no se pudo registrar notificaciones_log:', error.message);
}

/**
 * Envía los avisos: lee los perfiles en bloque, escribe la bandeja si toca, respeta preferencias,
 * manda a Expo en lotes de 100 y procesa los tickets (DeviceNotRegistered → se borra el token).
 * Nunca lanza por un fallo de Expo: lo refleja en el resultado de cada aviso.
 */
export async function enviarAvisos(
  admin: SupabaseClient,
  avisos: Aviso[],
): Promise<{ resultado: Map<string, Resultado>; bandejaEscrita: Set<string> }> {
  const resultado = new Map<string, Resultado>();
  const bandejaEscrita = new Set<string>();
  if (avisos.length === 0) return { resultado, bandejaEscrita };

  // 1. Perfiles (un query por cada 100 usuarios, no uno por aviso).
  const perfiles = new Map<string, Perfil>();
  const ids = [...new Set(avisos.map((a) => a.usuarioId))];
  for (const grupo of trozos(ids, LOTE_IN)) {
    const { data, error } = await admin.from('profiles')
      .select('id, expo_push_token, notif_encomiendas, notif_boletos, notif_recordatorios, eliminada_at')
      .in('id', grupo);
    if (error) throw new Error(`No se pudieron leer los perfiles: ${error.message}`);
    for (const p of (data ?? []) as Perfil[]) perfiles.set(p.id, p);
  }

  const vigentes = avisos.filter((a) => {
    const p = perfiles.get(a.usuarioId);
    if (!p || p.eliminada_at) {
      resultado.set(a.ref, 'SIN_USUARIO');
      return false;
    }
    return true;
  });

  // 2. Bandeja in-app (independiente de las preferencias de push, igual que _notificar_usuario).
  const conBandeja = vigentes.filter((a) => a.escribirBandeja);
  if (conBandeja.length > 0) {
    const { error } = await admin.from('notificaciones_usuario').insert(conBandeja.map((a) => ({
      usuario_id: a.usuarioId, tipo: a.tipo, titulo: a.titulo, mensaje: a.mensaje,
      recurso_tipo: a.recursoTipo, recurso_id: a.recursoId,
    })));
    if (error) {
      // Sin bandeja no se manda el push: se reintenta todo el aviso en la próxima pasada.
      console.error('[push] no se pudo escribir la bandeja:', error.message);
      for (const a of conBandeja) resultado.set(a.ref, 'REINTENTAR');
    } else {
      for (const a of conBandeja) bandejaEscrita.add(a.ref);
    }
  }

  // 3. Mensajes para Expo.
  const logs: Record<string, unknown>[] = [];
  const porEnviar: { aviso: Aviso; token: string }[] = [];
  for (const a of vigentes) {
    if (resultado.has(a.ref)) continue;
    const p = perfiles.get(a.usuarioId)!;
    if (preferenciaApagada(p, a.recursoTipo)) {
      resultado.set(a.ref, 'PREFERENCIA');
      continue;
    }
    const token = p.expo_push_token?.trim() ?? '';
    if (!token || !TOKEN_RE.test(token)) {
      resultado.set(a.ref, 'SIN_TOKEN');
      logs.push({
        destinatario_id: a.usuarioId, destinatario_contacto: contacto(token || null), canal: 'PUSH',
        titulo: a.titulo, contenido: a.mensaje, estado_envio: 'FALLIDO',
        recurso_tipo: a.recursoTipo, recurso_id: a.recursoId,
      });
      continue;
    }
    porEnviar.push({ aviso: a, token });
  }

  const tokensInvalidos = new Map<string, string>(); // usuarioId -> token
  for (const lote of trozos(porEnviar, LOTE_EXPO)) {
    const mensajes = lote.map(({ aviso, token }) => ({
      to: token,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      title: recortar(aviso.titulo, 150),
      body: recortar(aviso.mensaje, 1000),
      data: { recurso_tipo: aviso.recursoTipo, recurso_id: aviso.recursoId, tipo: aviso.tipo },
    }));

    let tickets: Ticket[] | null = null;
    let definitivo = false;
    try {
      const res = await fetchConReintentos(EXPO_SEND_URL, {
        method: 'POST', headers: cabecerasExpo(), body: JSON.stringify(mensajes),
      }, { intentos: 3, timeoutMs: 15_000 });
      const json = await res.json().catch(() => null) as { data?: Ticket[]; errors?: unknown } | null;
      if (res.ok && Array.isArray(json?.data) && json!.data.length === lote.length) {
        tickets = json!.data;
      } else {
        // 4xx de la petición entera (p. ej. credenciales o tokens de otro proyecto): no se reintenta.
        definitivo = res.status >= 400 && res.status < 500;
        console.error(`[push] Expo respondió ${res.status}:`, JSON.stringify(json?.errors ?? json).slice(0, 500));
      }
    } catch (e) {
      console.error('[push] Expo no respondió:', (e as Error)?.message ?? e);
    }

    lote.forEach(({ aviso, token }, i) => {
      const t = tickets?.[i];
      let estado: Resultado;
      if (!tickets) {
        estado = definitivo ? 'FALLIDO' : 'REINTENTAR';
      } else if (t?.status === 'ok') {
        estado = 'ENVIADO';
      } else {
        const err = t?.details?.error ?? '';
        if (err === 'DeviceNotRegistered') tokensInvalidos.set(aviso.usuarioId, token);
        estado = err === 'MessageRateExceeded' ? 'REINTENTAR' : 'FALLIDO';
        console.warn(`[push] ticket con error para ${aviso.usuarioId}: ${err || t?.message || 'desconocido'}`);
      }
      resultado.set(aviso.ref, estado);
      if (estado !== 'REINTENTAR') {
        logs.push({
          destinatario_id: aviso.usuarioId, destinatario_contacto: contacto(token), canal: 'PUSH',
          titulo: aviso.titulo, contenido: aviso.mensaje, estado_envio: estado === 'ENVIADO' ? 'ENVIADO' : 'FALLIDO',
          recurso_tipo: aviso.recursoTipo, recurso_id: aviso.recursoId,
          ...(estado === 'ENVIADO' && t?.id ? { expo_ticket_id: t.id } : {}),
        });
      }
    });
  }

  for (const [usuarioId, token] of tokensInvalidos) await limpiarToken(admin, usuarioId, token);
  await registrarLog(admin, logs);
  return { resultado, bandejaEscrita };
}

/**
 * Recibos de Expo (los errores de entrega llegan aquí, no en el ticket). Requiere las columnas
 * notificaciones_log.expo_ticket_id y receipt_revisado_at; si no existen, no hace nada.
 * Revisa tickets de entre 15 min y 24 h; marca FALLIDO los que fallaron y limpia los tokens muertos.
 */
export async function revisarRecibos(admin: SupabaseClient): Promise<{ revisados: number; fallidos: number } | null> {
  const ahora = Date.now();
  const { data, error } = await admin.from('notificaciones_log')
    .select('id, destinatario_id, destinatario_contacto, expo_ticket_id')
    .eq('canal', 'PUSH').eq('estado_envio', 'ENVIADO')
    .not('expo_ticket_id', 'is', null).is('receipt_revisado_at', null)
    .lt('created_at', new Date(ahora - 15 * 60_000).toISOString())
    .gt('created_at', new Date(ahora - 24 * 3_600_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(LOTE_RECIBOS);
  if (error) {
    // 42703 / PGRST: columnas aún no creadas. No es un fallo del envío.
    if (!/expo_ticket_id|receipt_revisado_at|42703/.test(`${error.code} ${error.message}`)) {
      console.error('[push] no se pudieron leer los tickets pendientes:', error.message);
    }
    return null;
  }
  const filas = (data ?? []) as { id: string; destinatario_id: string | null; destinatario_contacto: string; expo_ticket_id: string }[];
  if (filas.length === 0) return { revisados: 0, fallidos: 0 };

  let recibos: Record<string, Ticket> = {};
  try {
    const res = await fetchConReintentos(EXPO_RECEIPTS_URL, {
      method: 'POST', headers: cabecerasExpo(), body: JSON.stringify({ ids: filas.map((f) => f.expo_ticket_id) }),
    }, { intentos: 2, timeoutMs: 15_000 });
    const json = await res.json().catch(() => null) as { data?: Record<string, Ticket> } | null;
    if (!res.ok || !json?.data) {
      console.error(`[push] getReceipts respondió ${res.status}`);
      return null;
    }
    recibos = json.data;
  } catch (e) {
    console.error('[push] getReceipts no respondió:', (e as Error)?.message ?? e);
    return null;
  }

  const revisados: string[] = [];
  const fallidos: string[] = [];
  for (const f of filas) {
    const r = recibos[f.expo_ticket_id];
    if (!r) continue; // todavía no está: se revisa en otra pasada
    revisados.push(f.id);
    if (r.status === 'error') {
      fallidos.push(f.id);
      const err = r.details?.error ?? '';
      console.warn(`[push] recibo con error (${f.expo_ticket_id}): ${err || r.message}`);
      const token = f.destinatario_contacto.replace(/^push\s+/, '');
      if (err === 'DeviceNotRegistered' && f.destinatario_id && TOKEN_RE.test(token)) {
        await limpiarToken(admin, f.destinatario_id, token);
      }
    }
  }
  const marca = new Date().toISOString();
  for (const grupo of trozos(revisados, LOTE_IN)) {
    const { error: e1 } = await admin.from('notificaciones_log').update({ receipt_revisado_at: marca }).in('id', grupo);
    if (e1) console.error('[push] no se pudo marcar recibos revisados:', e1.message);
  }
  for (const grupo of trozos(fallidos, LOTE_IN)) {
    const { error: e2 } = await admin.from('notificaciones_log').update({ estado_envio: 'FALLIDO' }).in('id', grupo);
    if (e2) console.error('[push] no se pudo marcar recibos fallidos:', e2.message);
  }
  return { revisados: revisados.length, fallidos: fallidos.length };
}
