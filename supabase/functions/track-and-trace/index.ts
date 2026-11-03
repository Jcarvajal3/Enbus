// track-and-trace
// Rastreo público de una encomienda por su código (EB-AAMMDD-NNNNN). Usa la misma RPC que la
// landing (fn_rastrear_encomienda_publico): solo estado, ciudades, cooperativa y fechas; nunca PIN,
// cédulas, teléfonos, nombres ni notas internas del historial.
import '@supabase/functions-js/edge-runtime.d.ts';
import { ErrorEntrada, errorInterno, fallar, filtrarMetodo, ipCliente, leerJson, responder } from '../_shared/http.ts';
import { aplicarLimite, clienteAdmin } from '../_shared/supabase.ts';

const TRACKING_RE = /^[A-Z0-9]{2,4}-\d{6}-[A-Z0-9]{4,8}$/;

interface Rastreo {
  tracking_id: string;
  estado: string;
  cooperativa: string | null;
  origen: { estado: string | null; ciudad: string | null };
  destino: { estado: string | null; ciudad: string | null };
  creada_at: string;
  actualizada_at: string;
  historial: { estado: string; fecha: string }[];
}

const lugar = (l: { estado: string | null; ciudad: string | null }) => [l.ciudad, l.estado].filter(Boolean).join(', ');

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;

  try {
    // 30 consultas por minuto por IP (compartido entre instancias vía fn_consumir_limite).
    const limite = await aplicarLimite(`rastreo:${ipCliente(req)}`, 30, 60);
    if (limite) return limite;

    const body = await leerJson(req, 2048);
    const tracking = typeof body.tracking_id === 'string' ? body.tracking_id.trim().toUpperCase() : '';
    if (!tracking) return fallar(400, 'EB_DATOS_INVALIDOS', 'Escribe el código de seguimiento.');
    if (tracking.length > 30 || !TRACKING_RE.test(tracking)) {
      return fallar(400, 'EB_DATOS_INVALIDOS', 'El código de seguimiento no es válido. Revisa que esté completo (EB-AAMMDD-NNNNN).');
    }

    const { data, error } = await clienteAdmin().rpc('fn_rastrear_encomienda_publico', { p_tracking: tracking });
    if (error) throw new Error(`fn_rastrear_encomienda_publico: ${error.message}`);
    const e = data as Rastreo | null;
    if (!e) return fallar(404, 'EB_NO_ENCONTRADO', 'No encontramos una encomienda con ese código.');

    return responder(200, {
      tracking_id: e.tracking_id,
      estado: e.estado,
      origen: lugar(e.origen),
      destino: lugar(e.destino),
      cooperativa: e.cooperativa ?? null,
      fechas: { creado: e.creada_at, actualizado: e.actualizada_at },
      // Más reciente primero (mismo orden que antes); sin la nota interna.
      historial_estados: [...(e.historial ?? [])].reverse().map((h) => ({ estado_nuevo: h.estado, created_at: h.fecha })),
    });
  } catch (e) {
    if (e instanceof ErrorEntrada) return e.respuesta();
    return errorInterno('track-and-trace', e);
  }
});
