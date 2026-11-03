// enviar-whatsapp
// Envío de mensajes por WhatsApp (con un reintento y respaldo por SMS) a través de Twilio.
// La llama el super admin desde el panel (reenviar PIN) con la service role.
//
// Configuración (secretos de la función; sin ellos responde enviado: false y no simula nada):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM   p. ej. "+14155238886" (remitente de WhatsApp aprobado)
//   TWILIO_CONTENT_SIDS    JSON { "<template_id>": "HX…" } con las plantillas aprobadas por Meta
//                          (pin_retiro_encomienda: {{1}} = tracking_id, {{2}} = pin_retiro)
//   TWILIO_SMS_FROM        (opcional) número para el respaldo por SMS
import '@supabase/functions-js/edge-runtime.d.ts';
import { ErrorEntrada, errorInterno, esUuid, fallar, filtrarMetodo, leerJson, responder, texto } from '../_shared/http.ts';
import { aplicarLimite, clienteAdmin, soloServiceRole } from '../_shared/supabase.ts';

// Plantillas conocidas: variables obligatorias y texto del SMS de respaldo.
const PLANTILLAS: Record<string, { variables: string[]; sms: (v: Record<string, string>) => string }> = {
  pin_retiro_encomienda: {
    variables: ['tracking_id', 'pin_retiro'],
    sms: (v) => `EnBus: el PIN de retiro de la encomienda ${v.tracking_id} es ${v.pin_retiro}. No lo compartas con nadie más.`,
  },
};

// Variables que nunca se guardan en claro en notificaciones_log.
const SECRETAS = new Set(['pin_retiro', 'pin']);

/** "0414-123.45.67" / "584141234567" / "+58 414 1234567" → "+584141234567". null si no es válido. */
function telefonoE164(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  let d = t.replace(/\D/g, '');
  if (t.startsWith('+')) return /^\d{10,15}$/.test(d) ? `+${d}` : null;
  if (d.startsWith('00')) d = d.slice(2);
  if (/^0\d{10}$/.test(d)) return `+58${d.slice(1)}`;        // 0414…: número venezolano
  if (/^4\d{9}$/.test(d)) return `+58${d}`;                  // 414… sin el 0
  if (/^58\d{10}$/.test(d)) return `+${d}`;
  return null;
}

function configuracion() {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';
  const smsFrom = Deno.env.get('TWILIO_SMS_FROM') ?? '';
  let contentSids: Record<string, string> = {};
  try { contentSids = JSON.parse(Deno.env.get('TWILIO_CONTENT_SIDS') ?? '{}') ?? {}; } catch { contentSids = {}; }
  return { sid, token, waFrom, smsFrom, contentSids, lista: Boolean(sid && token && (waFrom || smsFrom)) };
}

async function twilio(cfg: ReturnType<typeof configuracion>, params: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${cfg.sid}:${cfg.token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      await res.body?.cancel();
      return true;
    }
    const detalle = await res.text().catch(() => '');
    console.error(`[enviar-whatsapp] Twilio respondió ${res.status}: ${detalle.slice(0, 300)}`);
    return false;
  } catch (e) {
    console.error('[enviar-whatsapp] Twilio no respondió:', (e as Error)?.message ?? e);
    return false;
  }
}

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;
  const sinPermiso = soloServiceRole(req);
  if (sinPermiso) return sinPermiso;

  try {
    const body = await leerJson(req);
    const telefono = telefonoE164(body.telefono);
    const templateId = texto(body.template_id, 60);
    const plantilla = templateId ? PLANTILLAS[templateId] : undefined;
    const variablesEntrada = body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)
      ? body.variables as Record<string, unknown> : {};
    const variables: Record<string, string> = {};
    for (const [k, v] of Object.entries(variablesEntrada).slice(0, 20)) {
      if (typeof v === 'string' || typeof v === 'number') variables[k.slice(0, 40)] = String(v).slice(0, 200);
    }
    if (!telefono) return fallar(400, 'EB_DATOS_INVALIDOS', 'El teléfono no es válido.');
    if (!plantilla) return fallar(400, 'EB_DATOS_INVALIDOS', 'La plantilla de WhatsApp no existe.');
    const faltan = plantilla.variables.filter((k) => !variables[k]);
    if (faltan.length) return fallar(400, 'EB_DATOS_INVALIDOS', `Faltan datos para el mensaje: ${faltan.join(', ')}.`);
    const userId = esUuid(body.user_id) ? body.user_id : null;
    const recursoId = esUuid(body.recurso_id) ? body.recurso_id : null;

    // Máximo 5 mensajes por hora al mismo teléfono (evita spam por reintentos o doble clic).
    const limite = await aplicarLimite(`whatsapp:${telefono}`, 5, 3600);
    if (limite) return limite;

    const cfg = configuracion();
    let enviado = false;
    let canalUsado: 'WHATSAPP' | 'SMS' = 'WHATSAPP';
    if (!cfg.lista) {
      console.warn('[enviar-whatsapp] Twilio no está configurado: no se envía nada.');
    } else {
      const contentSid = cfg.contentSids[templateId!];
      if (cfg.waFrom && contentSid) {
        const params = {
          From: `whatsapp:${cfg.waFrom}`, To: `whatsapp:${telefono}`,
          ContentSid: contentSid,
          // Variables posicionales {{1}}, {{2}}… en el orden de PLANTILLAS[template].variables.
          ContentVariables: JSON.stringify(Object.fromEntries(plantilla.variables.map((k, i) => [String(i + 1), variables[k]]))),
        };
        enviado = await twilio(cfg, params);
        if (!enviado) {
          await new Promise((r) => setTimeout(r, 800));
          enviado = await twilio(cfg, params);
        }
      }
      if (!enviado && cfg.smsFrom) {
        canalUsado = 'SMS';
        enviado = await twilio(cfg, { From: cfg.smsFrom, To: telefono, Body: plantilla.sms(variables) });
      }
    }

    const variablesLog = Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, SECRETAS.has(k) ? '••••' : v]));
    const { error: logError } = await clienteAdmin().from('notificaciones_log').insert({
      destinatario_id: userId,
      destinatario_contacto: telefono,
      canal: canalUsado,
      titulo: `Template: ${templateId}`,
      contenido: JSON.stringify(variablesLog),
      estado_envio: enviado ? (canalUsado === 'SMS' ? 'FALLBACK_SMS' : 'ENVIADO') : 'FALLIDO',
      recurso_tipo: texto(body.recurso_tipo, 40),
      recurso_id: recursoId,
    });
    if (logError) console.error('[enviar-whatsapp] no se pudo registrar el envío:', logError.message);

    return responder(200, {
      enviado,
      canal_usado: canalUsado,
      ...(cfg.lista ? {} : { reason: 'El envío por WhatsApp no está configurado.' }),
    });
  } catch (e) {
    if (e instanceof ErrorEntrada) return e.respuesta();
    return errorInterno('enviar-whatsapp', e);
  }
});
