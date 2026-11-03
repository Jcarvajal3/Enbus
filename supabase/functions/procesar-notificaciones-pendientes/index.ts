// procesar-notificaciones-pendientes
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Un aviso que sigue fallando después de 24 h se descarta (el push ya no sería oportuno).
const MAX_REINTENTO_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validar autorización interna (Service Role o ANON de pg_net)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: "No authorization" }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey); // Instancia privilegiada para leer/marcar la cola

    // 1. Obtener notificaciones pendientes
    const { data: notifications, error } = await supabase
      .from('pending_notifications')
      .select('*')
      .eq('procesado', false)
      .order('created_at', { ascending: true })
      .limit(50); // Batch de 50 para evitar timeout

    if (error) throw error;
    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ procesadas: 0, fallidas: 0 }), { status: 200, headers: corsHeaders });
    }

    let procesadas = 0;
    let fallidas = 0;

    for (const notif of notifications) {
        try {
            // Router por tipo de notificación
            let invokeError: unknown = null;
            if (notif.tipo_notificacion.includes('DEVOLUCION')) {
                // Devolución automática (cron auto_devolver_encomienda): la bandeja la escribe enviar-push.
                const tracking = notif.payload?.tracking_id ? ` ${notif.payload.tracking_id}` : '';
                const { error: errDevolucion } = await supabase.functions.invoke('enviar-push', {
                    body: {
                        user_id: notif.destinatario_id,
                        titulo: "Tu encomienda volvió a origen",
                        mensaje: `Nadie retiró la encomienda${tracking} a tiempo y la devolvimos a la oficina de origen. Pasa a buscarla con tu cédula.`,
                        recurso_tipo: notif.recurso_tipo,
                        recurso_id: notif.recurso_id,
                        tipo: notif.tipo_notificacion
                    }
                });
                invokeError = errDevolucion;
            } else if (notif.payload?.titulo && notif.payload?.mensaje) {
                // Genérica (encolada por las RPC de pagos, boletos y encomiendas). La bandeja in-app
                // ya la escribió la RPC en la misma transacción: sin_bandeja evita duplicarla.
                const { error: errGenerica } = await supabase.functions.invoke('enviar-push', {
                    body: {
                        user_id: notif.destinatario_id,
                        titulo: notif.payload.titulo,
                        mensaje: notif.payload.mensaje,
                        recurso_tipo: notif.recurso_tipo,
                        recurso_id: notif.recurso_id,
                        sin_bandeja: notif.payload.sin_bandeja === true,
                        tipo: notif.tipo_notificacion
                    }
                });
                invokeError = errGenerica;
            }

            if (invokeError) {
                // Se reintenta en la próxima pasada del cron.
                throw invokeError;
            }

            // Marca como procesado
            await supabase.from('pending_notifications').update({ procesado: true }).eq('id', notif.id);
            procesadas++;
        } catch (e) {
            console.error(`Error procesando notificacion ${notif.id}:`, e);
            fallidas++;
            // Errores permanentes (400/404 de enviar-push) o avisos con más de 24 h fallando se
            // descartan: si no, 50 fallos fijos bloquearían la cola para siempre.
            const status = (e as { context?: { status?: number } })?.context?.status;
            const edadMs = Date.now() - new Date(notif.created_at).getTime();
            if (status === 400 || status === 404 || edadMs > MAX_REINTENTO_MS) {
                console.error(`Notificacion ${notif.id} descartada (status ${status ?? 'n/d'}).`);
                await supabase.from('pending_notifications').update({ procesado: true }).eq('id', notif.id);
            }
        }
    }

    return new Response(JSON.stringify({ procesadas, fallidas }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
