// calcular-costo-encomienda
// Compatibilidad: el panel ya llama directo a las RPC. Aquí se delega en ellas con el JWT del
// empleado (mismo permiso, misma fórmula y mismas transiciones de estado):
//   preview = true  → fn_cotizar_encomienda (no cambia nada)
//   preview = false → fn_confirmar_recepcion_origen (EN_RECEPCION → POR_PAGAR, sucursales, PIN)
import '@supabase/functions-js/edge-runtime.d.ts';
import { ErrorEntrada, errorInterno, esUuid, fallar, filtrarMetodo, leerJson, numero, responder } from '../_shared/http.ts';
import { clienteUsuario, respuestaErrorRpc, usuarioDelToken } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;

  try {
    const usuario = await usuarioDelToken(req);
    if (!usuario) return fallar(401, 'EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');

    const body = await leerJson(req, 4096);
    const peso = numero(body.peso_kg);
    if (!esUuid(body.encomienda_id)) return fallar(400, 'EB_DATOS_INVALIDOS', 'Falta la encomienda.');
    if (peso === null || peso <= 0) {
      return fallar(400, 'EB_PESO_INVALIDO', 'Escribe un peso mayor que 0.', { detalle: { campo: 'peso' } });
    }
    const pesoKg = Math.round(peso * 100) / 100;
    const supabase = clienteUsuario(usuario.token);

    if (body.preview === true) {
      const { data, error } = await supabase.rpc('fn_cotizar_encomienda', { p_encomienda_id: body.encomienda_id, p_peso_kg: pesoKg });
      if (error) {
        const r = respuestaErrorRpc(error);
        if (r) return r;
        throw new Error(`fn_cotizar_encomienda: ${error.message}`);
      }
      const cot = data as { costo_usd: number; costo_bs: number | null; tasa_bcv: number | null; tasa_bcv_fecha: string | null };
      const { data: enc } = await supabase.from('encomiendas').select('estado').eq('id', body.encomienda_id).maybeSingle();
      return responder(200, {
        costo: cot.costo_usd, costo_calculado: cot.costo_usd, estado: enc?.estado ?? null, moneda: 'USD',
        costo_bs: cot.costo_bs, tasa_bcv: cot.tasa_bcv, tasa_bcv_fecha: cot.tasa_bcv_fecha,
      });
    }

    const { data, error } = await supabase.rpc('fn_confirmar_recepcion_origen', { p_encomienda_id: body.encomienda_id, p_peso_kg: pesoKg });
    if (error) {
      const r = respuestaErrorRpc(error);
      if (r) return r;
      throw new Error(`fn_confirmar_recepcion_origen: ${error.message}`);
    }
    const rec = data as { estado: string; costo_usd: number; costo_bs: number | null; tasa_bcv: number | null; tasa_bcv_fecha: string | null };
    // Tarifas en USD de referencia; se cobra en Bs a la tasa BCV del día.
    return responder(200, {
      costo_calculado: rec.costo_usd, estado: rec.estado, costo: rec.costo_usd, moneda: 'USD',
      costo_bs: rec.costo_bs, tasa_bcv: rec.tasa_bcv, tasa_bcv_fecha: rec.tasa_bcv_fecha,
    });
  } catch (e) {
    if (e instanceof ErrorEntrada) return e.respuesta();
    return errorInterno('calcular-costo-encomienda', e);
  }
});
