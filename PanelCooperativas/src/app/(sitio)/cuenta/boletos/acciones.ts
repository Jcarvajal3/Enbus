"use server";

import { revalidatePath } from "next/cache";
import { esUuid } from "@/components/pasajero/cuenta/formato";
import { exito, falla, fallaDe, fallaDePago, SESION_VENCIDA, type ResultadoAccion } from "@/components/pasajero/cuenta/resultado";
import { sesionServidor, validarEntradaPago, type EntradaPago } from "@/components/pasajero/cuenta/servidor";
import { RUTAS_PASAJERO, urlBoleto } from "@/lib/pasajero/rutas";

export interface EntradaPagoReserva extends EntradaPago {
  boletoId: string;
}

function refrescar(boletoId: string) {
  revalidatePath(RUTAS_PASAJERO.misBoletos);
  revalidatePath(urlBoleto(boletoId));
}

/**
 * Registra el pago de una reserva ya hecha: todos los asientos apartados de la misma compra
 * (`fn_checkout_boletos`). La clave de idempotencia la manda el navegador y se conserva entre
 * reintentos, así un doble clic no duplica el pago.
 */
export async function pagarReservaBoleto(entrada: EntradaPagoReserva): Promise<ResultadoAccion<{ repetido: boolean }>> {
  const { supabase, uid } = await sesionServidor();
  if (!uid) return falla(SESION_VENCIDA);
  if (!entrada || !esUuid(entrada.boletoId)) return falla("No encontramos este boleto.");
  const validada = await validarEntradaPago(supabase, entrada, uid);
  if ("error" in validada) return falla(validada.error);
  entrada = validada.entrada;

  try {
    const { data: boleto, error: errBoleto } = await supabase
      .from("boletos")
      .select("id, compra_id, viaje_id, estado")
      .eq("id", entrada.boletoId)
      .eq("comprador_id", uid)
      .maybeSingle<{ id: string; compra_id: string | null; viaje_id: string | null; estado: string }>();
    if (errBoleto) return fallaDe(errBoleto, "registrar tu pago");
    if (!boleto) return falla("No encontramos este boleto.");
    if (boleto.estado !== "RESERVADO" || !boleto.compra_id || !boleto.viaje_id) {
      return falla("Esta reserva ya no se puede pagar. Actualiza la página.", "EB_ESTADO_CAMBIO");
    }

    const { data: asientos, error: errAsientos } = await supabase
      .from("boletos")
      .select("asiento")
      .eq("compra_id", boleto.compra_id)
      .eq("comprador_id", uid)
      .eq("estado", "RESERVADO")
      .returns<{ asiento: string }[]>();
    if (errAsientos) return fallaDe(errAsientos, "registrar tu pago");
    const lista = (asientos ?? []).map((a) => a.asiento).filter(Boolean);
    if (lista.length === 0) return falla("Tu reserva ya no tiene asientos apartados.", "EB_ESTADO_CAMBIO");

    const { data, error } = await supabase.rpc("fn_checkout_boletos", {
      p_compra_id: boleto.compra_id,
      p_viaje_id: boleto.viaje_id,
      p_asientos: lista,
      p_metodo_pago_id: entrada.metodoPagoId,
      p_numero_referencia: entrada.numeroReferencia,
      p_fecha_transaccion: entrada.fechaTransaccion,
      p_banco_emisor: entrada.bancoEmisor,
      p_monto_declarado: entrada.montoDeclarado,
      p_tasa_esperada: entrada.tasaEsperada,
      p_idempotency_key: entrada.idempotencyKey,
      p_comprobante_path: entrada.comprobantePath ?? null,
    });
    if (error) return fallaDePago(error);

    refrescar(entrada.boletoId);
    const repetido = !!(data && typeof data === "object" && (data as { repetido?: unknown }).repetido);
    return exito({ repetido });
  } catch (err) {
    return fallaDe(err, "registrar tu pago");
  }
}

export interface DatosCancelacion {
  reembolsoUsd: number | null;
  reembolsoBsEstimado: number | null;
}

/** Cancela una reserva o un boleto pagado (`fn_cancelar_boleto`). El servidor calcula el reembolso. */
export async function cancelarBoleto(entrada: { boletoId: string; motivo: string | null }): Promise<ResultadoAccion<DatosCancelacion>> {
  const { supabase, uid } = await sesionServidor();
  if (!uid) return falla(SESION_VENCIDA);
  if (!entrada || !esUuid(entrada.boletoId)) return falla("No encontramos este boleto.");
  const motivo = typeof entrada.motivo === "string" ? entrada.motivo.trim().slice(0, 300) : "";

  try {
    const { data, error } = await supabase.rpc("fn_cancelar_boleto", {
      p_boleto_id: entrada.boletoId,
      p_motivo: motivo || null,
    });
    if (error) return fallaDe(error, "cancelar el boleto");
    const r = (data ?? {}) as { reembolso_usd?: number | null; reembolso_bs_estimado?: number | null };
    refrescar(entrada.boletoId);
    return exito({ reembolsoUsd: r.reembolso_usd ?? null, reembolsoBsEstimado: r.reembolso_bs_estimado ?? null });
  } catch (err) {
    return fallaDe(err, "cancelar el boleto");
  }
}
