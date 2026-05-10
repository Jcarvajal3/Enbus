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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { encomienda_id, peso_kg } = await req.json();

    if (!encomienda_id || !peso_kg || peso_kg <= 0) {
      return new Response(JSON.stringify({ error: "Datos inválidos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    // Service role se necesita para hacer updates en base si el RLS requiere que el auth header pertenezca, 
    // pero idealmente creamos el cliente en nombre del usuario:
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("Usuario no autenticado");

    // Verificar rol directamente (o confiar en RLS, pero la spec pide validarlo aquí)
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role, cooperativa_id')
      .eq('id', user.id)
      .single();

    if (profileError || !['taquillero', 'admin_cooperativa'].includes(profile.role)) {
      throw new Error("No tienes permisos para esta acción");
    }

    // Usar service_role o continuar con user client (RLS debería validarlo)
    // 1. Obtener la encomienda
    const { data: enc, error: encError } = await supabaseClient
      .from('encomiendas')
      .select('estado_origen, ciudad_origen, estado_destino, ciudad_destino, cooperativa_id')
      .eq('id', encomienda_id)
      .single();

    if (encError || !enc) throw new Error("Encomienda no encontrada");
    if (enc.cooperativa_id !== profile.cooperativa_id) throw new Error("Acceso denegado a cooperativa");

    // 2. Obtener tarifa activa
    const { data: tarifaData, error: tarifaError } = await supabaseClient
      .from('tarifas')
      .select('tarifa_por_kg, factor_distancia_por_min, peso_max_kg')
      .eq('activa', true)
      .single();

    if (tarifaError || !tarifaData) throw new Error("No hay tarifa activa");

    if (peso_kg > tarifaData.peso_max_kg) {
      throw new Error(`Peso excede el máximo permitido de ${tarifaData.peso_max_kg} kg`);
    }

    // 3. Obtener ruta aplicable
    const { data: ruta, error: rutaError } = await supabaseClient
      .from('rutas')
      .select('duracion_estimada_min')
      .eq('estado_origen', enc.estado_origen)
      .eq('ciudad_origen', enc.ciudad_origen)
      .eq('estado_destino', enc.estado_destino)
      .eq('ciudad_destino', enc.ciudad_destino)
      .eq('cooperativa_id', profile.cooperativa_id)
      .eq('activa', true)
      .limit(1)
      .single();

    if (rutaError || !ruta) throw new Error("La cooperativa no tiene una ruta activa para este destino");

    // 4. Calcular costo
    const costo = parseFloat((peso_kg * tarifaData.tarifa_por_kg * (1 + tarifaData.factor_distancia_por_min * ruta.duracion_estimada_min)).toFixed(2));

    // 5. Actualizar encomienda (RLS lo permite porque es taquillero de la cooperativa)
    const { data: updateRes, error: updateError } = await supabaseClient
      .from('encomiendas')
      .update({ 
        peso_kg: peso_kg,
        costo_calculado: costo,
        estado: 'POR_PAGAR'
      })
      .eq('id', encomienda_id)
      .select('costo_calculado, estado')
      .single();

    if (updateError) throw new Error("Error actualizando la encomienda: " + updateError.message);

    return new Response(JSON.stringify(updateRes), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
