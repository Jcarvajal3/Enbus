"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { esUuid } from "@/lib/data/admin-auth";
import { humanizeError, parseDetalleEB } from "@/lib/errores";
import { fechaHoraVEaISO } from "@/lib/fechas";
import { LIMITES_TARIFA, type CreateTarifaInput, type ResultadoPublicarTarifa } from "@/lib/types/tarifas";

async function requireAdminCooperativa() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Tu sesión expiró. Inicia sesión de nuevo." };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, cooperativa_id, eliminada_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error verifying cooperativa admin:", error);
    return { ok: false as const, error: humanizeError(error, "verificar tus permisos") };
  }

  if (!profile || profile.role !== "admin_cooperativa" || profile.eliminada_at || !profile.cooperativa_id) {
    return { ok: false as const, error: "Solo el administrador de la cooperativa puede gestionar las tarifas." };
  }

  return { ok: true as const, supabase };
}

function revalidarRutasTarifas() {
  revalidatePath("/cooperativas/tarifas");
  revalidatePath("/cooperativas/dashboard");
  revalidatePath("/cooperativas/taquilla/encomiendas");
}

/**
 * Publica una tarifa de la cooperativa con fn_publicar_tarifa: sin fecha (o con
 * una fecha que ya llegó) queda vigente al instante; con fecha futura queda
 * programada y se activa automáticamente a su hora.
 */
export async function createTarifa(input: CreateTarifaInput): Promise<ResultadoPublicarTarifa> {
  const auth = await requireAdminCooperativa();
  if (!auth.ok) return { success: false, error: auth.error };

  const tarifa_por_kg = Number(input?.tarifa_por_kg);
  const factor = Number(input?.factor_distancia_por_min);
  const dimensiones = Number(input?.dimensiones_max_cm);
  const peso = Number(input?.peso_max_kg);

  if (
    !Number.isFinite(tarifa_por_kg) ||
    tarifa_por_kg < LIMITES_TARIFA.tarifa_por_kg.min ||
    tarifa_por_kg > LIMITES_TARIFA.tarifa_por_kg.max
  ) {
    return { success: false, error: "El precio por kilo debe ser mayor que 0.", campo: "tarifa_por_kg" };
  }
  if (
    !Number.isFinite(factor) ||
    factor < LIMITES_TARIFA.factor_distancia_por_min.min ||
    factor > LIMITES_TARIFA.factor_distancia_por_min.max
  ) {
    return {
      success: false,
      error: `El recargo por minuto de viaje debe estar entre ${LIMITES_TARIFA.factor_distancia_por_min.min} y ${LIMITES_TARIFA.factor_distancia_por_min.max}.`,
      campo: "factor_distancia_por_min",
    };
  }
  if (
    !Number.isInteger(dimensiones) ||
    dimensiones < LIMITES_TARIFA.dimensiones_max_cm.min ||
    dimensiones > LIMITES_TARIFA.dimensiones_max_cm.max
  ) {
    return {
      success: false,
      error: `La medida máxima debe estar entre ${LIMITES_TARIFA.dimensiones_max_cm.min} y ${LIMITES_TARIFA.dimensiones_max_cm.max} cm.`,
      campo: "dimensiones_max_cm",
    };
  }
  if (
    !Number.isFinite(peso) ||
    peso < LIMITES_TARIFA.peso_max_kg.min ||
    peso > LIMITES_TARIFA.peso_max_kg.max
  ) {
    return {
      success: false,
      error: `El peso máximo debe estar entre ${LIMITES_TARIFA.peso_max_kg.min} y ${LIMITES_TARIFA.peso_max_kg.max} kg.`,
      campo: "peso_max_kg",
    };
  }

  // La fecha llega en hora de Venezuela (no la del servidor).
  let vigenteDesde: string | null = null;
  if (input.programar) {
    const { fecha, hora } = input.programar;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || !/^\d{2}:\d{2}$/.test(hora ?? "")) {
      return { success: false, error: "Elige la fecha y la hora en que empieza a regir.", campo: "vigente_desde" };
    }
    vigenteDesde = fechaHoraVEaISO(fecha, hora);
    if (new Date(vigenteDesde).getTime() <= Date.now()) {
      return { success: false, error: "La fecha programada tiene que ser posterior a ahora.", campo: "vigente_desde" };
    }
  }

  try {
    const { data, error } = await auth.supabase.rpc("fn_publicar_tarifa", {
      p_tarifa_por_kg: tarifa_por_kg,
      p_factor_distancia_por_min: factor,
      p_dimensiones_max_cm: dimensiones,
      p_peso_max_kg: peso,
      p_vigente_desde: vigenteDesde,
      p_nota: (input.nota ?? "").trim() || null,
    });

    if (error) {
      console.error("Error publishing cooperativa tariff:", error);
      const detalle = parseDetalleEB(error);
      return {
        success: false,
        error: humanizeError(error, "publicar la tarifa"),
        campo: typeof detalle.campo === "string" ? detalle.campo : undefined,
      };
    }

    const fila = (data ?? {}) as { id?: string; estado?: string; vigente_desde?: string };
    revalidarRutasTarifas();
    return {
      success: true,
      data: {
        id: String(fila.id ?? ""),
        estado: fila.estado === "PROGRAMADA" ? "PROGRAMADA" : "VIGENTE",
        vigente_desde: String(fila.vigente_desde ?? vigenteDesde ?? new Date().toISOString()),
      },
    };
  } catch (error) {
    console.error("Error in createTarifa server action:", error);
    return { success: false, error: humanizeError(error, "publicar la tarifa") };
  }
}

/** Cancela la tarifa programada de la cooperativa (fn_cancelar_tarifa_programada); la vigente no cambia. */
export async function cancelarTarifaProgramada(tarifaId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdminCooperativa();
  if (!auth.ok) return { success: false, error: auth.error };

  if (!esUuid(tarifaId)) {
    return { success: false, error: "No encontramos la tarifa programada. Actualiza la página." };
  }

  try {
    const { error } = await auth.supabase.rpc("fn_cancelar_tarifa_programada", { p_tarifa_id: tarifaId });
    if (error) {
      console.error("Error cancelling scheduled cooperativa tariff:", error);
      return { success: false, error: humanizeError(error, "cancelar la programación") };
    }
    revalidarRutasTarifas();
    return { success: true };
  } catch (error) {
    console.error("Error in cancelarTarifaProgramada:", error);
    return { success: false, error: humanizeError(error, "cancelar la programación") };
  }
}
