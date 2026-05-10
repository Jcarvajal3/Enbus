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

    const { telefono, template_id, variables, user_id, recurso_tipo, recurso_id } = await req.json();

    if (!telefono) {
        return new Response(JSON.stringify({ error: "Teléfono es requerido" }), { status: 400, headers: corsHeaders });
    }

    // M-08: Lógica de Retry y Fallback a SMS
    let twilioSuccess = false;
    let fallbackToSms = false;
    let canalUsado = 'WHATSAPP';
    
    // Simulación de API de Twilio: Intentar WhatsApp
    async function sendTwilioMessage(channel: string) {
        // En un caso real: fetch('https://api.twilio.com/...', { ... })
        // Simularemos éxito aleatorio para probar
        const isSuccess = Math.random() > 0.3; 
        console.log(`Enviando ${channel} a ${telefono} con template ${template_id}. Resultado simulado: ${isSuccess}`);
        if (!isSuccess) throw new Error("Twilio API timeout/error");
        return true;
    }

    try {
        await sendTwilioMessage('whatsapp');
        twilioSuccess = true;
    } catch (e1) {
        console.error("Primer intento WhatsApp falló, reintentando...", e1);
        try {
            await sendTwilioMessage('whatsapp');
            twilioSuccess = true;
        } catch (e2) {
            console.error("Segundo intento WhatsApp falló, haciendo fallback a SMS...", e2);
            fallbackToSms = true;
        }
    }

    if (fallbackToSms) {
        canalUsado = 'SMS';
        try {
            await sendTwilioMessage('sms');
            twilioSuccess = true;
        } catch (e3) {
            console.error("Fallo definitivo enviando SMS", e3);
        }
    }

    // Logear envío
    await supabase.from('notificaciones_log').insert({
        destinatario_id: user_id || null,
        destinatario_contacto: telefono,
        canal: canalUsado,
        titulo: `Template: ${template_id}`,
        contenido: JSON.stringify(variables),
        estado_envio: twilioSuccess ? 'ENVIADO' : 'FALLIDO',
        recurso_tipo: recurso_tipo,
        recurso_id: recurso_id
    });

    return new Response(JSON.stringify({ enviado: twilioSuccess, canal_usado: canalUsado }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
