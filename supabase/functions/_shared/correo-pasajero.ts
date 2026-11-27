// Correos al pasajero a partir de los avisos de la cola pending_notifications.
//
// El texto lo escribe la RPC que creó el aviso (titulo + mensaje, el mismo del push y de la
// bandeja); aquí se le pone la plantilla de EnBus (shared/correo.ts), los datos del boleto o la
// encomienda y el botón para verlo en el sitio.
//
// Mejor esfuerzo: un correo que falla no frena el push ni reintenta la fila. Cada envío lleva
// Idempotency-Key = id del aviso, así que si la fila se reintenta (push caído) Resend no lo duplica.
//
// Secretos de la función: RESEND_API_KEY, RESEND_FROM ("EnBus <noreply@enbusve.com>") y
// SITIO_URL (https://enbusve.com, sin "/" final). Sin RESEND_API_KEY no se envía nada.
import type { SupabaseClient } from './supabase.ts';
import type { Aviso } from './push.ts';
import { correoHtml, correoTexto, type Correo, type TonoCorreo } from './correo.generated.ts';

const API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const REMITENTE = Deno.env.get('RESEND_FROM')?.trim() || 'EnBus <onboarding@resend.dev>';
const SITIO = (Deno.env.get('SITIO_URL') ?? '').trim().replace(/\/+$/, '');

/** Avisos que también van por correo, con su pastilla de estado y el texto del botón. */
const TIPOS: Record<string, { estado: string; tono: TonoCorreo; boton: string }> = {
  BOLETO_CONFIRMADO: { estado: 'Boleto confirmado', tono: 'exito', boton: 'Ver mi boleto' },
  PAGO_APROBADO: { estado: 'Pago confirmado', tono: 'exito', boton: 'Ver detalle' },
  PAGO_RECHAZADO: { estado: 'Pago rechazado', tono: 'error', boton: 'Ver detalle' },
  REEMBOLSO_ENVIADO: { estado: 'Reembolso enviado', tono: 'exito', boton: 'Ver mi boleto' },
  VIAJE_CANCELADO: { estado: 'Viaje cancelado', tono: 'error', boton: 'Ver mi boleto' },
  VIAJE_REPROGRAMADO: { estado: 'Cambio de horario', tono: 'aviso', boton: 'Ver mi boleto' },
  ENCOMIENDA_PARA_TI: { estado: 'Encomienda', tono: 'coral', boton: 'Seguir mi encomienda' },
  ENCOMIENDA_EN_CAMINO: { estado: 'En camino', tono: 'coral', boton: 'Seguir mi encomienda' },
  ENCOMIENDA_LISTA_RETIRO: { estado: 'Lista para retirar', tono: 'exito', boton: 'Ver mi encomienda' },
  ENCOMIENDA_RECHAZADA: { estado: 'Envío no recibido', tono: 'error', boton: 'Ver mi encomienda' },
  DEVOLUCION_AUTOMATICA: { estado: 'Devuelta a origen', tono: 'aviso', boton: 'Ver mi encomienda' },
};

const CONCURRENCIA = 2; // Resend limita las peticiones por segundo de la cuenta

const ciudad = (c: string | null | undefined) =>
  (c ?? '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());

function fechaHora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  }).format(d);
}

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

interface BoletoFila {
  codigo_boleto: string | null;
  asiento: number | null;
  pasajero_nombre: string | null;
  viajes: Uno<{ fecha_hora_salida: string | null; rutas: Uno<{ ciudad_origen: string; ciudad_destino: string }> }>;
  cooperativas: Uno<{ nombre: string | null }>;
}

async function detallesBoleto(admin: SupabaseClient, id: string): Promise<Correo['detalles']> {
  const { data, error } = await admin.from('boletos')
    .select('codigo_boleto, asiento, pasajero_nombre, viajes ( fecha_hora_salida, rutas ( ciudad_origen, ciudad_destino ) ), cooperativas ( nombre )')
    .eq('id', id).maybeSingle<BoletoFila>();
  if (error || !data) return undefined;
  const viaje = uno(data.viajes);
  const ruta = uno(viaje?.rutas ?? null);
  const filas = [
    ruta ? { etiqueta: 'Ruta', valor: `${ciudad(ruta.ciudad_origen)} → ${ciudad(ruta.ciudad_destino)}` } : null,
    fechaHora(viaje?.fecha_hora_salida) ? { etiqueta: 'Salida', valor: fechaHora(viaje?.fecha_hora_salida)! } : null,
    uno(data.cooperativas)?.nombre ? { etiqueta: 'Cooperativa', valor: uno(data.cooperativas)!.nombre! } : null,
    data.pasajero_nombre ? { etiqueta: 'Pasajero', valor: data.pasajero_nombre } : null,
    data.asiento != null ? { etiqueta: 'Asiento', valor: String(data.asiento) } : null,
    data.codigo_boleto ? { etiqueta: 'Código', valor: data.codigo_boleto } : null,
  ];
  return filas.filter((f): f is { etiqueta: string; valor: string } => f !== null);
}

async function detallesEncomienda(admin: SupabaseClient, id: string): Promise<Correo['detalles']> {
  const { data, error } = await admin.from('encomiendas')
    .select('tracking_id, ciudad_origen, ciudad_destino').eq('id', id)
    .maybeSingle<{ tracking_id: string | null; ciudad_origen: string | null; ciudad_destino: string | null }>();
  if (error || !data) return undefined;
  const filas = [
    data.ciudad_origen && data.ciudad_destino
      ? { etiqueta: 'Ruta', valor: `${ciudad(data.ciudad_origen)} → ${ciudad(data.ciudad_destino)}` } : null,
    data.tracking_id ? { etiqueta: 'Código de seguimiento', valor: data.tracking_id } : null,
  ];
  return filas.filter((f): f is { etiqueta: string; valor: string } => f !== null);
}

function enlace(a: Aviso): string | null {
  if (!SITIO) return null;
  if (a.recursoTipo === 'boleto' && a.recursoId) return `${SITIO}/cuenta/boletos/${a.recursoId}`;
  if (a.recursoTipo === 'encomienda' && a.recursoId) return `${SITIO}/cuenta/encomiendas/${a.recursoId}`;
  return `${SITIO}/cuenta`;
}

async function armar(admin: SupabaseClient, a: Aviso): Promise<Correo | null> {
  const tipo = a.tipo ? TIPOS[a.tipo] : undefined;
  if (!tipo) return null;
  let detalles: Correo['detalles'];
  try {
    if (a.recursoId && a.recursoTipo === 'boleto') detalles = await detallesBoleto(admin, a.recursoId);
    else if (a.recursoId && a.recursoTipo === 'encomienda') detalles = await detallesEncomienda(admin, a.recursoId);
  } catch {
    detalles = undefined; // sin detalles el correo sigue siendo útil
  }
  const url = enlace(a);
  return {
    asunto: a.titulo,
    preencabezado: a.mensaje.slice(0, 140),
    estado: { texto: tipo.estado, tono: tipo.tono },
    titulo: a.titulo,
    parrafos: [a.mensaje],
    detalles,
    boton: url ? { texto: tipo.boton, url } : undefined,
    motivo: 'Recibes este correo por tu cuenta de EnBus.',
  };
}

async function enviar(para: string, correo: Correo, idempotencia: string): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencia,
    },
    body: JSON.stringify({
      from: REMITENTE, to: [para], subject: correo.asunto,
      html: correoHtml(correo), text: correoTexto(correo),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.ok) return true;
  console.error(`[correo-pasajero] Resend ${r.status}:`, (await r.text()).slice(0, 300));
  return false;
}

/** ¿Este aviso lleva correo? (para no leer el usuario de los que no). */
export const avisoConCorreo = (a: Aviso) => Boolean(API_KEY && a.tipo && TIPOS[a.tipo]);

/**
 * Manda por correo los avisos que lo llevan. Nunca lanza. `hasta` = Date.now() límite:
 * lo que no alcance a salir se registra y no se reintenta.
 */
export async function enviarCorreosAvisos(admin: SupabaseClient, avisos: Aviso[], hasta: number): Promise<{ enviados: number; fallidos: number }> {
  const cola = avisos.filter(avisoConCorreo);
  let enviados = 0;
  let fallidos = 0;
  const trabajador = async () => {
    for (let a = cola.shift(); a; a = cola.shift()) {
      if (Date.now() > hasta) { fallidos++; continue; }
      try {
        const { data, error } = await admin.auth.admin.getUserById(a.usuarioId);
        const email = data?.user?.email;
        if (error || !email) continue; // cuenta sin correo (p. ej. solo teléfono)
        const correo = await armar(admin, a);
        if (!correo) continue;
        if (await enviar(email, correo, `aviso-${a.ref}`)) enviados++;
        else fallidos++;
      } catch (e) {
        fallidos++;
        console.error(`[correo-pasajero] ${a.ref}:`, (e as Error)?.message ?? e);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  if (fallidos) console.warn(`[correo-pasajero] ${fallidos} correo(s) sin enviar.`);
  return { enviados, fallidos };
}
