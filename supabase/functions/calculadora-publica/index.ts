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

  // Identificar IP para rate limit (en Deno Deploy se usa header genérico o el objeto conn remoto, aquí usamos fallback headers)
  const clientIp = req.headers.get("x-forwarded-for") || "unknown-ip";
  const isAllowed = checkRateLimit(clientIp, 60, 60000); // 60 reqs per minute

  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { 
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  try {
    const { peso_kg, estado_origen, ciudad_origen, estado_destino, ciudad_destino } = await req.json();

    if (!peso_kg || peso_kg <= 0) {
      return new Response(JSON.stringify({ error: "Peso inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Obtener tarifa activa
    const { data: tarifaData, error: tarifaError } = await supabase
      .from('tarifas')
      .select('tarifa_por_kg, factor_distancia_por_min, peso_max_kg, dimensiones_max_cm')
      .eq('activa', true)
      .single();

    if (tarifaError || !tarifaData) throw new Error("No hay tarifa activa configurada");

    if (peso_kg > tarifaData.peso_max_kg) {
      return new Response(JSON.stringify({ 
        error: `El peso máximo permitido es ${tarifaData.peso_max_kg} kg` 
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Obtener duración de ruta. Se busca cualquier ruta activa entre origen/destino para usar su duración
    // Asumimos que la duración es estándar o tomamos la menor.
    const { data: rutaData, error: rutaError } = await supabase
      .from('rutas')
      .select('duracion_estimada_min')
      .eq('estado_origen', estado_origen)
      .eq('ciudad_origen', ciudad_origen)
      .eq('estado_destino', estado_destino)
      .eq('ciudad_destino', ciudad_destino)
      .eq('activa', true)
      .order('duracion_estimada_min', { ascending: true })
      .limit(1)
      .single();

    if (rutaError || !rutaData) {
       return new Response(JSON.stringify({ error: "No hay rutas activas para ese destino" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Calcular
    // costo = peso_kg * tarifa_por_kg * (1 + factor_distancia_por_min * duracion_estimada_min)
    const costo = (peso_kg * tarifaData.tarifa_por_kg * (1 + tarifaData.factor_distancia_por_min * rutaData.duracion_estimada_min)).toFixed(2);

    const data = {
      costo_estimado: parseFloat(costo),
      peso_max_kg: tarifaData.peso_max_kg,
      dimensiones_max_referencia: `${tarifaData.dimensiones_max_cm}x${tarifaData.dimensiones_max_cm}x${tarifaData.dimensiones_max_cm}cm`,
      disclaimer: "Precio aproximado, sujeto a finalización y pesaje físico en taquilla"
    };

    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
