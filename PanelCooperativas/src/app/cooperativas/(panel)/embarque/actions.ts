"use server";

// ─── Embarque de pasajeros ──────────────────────────────────────────────────
// Validar el boleto escaneado y confirmar el embarque (PAGADO → USADO). Todo
// pasa por RPC SECURITY DEFINER: el servidor decide la causa (otro bus, otro
// día, pago por verificar…) y vuelve a validar al confirmar.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { codigoEB, humanizeError, parseDetalleEB, type DetalleEB } from "@/lib/errores";
import { normalizarCodigoBoleto } from "@/lib/artefactos.generated";
import type { ResultadoEmbarque } from "@/lib/types/pagos";

export type ResultadoAccionEmbarque<T> =
  | { success: true; data: T; error?: undefined; codigo?: undefined; detalle?: undefined }
  | {
      success: false;
      data?: undefined;
      error: string;
      /** Código EB_* si lo hubo. */
      codigo?: string;
      /** `details` del error EB_*. */
      detalle?: DetalleEB;
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fallo(error: unknown, accion: string): { success: false; error: string; codigo?: string; detalle?: DetalleEB } {
  const codigo = codigoEB(error) ?? undefined;
  return {
    success: false,
    error: humanizeError(error, accion),
    codigo,
    detalle: codigo ? parseDetalleEB(error) : undefined,
  };
}

/** Resultado del escaneo: VALIDO, OTRO_DIA, PAGO_EN_VERIFICACION, etc. (no modifica nada). */
export async function validarEmbarque(
  codigo: string,
  viajeId?: string | null
): Promise<ResultadoAccionEmbarque<ResultadoEmbarque>> {
  // "bol 7cab-e4ad", "BOL-7CAB-E4AD" o "PASS-BOL-7CABE4AD" → "BOL-7CABE4AD" (#58).
  const limpio = normalizarCodigoBoleto(codigo ?? "");
  if (!limpio) return { success: false, error: "Escanea el código del boleto o escríbelo completo." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_validar_embarque", {
      p_codigo: limpio,
      p_viaje_id: viajeId && UUID_RE.test(viajeId) ? viajeId : null,
    });
    if (error) {
      console.error("Error validando embarque:", error);
      return fallo(error, "revisar el boleto");
    }
    return { success: true, data: data as ResultadoEmbarque };
  } catch (err) {
    console.error(err);
    return fallo(err, "revisar el boleto");
  }
}

/**
 * Embarca al pasajero (PAGADO → USADO). El servidor vuelve a validar: si el boleto
 * dejó de ser válido devuelve `EB_EMBARQUE_NO_VALIDO` con el resultado actualizado
 * en `resultado`, para mostrar la causa.
 */
export async function confirmarEmbarque(
  boletoId: string,
  viajeId?: string | null
): Promise<ResultadoAccionEmbarque<ResultadoEmbarque> & { resultado?: ResultadoEmbarque }> {
  if (!UUID_RE.test(boletoId ?? "")) {
    return { success: false, error: "No encontramos ese boleto. Escanéalo de nuevo." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_confirmar_embarque", {
      p_boleto_id: boletoId,
      p_viaje_id: viajeId && UUID_RE.test(viajeId) ? viajeId : null,
    });
    if (error) {
      console.error("Error confirmando embarque:", error);
      const res = fallo(error, "confirmar el embarque");
      if (res.codigo === "EB_EMBARQUE_NO_VALIDO" && res.detalle && typeof res.detalle.resultado === "string") {
        return { ...res, resultado: res.detalle as unknown as ResultadoEmbarque };
      }
      return res;
    }
    revalidatePath("/cooperativas/embarque");
    // La lista de boletos de la taquilla muestra el estado "Embarcado".
    revalidatePath("/cooperativas/taquilla/boletos");
    return { success: true, data: data as ResultadoEmbarque };
  } catch (err) {
    console.error(err);
    return fallo(err, "confirmar el embarque");
  }
}
