"use server";

// ─── Pagos por verificar: listar, ver, aprobar y rechazar ───────────────────
// Todo pasa por RPC SECURITY DEFINER (fase 2): el servidor valida que el pago
// sea de la cooperativa del usuario, activa los boletos / la encomienda y
// avisa al cliente en la misma transacción.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { codigoEB, humanizeError } from "@/lib/errores";
import type {
  PagoPorVerificar,
  ResultadoAprobarPago,
  ResultadoRechazarPago,
} from "@/lib/types/pagos";

export type ResultadoAccion<T> =
  | { success: true; data: T; error?: undefined; codigo?: undefined }
  | { success: false; data?: undefined; error: string; /** Código EB_* si lo hubo. */ codigo?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_PAGO_NO_ENCONTRADO = "No encontramos este pago en tu cooperativa. Actualiza la lista.";

/** Pantallas que muestran pagos o estados que cambian al aprobar/rechazar. */
function revalidarPantallasDePago() {
  revalidatePath("/cooperativas/pagos");
  revalidatePath("/cooperativas/taquilla/boletos");
  revalidatePath("/cooperativas/taquilla/encomiendas");
  revalidatePath("/cooperativas/entrega");
}

function fallo(error: unknown, accion: string): { success: false; error: string; codigo?: string } {
  return { success: false, error: humanizeError(error, accion), codigo: codigoEB(error) ?? undefined };
}

/** Bandeja: pagos digitales pendientes de la cooperativa (más antiguos primero). */
export async function listarPagosPorVerificar(
  tipo?: "boleto" | "encomienda"
): Promise<ResultadoAccion<PagoPorVerificar[]>> {
  const pTipo = tipo === "boleto" || tipo === "encomienda" ? tipo : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_pagos_por_verificar", { p_tipo: pTipo });
  if (error) return fallo(error, "cargar los pagos por verificar");
  return { success: true, data: (data ?? []) as PagoPorVerificar[] };
}

/** Detalle de un pago (cualquier estado) para el diálogo de verificación. */
export async function obtenerPago(pagoId: string): Promise<ResultadoAccion<PagoPorVerificar>> {
  if (!UUID_RE.test(pagoId ?? "")) return { success: false, error: MSG_PAGO_NO_ENCONTRADO };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_pagos_por_verificar", { p_tipo: null, p_pago_id: pagoId });
  if (error) return fallo(error, "cargar el pago");
  const fila = (data as PagoPorVerificar[] | null)?.[0];
  if (!fila) return { success: false, error: MSG_PAGO_NO_ENCONTRADO, codigo: "EB_NO_ENCONTRADO" };
  // El bucket es privado: el capture se muestra con una URL firmada de corta duración.
  let comprobante_url: string | null = null;
  if (fila.comprobante_path) {
    const { data: firmada } = await supabase.storage
      .from("comprobantes-pago")
      .createSignedUrl(fila.comprobante_path, 600);
    comprobante_url = firmada?.signedUrl ?? null;
  }
  return { success: true, data: { ...fila, comprobante_url } };
}

/** Aprueba el pago: activa los boletos (PAGADO) o marca la encomienda PAGADA y avisa al cliente. */
export async function aprobarPago(pagoId: string): Promise<ResultadoAccion<ResultadoAprobarPago>> {
  if (!UUID_RE.test(pagoId ?? "")) return { success: false, error: MSG_PAGO_NO_ENCONTRADO };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_aprobar_pago", { p_pago_id: pagoId });
  if (error) return fallo(error, "aprobar el pago");
  revalidarPantallasDePago();
  return { success: true, data: (data ?? { ok: true }) as ResultadoAprobarPago };
}

/**
 * Rechaza el pago con un motivo que se le envía al cliente (mínimo 5 caracteres).
 * En boletos, cancela la reserva y libera los asientos.
 */
export async function rechazarPago(
  pagoId: string,
  motivo: string
): Promise<ResultadoAccion<ResultadoRechazarPago>> {
  if (!UUID_RE.test(pagoId ?? "")) return { success: false, error: MSG_PAGO_NO_ENCONTRADO };
  const texto = (motivo ?? "").trim();
  if (texto.length < 5) {
    return {
      success: false,
      error: "Escribe el motivo del rechazo (se le enviará al cliente).",
      codigo: "EB_MOTIVO_REQUERIDO",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rechazar_pago", { p_pago_id: pagoId, p_motivo: texto });
  if (error) return fallo(error, "rechazar el pago");
  revalidarPantallasDePago();
  return { success: true, data: (data ?? { ok: true }) as ResultadoRechazarPago };
}
