import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for") || "unknown-ip";
  const isAllowed = checkRateLimit(clientIp, 30, 60000); // 30 reqs per minute

  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { 
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  try {
    const { tracking_id } = await req.json();

    if (!tracking_id) {
      return new Response(JSON.stringify({ error: "tracking_id es requerido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Obtener datos públicos de la encomienda
    const { data: encData, error: encError } = await supabase
      .from('encomiendas')
      .select(`
        id,
        tracking_id,
        estado,
        estado_origen,
        ciudad_origen,
        estado_destino,
        ciudad_destino,
        created_at,
        updated_at,
        cooperativas (nombre)
      `)
      .eq('tracking_id', tracking_id)
      .single();

    if (encError || !encData) {
       return new Response(JSON.stringify({ error: "Tracking ID no encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Obtener historial de estados
    const { data: historialData, error: historialError } = await supabase
      .from('encomienda_estado_historial')
      .select('estado_nuevo, created_at, nota')
      .eq('encomienda_id', encData.id)
      .order('created_at', { ascending: false });

    if (historialError) throw new Error("Error obteniendo historial");

    const responsePayload = {
      tracking_id: encData.tracking_id,
      estado: encData.estado,
      origen: `${encData.ciudad_origen}, ${encData.estado_origen}`,
      destino: `${encData.ciudad_destino}, ${encData.estado_destino}`,
      cooperativa: encData.cooperativas ? encData.cooperativas.nombre : null,
      fechas: {
        creado: encData.created_at,
        actualizado: encData.updated_at
      },
      historial_estados: historialData
    };

    return new Response(JSON.stringify(responsePayload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
