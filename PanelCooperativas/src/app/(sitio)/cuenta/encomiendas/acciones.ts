"use server";

import { revalidatePath } from "next/cache";
import { esUuid } from "@/components/pasajero/cuenta/formato";
import { exito, falla, fallaDe, fallaDePago, SESION_VENCIDA, type ResultadoAccion } from "@/components/pasajero/cuenta/resultado";
import { sesionServidor, validarEntradaPago, type EntradaPago } from "@/components/pasajero/cuenta/servidor";
import { RUTAS_PASAJERO, urlEncomienda } from "@/lib/pasajero/rutas";

export interface EntradaPagoEnvio extends EntradaPago {
  encomiendaId: string;
}

function refrescar(id: string) {
  revalidatePath(RUTAS_PASAJERO.misEncomiendas);
  revalidatePath(urlEncomienda(id));
}

/** Registra el pago de un envío (`fn_registrar_pago_encomienda`); la base decide quién puede pagar. */
export async function pagarEnvio(entrada: EntradaPagoEnvio): Promise<ResultadoAccion<{ repetido: boolean }>> {
  const { supabase, uid } = await sesionServidor();
  if (!uid) return falla(SESION_VENCIDA);
  if (!entrada || !esUuid(entrada.encomiendaId)) return falla("No encontramos esta encomienda.");
  const validada = await validarEntradaPago(supabase, entrada, uid);
  if ("error" in validada) return falla(validada.error);
  entrada = validada.entrada;

  try {
    const { data, error } = await supabase.rpc("fn_registrar_pago_encomienda", {
      p_encomienda_id: entrada.encomiendaId,
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
    refrescar(entrada.encomiendaId);
    const repetido = !!(data && typeof data === "object" && (data as { repetido?: unknown }).repetido);
    return exito({ repetido });
  } catch (err) {
    return fallaDe(err, "registrar tu pago");
  }
}

/** Cancela un envío que todavía no llegó a la taquilla (igual que la app: solo PENDIENTE_DE_ESCANEO). */
export async function cancelarEnvio(entrada: { encomiendaId: string }): Promise<ResultadoAccion> {
  const { supabase, uid } = await sesionServidor();
  if (!uid) return falla(SESION_VENCIDA);
  if (!entrada || !esUuid(entrada.encomiendaId)) return falla("No encontramos esta encomienda.");

  try {
    const { data, error } = await supabase
      .from("encomiendas")
      .update({ estado: "CANCELADA" })
      .eq("id", entrada.encomiendaId)
      .eq("sender_id", uid)
      .eq("estado", "PENDIENTE_DE_ESCANEO")
      .select("id");
    if (error) return fallaDe(error, "cancelar el envío");
    if (!data?.length) {
      refrescar(entrada.encomiendaId);
      return falla(
        "No pudimos cancelar: el paquete ya está en la taquilla. Si necesitas cancelarlo, habla con la cooperativa.",
        "EB_ESTADO_CAMBIO"
      );
    }
    refrescar(entrada.encomiendaId);
    return exito(null);
  } catch (err) {
    return fallaDe(err, "cancelar el envío");
  }
}
