// procesar-notificaciones-pendientes
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      .limit(50); // Batch de 50 para evitar timeout

    if (error) throw error;
    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ procesadas: 0, fallidas: 0 }), { status: 200, headers: corsHeaders });
    }

    let procesadas = 0;
    let fallidas = 0;

    for (const notif of notifications) {
        try {
            // Ejemplo de router
            if (notif.tipo_notificacion.includes('DEVOLUCION')) {
                // Invoca enviar-push
                await supabase.functions.invoke('enviar-push', {
                    body: {
                        user_id: notif.destinatario_id,
                        titulo: "Encomienda Devuelta",
                        mensaje: `Estimado remitente, su encomienda ${notif.payload?.tracking_id} ha sido devuelta a origen por falta de retiro.`,
                        recurso_tipo: notif.recurso_tipo,
                        recurso_id: notif.recurso_id
                    }
                });
            }
            
            // Marca como procesado
            await supabase.from('pending_notifications').update({ procesado: true }).eq('id', notif.id);
            procesadas++;
        } catch (e) {
            console.error(`Error procesando notificacion ${notif.id}:`, e);
            fallidas++;
        }
    }

    return new Response(JSON.stringify({ procesadas, fallidas }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
