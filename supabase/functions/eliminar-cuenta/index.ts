// eliminar-cuenta
// Segundo paso de la baja de cuenta (requisito de Google Play). El primero es la RPC
// fn_eliminar_mi_cuenta, que comprueba que no haya actividad pendiente, anonimiza el perfil y
// registra la solicitud en bajas_cuenta. Aquí se borra la identidad de Auth (borrado suave: la
// fila de auth.users se conserva anonimizada y el perfil, con sus boletos y encomiendas, sigue
// existiendo para la contabilidad de las cooperativas).
// Solo actúa sobre el usuario del JWT. Si esta función falla, el super admin completa la baja
// desde Usuarios ("Bajas por completar").
import '@supabase/functions-js/edge-runtime.d.ts';
import { errorInterno, fallar, filtrarMetodo, responder } from '../_shared/http.ts';
import { clienteAdmin, usuarioDelToken } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;

  try {
    // 1. Quién pide la baja (con su propio JWT; nunca un id del cuerpo).
    const usuario = await usuarioDelToken(req);
    if (!usuario) return fallar(401, 'EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');

    // 2. Solo si la app ya confirmó la baja con fn_eliminar_mi_cuenta.
    const admin = clienteAdmin();
    const { data: perfil, error: perfilError } = await admin
      .from('profiles')
      .select('eliminada_at')
      .eq('id', usuario.id)
      .maybeSingle();
    if (perfilError) throw new Error(`profiles: ${perfilError.message}`);
    if (!perfil?.eliminada_at) {
      return fallar(409, 'EB_ESTADO_CAMBIO', 'Primero confirma la baja desde la app.');
    }

    // 3. Borrado suave de la identidad: ya no puede iniciar sesión y sus datos de acceso se anonimizan.
    const { error: deleteError } = await admin.auth.admin.deleteUser(usuario.id, true);
    if (deleteError) {
      console.error(`[eliminar-cuenta] no se pudo borrar la identidad ${usuario.id}:`, deleteError.message);
      return fallar(502, 'EB_BAJA_PENDIENTE',
        'Tu cuenta quedó dada de baja. El equipo de EnBus terminará de cerrar tu acceso en las próximas horas.');
    }

    // 4. Baja completa. Si este registro falla, la identidad ya no existe: el admin lo ve en
    //    "Bajas por completar" y lo cierra a mano, así que se responde ok igualmente.
    const { error: bajaError } = await admin
      .from('bajas_cuenta')
      .update({ auth_eliminada_at: new Date().toISOString() })
      .eq('usuario_id', usuario.id)
      .is('auth_eliminada_at', null);
    if (bajaError) {
      console.error(`[eliminar-cuenta] identidad ${usuario.id} borrada, pero bajas_cuenta no se actualizó:`, bajaError.message);
    }

    return responder(200, { ok: true });
  } catch (e) {
    return errorInterno('eliminar-cuenta', e);
  }
});
