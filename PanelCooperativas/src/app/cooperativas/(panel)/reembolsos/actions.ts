"use server";

// ─── Reembolsos: bandeja y registro de devoluciones (#27, P-49) ─────────────
// Todo pasa por RPC SECURITY DEFINER (fase 3): el servidor valida que los
// boletos sean de la cooperativa del usuario, marca el reembolso como hecho y
// avisa al pasajero en la misma transacción.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { codigoEB, humanizeError, parseDetalleEB } from "@/lib/errores";
import type {
  FiltroReembolsos,
  MetodoReembolso,
  Reembolso,
  ResultadoRegistrarReembolso,
} from "@/lib/types/reembolsos";

export type ResultadoAccion<T> =
  | { success: true; data: T; error?: undefined; codigo?: undefined; campo?: undefined }
  | {
      success: false;
      data?: undefined;
      error: string;
      /** Código EB_* si lo hubo. */
      codigo?: string;
      /** Campo del formulario que causó el error (detail.campo). */
      campo?: string;
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METODOS: MetodoReembolso[] = ["PAGO_MOVIL", "TRANSFERENCIA_BANCARIA", "ZELLE", "EFECTIVO"];

function fallo(error: unknown, accion: string): { success: false; error: string; codigo?: string; campo?: string } {
  const campo = parseDetalleEB(error).campo;
  return {
    success: false,
    error: humanizeError(error, accion),
    codigo: codigoEB(error) ?? undefined,
    campo: typeof campo === "string" ? campo : undefined,
  };
}

/** Boletos cancelados con dinero por devolver (o ya devuelto) de la cooperativa. */
export async function listarReembolsos(
  estado: FiltroReembolsos = "TODOS"
): Promise<ResultadoAccion<Reembolso[]>> {
  const pEstado: FiltroReembolsos = estado === "PENDIENTE" || estado === "PROCESADO" ? estado : "TODOS";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reembolsos", { p_estado: pEstado });
  if (error) {
    console.error("[listarReembolsos] Error:", error);
    return fallo(error, "cargar los reembolsos");
  }
  const filas = ((data ?? []) as Reembolso[]).map((r) => ({ ...r, monto_usd: Number(r.monto_usd ?? 0) }));
  return { success: true, data: filas };
}

/**
 * Registra que la cooperativa ya devolvió el dinero de uno o varios boletos de
 * una misma compra. La referencia es obligatoria salvo en efectivo.
 */
export async function registrarReembolso(input: {
  boletoIds: string[];
  metodo: MetodoReembolso;
  referencia: string;
  nota?: string;
}): Promise<ResultadoAccion<ResultadoRegistrarReembolso>> {
  const ids = Array.from(new Set((input.boletoIds ?? []).filter((id) => UUID_RE.test(id ?? ""))));
  if (ids.length === 0) {
    return { success: false, error: "No encontramos los boletos de esta devolución. Actualiza la lista." };
  }
  if (!METODOS.includes(input.metodo)) {
    return { success: false, error: "Elige cómo devolviste el dinero.", campo: "metodo" };
  }
  const referencia = (input.referencia ?? "").trim();
  if (input.metodo !== "EFECTIVO" && referencia.replace(/[^A-Za-z0-9]/g, "").length < 4) {
    return {
      success: false,
      error: "Escribe la referencia de la devolución (mínimo 4 caracteres).",
      campo: "referencia",
    };
  }
  const nota = (input.nota ?? "").trim();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_registrar_reembolso", {
    p_boleto_ids: ids,
    p_metodo: input.metodo,
    p_referencia: referencia || null,
    p_nota: nota ? nota.slice(0, 500) : null,
  });
  if (error) {
    console.error("[registrarReembolso] Error:", error);
    return fallo(error, "registrar la devolución");
  }

  revalidatePath("/cooperativas/reembolsos");
  return { success: true, data: (data ?? { procesados: 0, ya_procesados: 0 }) as ResultadoRegistrarReembolso };
}
