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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, titulo, mensaje, recurso_tipo, recurso_id, sin_bandeja } = await req.json();

    if (!user_id || !titulo || !mensaje) {
        return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400, headers: corsHeaders });
    }

    // 1. Obtener perfil para ver preferencias y token
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('expo_push_token, notif_encomiendas, notif_boletos, notif_recordatorios')
      .eq('id', user_id)
      .single();

    if (error || !profile) {
        // 404 = error permanente: procesar-notificaciones-pendientes no lo reintenta.
        return new Response(JSON.stringify({ error: "Usuario no encontrado" }), { status: 404, headers: corsHeaders });
    }

    // Revisar preferencias (ej: si es recurso de encomienda y tiene las notificaciones de encomienda apagadas, no enviar push)
    if (recurso_tipo === 'encomienda' && !profile.notif_encomiendas) {
        return new Response(JSON.stringify({ enviado: false, reason: "Preferencias desactivadas para encomiendas" }), { headers: corsHeaders });
    }
    if (recurso_tipo === 'boleto' && !profile.notif_boletos) {
        return new Response(JSON.stringify({ enviado: false, reason: "Preferencias desactivadas para boletos" }), { headers: corsHeaders });
    }
    if (recurso_tipo === 'recordatorio' && !profile.notif_recordatorios) {
        return new Response(JSON.stringify({ enviado: false, reason: "Preferencias de recordatorios desactivadas" }), { headers: corsHeaders });
    }

    let pushSent = false;

    // 2. Enviar Push si tiene token
    if (profile.expo_push_token) {
        try {
            const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: profile.expo_push_token,
                    sound: 'default',
                    title: titulo,
                    body: mensaje,
                    data: { recurso_tipo, recurso_id },
                }),
            });
            const expoData = await expoResponse.json();
            console.log("Expo Push Response:", expoData);
            pushSent = true;
        } catch (e) {
            console.error("Error enviando push a Expo:", e);
        }
    }

    // 3. Registrar en bandeja in-app (notificaciones_usuario).
    //    sin_bandeja = true: la RPC que encoló el aviso ya la escribió en la misma transacción.
    if (sin_bandeja !== true) {
        await supabase.from('notificaciones_usuario').insert({
            usuario_id: user_id,
            titulo: titulo,
            mensaje: mensaje,
            recurso_tipo: recurso_tipo,
            recurso_id: recurso_id
        });
    }

    // 4. Logear en notificaciones_log (con service_role bypass)
    await supabase.from('notificaciones_log').insert({
        destinatario_id: user_id,
        destinatario_contacto: "push " + (profile.expo_push_token || 'no_token'),
        canal: 'PUSH',
        titulo: titulo,
        contenido: mensaje,
        estado_envio: pushSent ? 'ENVIADO' : 'FALLIDO',
        recurso_tipo: recurso_tipo,
        recurso_id: recurso_id
    });

    return new Response(JSON.stringify({ enviado: pushSent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
