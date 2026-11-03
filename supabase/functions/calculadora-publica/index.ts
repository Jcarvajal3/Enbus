// calculadora-publica
// Cotización pública de un envío. Usa la misma RPC que la landing (fn_cotizar_envio_publico):
// solo cooperativas activas, misma normalización de ciudades y mismo redondeo. Devuelve el costo
// más bajo (campos de siempre) y todas las opciones por cooperativa.
import '@supabase/functions-js/edge-runtime.d.ts';
import { ErrorEntrada, errorInterno, fallar, filtrarMetodo, ipCliente, leerJson, numero, responder, texto } from '../_shared/http.ts';
import { aplicarLimite, clienteAdmin, respuestaErrorRpc } from '../_shared/supabase.ts';

interface Opcion {
  cooperativa_id: string;
  cooperativa: string;
  calificacion: number | null;
  duracion_min: number;
  costo_usd: number;
  costo_bs: number | null;
}

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;

  try {
    // 60 consultas por minuto por IP (compartido entre instancias vía fn_consumir_limite).
    const limite = await aplicarLimite(`calculadora:${ipCliente(req)}`, 60, 60);
    if (limite) return limite;

    const body = await leerJson(req, 4096);
    const peso = numero(body.peso_kg);
    const ciudadOrigen = texto(body.ciudad_origen, 80);
    const ciudadDestino = texto(body.ciudad_destino, 80);
    if (peso === null || peso <= 0 || peso > 10_000) {
      return fallar(400, 'EB_PESO_INVALIDO', 'Escribe un peso mayor que 0.', { detalle: { campo: 'peso' } });
    }
    if (!ciudadOrigen || !ciudadDestino) {
      return fallar(400, 'EB_DATOS_INVALIDOS', 'Indica la ciudad de origen y la de destino.');
    }

    const { data, error } = await clienteAdmin().rpc('fn_cotizar_envio_publico', {
      p_peso_kg: Math.round(peso * 100) / 100,
      p_ciudad_origen: ciudadOrigen,
      p_ciudad_destino: ciudadDestino,
    });
    if (error) {
      const r = respuestaErrorRpc(error);
      if (r) return r;
      throw new Error(`fn_cotizar_envio_publico: ${error.message}`);
    }

    const cot = data as { peso_max_kg: number; tasa_bcv: number | null; tasa_bcv_fecha: string | null; opciones: Opcion[] };
    const opciones = Array.isArray(cot?.opciones) ? cot.opciones : [];
    if (opciones.length === 0) {
      return fallar(404, 'EB_SIN_RUTA', 'Todavía no hay cooperativas que hagan envíos entre esas ciudades.');
    }
    const mejor = opciones[0]; // la RPC ordena por costo
    // Las tarifas son USD de referencia; se cobra en Bs a la tasa BCV del día.
    return responder(200, {
      costo_estimado: mejor.costo_usd,
      costo_estimado_usd: mejor.costo_usd,
      moneda: 'USD',
      peso_max_kg: cot.peso_max_kg,
      ...(cot.tasa_bcv ? { tasa_bcv: cot.tasa_bcv, tasa_bcv_fecha: cot.tasa_bcv_fecha, costo_estimado_bs: mejor.costo_bs } : {}),
      opciones,
      disclaimer: 'Precio aproximado, sujeto a finalización y pesaje físico en taquilla',
    });
  } catch (e) {
    if (e instanceof ErrorEntrada) return e.respuesta();
    return errorInterno('calculadora-publica', e);
  }
});
