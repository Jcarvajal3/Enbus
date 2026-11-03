// eliminar-cuenta
// Segundo paso de la baja de cuenta (requisito de Google Play). El primero es la RPC
// fn_eliminar_mi_cuenta, que comprueba que no haya actividad pendiente, anonimiza el perfil y
// registra la solicitud en bajas_cuenta. Aquí se borra la identidad de Auth (borrado suave: la
// fila de auth.users se conserva anonimizada y el perfil, con sus boletos y encomiendas, sigue
// existiendo para la contabilidad de las cooperativas).
// Si esta función no está desplegada o falla, el super admin completa la baja desde Usuarios.
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const responder = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return responder({ error: 'EB_DATOS_INVALIDOS', hint: 'Usa POST para eliminar la cuenta.' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return responder({ error: 'EB_NO_AUTENTICADO', hint: 'Tu sesión expiró. Inicia sesión de nuevo.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // 1. Quién pide la baja (con su propio JWT).
    const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) {
      return responder({ error: 'EB_NO_AUTENTICADO', hint: 'Tu sesión expiró. Inicia sesión de nuevo.' }, 401);
    }

    // 2. Solo si la app ya confirmó la baja con fn_eliminar_mi_cuenta.
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: perfil, error: perfilError } = await supabase
      .from('profiles')
      .select('eliminada_at')
      .eq('id', user.id)
      .maybeSingle();
    if (perfilError) throw perfilError;
    if (!perfil?.eliminada_at) {
      return responder({ error: 'EB_ESTADO_CAMBIO', hint: 'Primero confirma la baja desde la app.' }, 409);
    }

    // 3. Borrado suave de la identidad: ya no puede iniciar sesión y sus datos de acceso se anonimizan.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id, true);
    if (deleteError) {
      console.error(`eliminar-cuenta: no se pudo borrar la identidad ${user.id}:`, deleteError);
      return responder({
        error: 'EB_BAJA_PENDIENTE',
        hint: 'Tu cuenta quedó dada de baja. El equipo de EnBus terminará de cerrar tu acceso en las próximas horas.'
      }, 500);
    }

    // 4. Baja completa. Si este registro falla, la identidad ya no existe: el admin lo ve en
    //    "Bajas por completar" y lo cierra a mano, así que se responde ok igualmente.
    const { error: bajaError } = await supabase
      .from('bajas_cuenta')
      .update({ auth_eliminada_at: new Date().toISOString() })
      .eq('usuario_id', user.id);
    if (bajaError) {
      console.error(`eliminar-cuenta: identidad ${user.id} borrada, pero bajas_cuenta no se actualizó:`, bajaError);
    }

    return responder({ ok: true });
  } catch (error: any) {
    return responder({ error: error.message }, 500);
  }
});
