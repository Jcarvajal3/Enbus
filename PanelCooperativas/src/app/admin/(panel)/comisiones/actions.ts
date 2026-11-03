"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { GenerarCicloInput, CicloPreview } from "@/lib/types/admin-comisiones";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaHoraVEaISO, hoyVE, rangoDiaVE } from "@/lib/fechas";
import { humanizeError } from "@/lib/errores";

/**
 * Valida que el usuario autenticado es super_admin.
 * Usa getUser() (network call a Supabase Auth) para garantizar que el JWT es válido,
 * en lugar de solo leer la cookie de sesión (que podría estar expirada en edge cases).
 * Este patrón es el correcto para Server Actions con mutaciones sensibles.
 */
async function checkSuperAdmin(supabase: SupabaseClient) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw Object.assign(new Error("Auth session missing"), { code: "session_not_found" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "super_admin") {
    throw Object.assign(new Error("Sin permiso"), { code: "42501" });
  }

  return user;
}

/**
 * Previsualiza el cálculo de comisiones para el período y cooperativa(s) seleccionados,
 * sin guardar ningún cambio en la base de datos.
 */
export async function previewCiclosComision(input: GenerarCicloInput): Promise<{
  success: boolean;
  error?: string;
  previews?: CicloPreview[];
}> {
  try {
    const supabase = await createClient();
    await checkSuperAdmin(supabase);

    const { periodo_inicio, periodo_fin, cooperativa_id } = input;

    if (!periodo_inicio || !periodo_fin) {
      return { success: false, error: "Las fechas de inicio y fin son obligatorias." };
    }

    const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (!FECHA_RE.test(periodo_inicio) || !FECHA_RE.test(periodo_fin)) {
      return { success: false, error: "Las fechas no tienen un formato válido. Elígelas de nuevo en el calendario." };
    }

    if (new Date(periodo_inicio) > new Date(periodo_fin)) {
      return { success: false, error: "La fecha de inicio no puede ser posterior a la fecha de fin." };
    }

    // 1. Obtener la(s) cooperativa(s) a procesar
    let cooperativasToProcess: { id: string; nombre: string; comision_porcentaje: number }[] = [];
    if (cooperativa_id === "all") {
      const { data: coops, error: coopError } = await supabase
        .from("cooperativas")
        .select("id, nombre, comision_porcentaje")
        .eq("estado", "ACTIVA");

      if (coopError) throw coopError;
      cooperativasToProcess = (coops || []).map(c => ({
        id: c.id,
        nombre: c.nombre,
        comision_porcentaje: Number(c.comision_porcentaje)
      }));
    } else {
      const { data: coop, error: coopError } = await supabase
        .from("cooperativas")
        .select("id, nombre, comision_porcentaje")
        .eq("id", cooperativa_id)
        .single();

      if (coopError) throw coopError;
      if (!coop) return { success: false, error: "La cooperativa seleccionada no existe." };

      cooperativasToProcess = [{
        id: coop.id,
        nombre: coop.nombre,
        comision_porcentaje: Number(coop.comision_porcentaje)
      }];
    }

    const previews: CicloPreview[] = [];

    // 2. Calcular previsualización para cada cooperativa
    for (const coop of cooperativasToProcess) {
      // Verificar si ya tiene un ciclo que se solape
      const { data: overlap, error: overlapError } = await supabase
        .from("comisiones_ciclo")
        .select("id")
        .eq("cooperativa_id", coop.id)
        .lte("periodo_inicio", periodo_fin)
        .gte("periodo_fin", periodo_inicio)
        .limit(1);

      if (overlapError) throw overlapError;
      const seSolapa = overlap && overlap.length > 0;

      // Obtener pagos del período verificados para boletos/encomiendas no cancelados
      const { data: pagos, error: pagosError } = await supabase
        .from("pagos")
        .select(`
          monto,
          boleto_id,
          encomienda_id,
          boletos!pagos_boleto_id_fkey ( estado ),
          encomiendas!left ( estado )
        `)
        .eq("cooperativa_id", coop.id)
        .eq("verificado", true)
        // Filtrar por hora Venezuela (UTC-4): desde las 00:00 del primer día
        // hasta las 23:59:59.999 del último día, ambos incluidos.
        .gte("created_at", rangoDiaVE(periodo_inicio).desde)
        .lte("created_at", rangoDiaVE(periodo_fin).hasta);

      if (pagosError) throw pagosError;

      let totalBoletos = 0;
      let totalEncomiendas = 0;

      if (pagos) {
        for (const p of pagos) {
          const monto = Number(p.monto) || 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (p.boleto_id && p.boletos && (p.boletos as any).estado !== "CANCELADO") {
            totalBoletos += monto;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } else if (p.encomienda_id && p.encomiendas && (p.encomiendas as any).estado !== "CANCELADA") {
            totalEncomiendas += monto;
          }
        }
      }

      const totalVentas = totalBoletos + totalEncomiendas;
      const montoComision = Number((totalVentas * (coop.comision_porcentaje / 100)).toFixed(2));

      previews.push({
        cooperativa_id: coop.id,
        cooperativa_nombre: coop.nombre,
        total_boletos: totalBoletos,
        total_encomiendas: totalEncomiendas,
        comision_porcentaje: coop.comision_porcentaje,
        monto_comision: montoComision,
        periodo_inicio,
        periodo_fin,
        se_solapa: seSolapa,
      });
    }

    return { success: true, previews };
  } catch (err: unknown) {
    console.error("Error in previewCiclosComision:", err);
    return { success: false, error: humanizeError(err, "calcular la vista previa") };
  }
}

/**
 * Genera e inserta los ciclos de comisión en la base de datos para el período y cooperativa(s) seleccionados.
 */
export async function generarCiclosComision(input: GenerarCicloInput): Promise<{
  success: boolean;
  error?: string;
  summary?: {
    generated: string[];
    skippedOverlap: string[];
    skippedZeroSales: string[];
  };
}> {
  try {
    const supabase = await createClient();
    await checkSuperAdmin(supabase);

    // Reutilizar la lógica de cálculo del preview (principio DRY)
    const previewRes = await previewCiclosComision(input);
    if (!previewRes.success || !previewRes.previews) {
      return { success: false, error: previewRes.error || "No pudimos calcular la vista previa. Intenta de nuevo." };
    }

    const summary = {
      generated: [] as string[],
      skippedOverlap: [] as string[],
      skippedZeroSales: [] as string[],
    };

    const inserts: {
      cooperativa_id: string;
      periodo_inicio: string;
      periodo_fin: string;
      total_boletos: number;
      total_encomiendas: number;
      comision_porcentaje: number;
      monto_comision: number;
      pagado: boolean;
    }[] = [];

    for (const p of previewRes.previews) {
      if (p.se_solapa) {
        summary.skippedOverlap.push(p.cooperativa_nombre);
        // Si el usuario solicitó específicamente esta cooperativa, retornar error explícito
        if (input.cooperativa_id !== "all") {
          return {
            success: false,
            error: `Ya existe un ciclo de comisiones generado para ${p.cooperativa_nombre} en este período o que se solapa con él.`,
          };
        }
        continue;
      }

      const totalVentas = p.total_boletos + p.total_encomiendas;
      if (totalVentas <= 0) {
        summary.skippedZeroSales.push(p.cooperativa_nombre);
        continue;
      }

      inserts.push({
        cooperativa_id: p.cooperativa_id,
        periodo_inicio: p.periodo_inicio,
        periodo_fin: p.periodo_fin,
        total_boletos: p.total_boletos,
        total_encomiendas: p.total_encomiendas,
        comision_porcentaje: p.comision_porcentaje,
        monto_comision: p.monto_comision,
        pagado: false,
      });

      summary.generated.push(p.cooperativa_nombre);
    }

    if (inserts.length > 0) {
      const { error: insertError } = await supabase
        .from("comisiones_ciclo")
        .insert(inserts);

      if (insertError) throw insertError;
    }

    revalidatePath("/admin/comisiones");

    return { success: true, summary };
  } catch (err: unknown) {
    // Capturar violación de UNIQUE constraint (código PostgreSQL 23505)
    // que ocurriría en una race condition donde dos requests generan el mismo ciclo
    // simultáneamente y el segundo falla atómicamente en la DB.
    const pgError = err as { code?: string };
    if (pgError?.code === "23505") {
      return {
        success: false,
        error: "Otro administrador generó uno de estos ciclos al mismo tiempo. Actualiza la página e intenta de nuevo.",
      };
    }
    console.error("Error in generarCiclosComision:", err);
    return { success: false, error: humanizeError(err, "generar los ciclos de comisiones") };
  }
}

/**
 * Registra el pago de un ciclo de comisiones: fecha en que la cooperativa pagó y
 * referencia del pago. Idempotente: si otro admin ya lo registró, no sobrescribe
 * la fecha original.
 */
export async function marcarCicloComoPagado(
  cicloId: string,
  pago: { fecha: string; referencia: string }
): Promise<{
  success: boolean;
  error?: string;
  aviso?: string;
}> {
  try {
    const supabase = await createClient();
    await checkSuperAdmin(supabase);

    if (!cicloId) {
      return { success: false, error: "No encontramos el ciclo. Actualiza la página e intenta de nuevo." };
    }
    const fecha = (pago?.fecha ?? "").trim();
    const referencia = (pago?.referencia ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyVE()) {
      return { success: false, error: "Elige la fecha en que la cooperativa pagó (no puede ser futura)." };
    }
    if (referencia.length < 4) {
      return { success: false, error: "Escribe la referencia del pago (mínimo 4 caracteres)." };
    }

    const { data: existing, error: fetchError } = await supabase
      .from("comisiones_ciclo")
      .select("id, pagado")
      .eq("id", cicloId)
      .maybeSingle();

    if (fetchError || !existing) {
      console.error("Error fetching ciclo:", fetchError);
      return { success: false, error: humanizeError(fetchError ?? { code: "PGRST116" }, "cargar el ciclo") };
    }
    if (existing.pagado) {
      return { success: false, error: "Este ciclo ya tiene un pago registrado. Actualiza la página." };
    }

    const base = { pagado: true, pagado_at: fechaHoraVEaISO(fecha, "12:00") };
    const guardar = (cambios: Record<string, unknown>) =>
      supabase.from("comisiones_ciclo").update(cambios).eq("id", cicloId).eq("pagado", false).select("id");

    let aviso: string | undefined;
    let { data: actualizados, error } = await guardar({ ...base, pago_referencia: referencia });
    // Sin la columna pago_referencia (pendiente de migración): se guarda la fecha y se avisa.
    if (error && (error.code === "PGRST204" || error.code === "42703")) {
      ({ data: actualizados, error } = await guardar(base));
      aviso = `Registramos el pago con fecha ${fecha.split("-").reverse().join("/")}, pero la referencia ${referencia} no se pudo guardar. Anótala aparte.`;
    }
    if (error) {
      console.error("Error registering ciclo payment:", error);
      return { success: false, error: humanizeError(error, "registrar el pago") };
    }
    if (!actualizados || actualizados.length === 0) {
      return { success: false, error: "Este ciclo ya tiene un pago registrado. Actualiza la página." };
    }

    revalidatePath("/admin/comisiones");
    revalidatePath("/admin/cooperativas", "layout");
    return { success: true, aviso };
  } catch (err: unknown) {
    console.error("Error in marcarCicloComoPagado:", err);
    return { success: false, error: humanizeError(err, "registrar el pago") };
  }
}
