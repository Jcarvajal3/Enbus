// enviar-push
// Envío directo de un push a un usuario (lo usa el super admin desde el panel, con la service role).
// La cola (pending_notifications) la procesa procesar-notificaciones-pendientes con el mismo módulo.
// Solo service role: con la clave pública cualquiera podría mandar avisos falsos a cualquier usuario.
import '@supabase/functions-js/edge-runtime.d.ts';
import { ErrorEntrada, errorInterno, esUuid, fallar, filtrarMetodo, leerJson, responder, texto } from '../_shared/http.ts';
import { clienteAdmin, soloServiceRole } from '../_shared/supabase.ts';
import { enviarAvisos } from '../_shared/push.ts';

const RAZON: Record<string, string> = {
  PREFERENCIA: 'El usuario desactivó este tipo de notificaciones',
  SIN_TOKEN: 'El usuario no tiene un dispositivo registrado',
  FALLIDO: 'Expo rechazó el mensaje',
  REINTENTAR: 'Expo no respondió; intenta de nuevo más tarde',
};

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;
  const sinPermiso = soloServiceRole(req);
  if (sinPermiso) return sinPermiso;

  try {
    const body = await leerJson(req);
    const userId = body.user_id;
    const titulo = texto(body.titulo, 150);
    const mensaje = texto(body.mensaje, 1000);
    const recursoId = body.recurso_id == null || body.recurso_id === '' ? null : body.recurso_id;
    if (!esUuid(userId) || !titulo || !mensaje || (recursoId !== null && !esUuid(recursoId))) {
      return fallar(400, 'EB_DATOS_INVALIDOS', 'Faltan user_id, titulo o mensaje, o recurso_id no es válido.');
    }

    const { resultado } = await enviarAvisos(clienteAdmin(), [{
      ref: 'directo',
      usuarioId: userId,
      titulo,
      mensaje,
      recursoTipo: texto(body.recurso_tipo, 40),
      recursoId: recursoId as string | null,
      // tipo (opcional): BOLETO_CONFIRMADO, VIAJE_REPROGRAMADO… La app elige icono y tono.
      tipo: texto(body.tipo, 60),
      // sin_bandeja = true: quien llama ya escribió la bandeja in-app.
      escribirBandeja: body.sin_bandeja !== true,
    }]);

    const r = resultado.get('directo');
    if (r === 'SIN_USUARIO') {
      // 404 = error permanente (no se reintenta).
      return fallar(404, 'EB_NO_ENCONTRADO', 'No encontramos a ese usuario.');
    }
    if (r === 'REINTENTAR') {
      return responder(503, { enviado: false, error: 'EB_ERROR_INTERNO', hint: RAZON.REINTENTAR });
    }
    return responder(200, r === 'ENVIADO' ? { enviado: true } : { enviado: false, reason: RAZON[r ?? 'FALLIDO'] });
  } catch (e) {
    if (e instanceof ErrorEntrada) return e.respuesta();
    return errorInterno('enviar-push', e);
  }
});
