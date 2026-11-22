"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/data/admin-auth";
import { DECIMALES_TASA, leerMonto } from "@/lib/dinero";
import { humanizeError, parseDetalleEB } from "@/lib/errores";
import { hoyVE, sumarDiasVE } from "@/lib/fechas";

// ─── Tasa BCV manual ─────────────────────────────────────────────────────────
// Respaldo cuando la tasa automática (cada 30 min) falla. La RPC solo la acepta
// del super admin y la tarea programada no sobrescribe una tasa manual.

export type RegistrarTasaManualInput = {
  /** Fecha de vigencia 'YYYY-MM-DD' (hora de Venezuela). */
  fecha: string;
  /** Bs por 1 USD. Acepta "100,81", "100.81" o "1.234,56". */
  tasa: string | number;
  motivo: string;
};

export type RegistrarTasaManualResult = {
  success: boolean;
  data?: { fecha: string; tasa: number };
  error?: string;
  /** Campo a marcar en el formulario: 'fecha' | 'tasa' | 'motivo'. */
  campo?: string;
};

/** "1.234,56" -> 1234.56 · "100,81" -> 100.81 (lector único de montos; NaN si no es válido). */
function parseTasa(valor: string | number): number {
  if (typeof valor === "number") return valor;
  return leerMonto(valor, { decimales: DECIMALES_TASA }) ?? NaN;
}

export async function registrarTasaManual(
  input: RegistrarTasaManualInput
): Promise<RegistrarTasaManualResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: "Solo el super administrador puede cargar la tasa BCV." };
  }

  const fecha = String(input.fecha ?? "").trim();
  const tasa = parseTasa(input.tasa);
  const motivo = String(input.motivo ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { success: false, error: "Elige la fecha de vigencia de la tasa.", campo: "fecha" };
  }
  if (fecha > sumarDiasVE(hoyVE(), 1)) {
    return { success: false, error: "La fecha no puede ser posterior a mañana.", campo: "fecha" };
  }
  if (!Number.isFinite(tasa) || tasa <= 0) {
    return {
      success: false,
      error: "Escribe la tasa en bolívares por 1 dólar, por ejemplo 100,81.",
      campo: "tasa",
    };
  }
  if (motivo.length < 5) {
    return {
      success: false,
      error: "Escribe por qué cargas la tasa a mano (mínimo 5 caracteres).",
      campo: "motivo",
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_registrar_tasa_bcv_manual", {
      p_fecha: fecha,
      p_tasa: tasa,
      p_motivo: motivo,
    });

    if (error) {
      console.error("Error registrando tasa BCV manual:", error);
      const detalle = parseDetalleEB(error);
      return {
        success: false,
        error: humanizeError(error, "guardar la tasa BCV"),
        campo: typeof detalle.campo === "string" ? detalle.campo : undefined,
      };
    }

    const fila = (data ?? {}) as { fecha?: string; tasa?: number | string };
    revalidatePath("/admin/tasa-bcv");
    revalidatePath("/admin/dashboard");
    return {
      success: true,
      data: { fecha: String(fila.fecha ?? fecha).slice(0, 10), tasa: Number(fila.tasa ?? tasa) },
    };
  } catch (error) {
    console.error("Error in registrarTasaManual server action:", error);
    return { success: false, error: humanizeError(error, "guardar la tasa BCV") };
  }
}
