"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin, esUuid } from "@/lib/data/admin-auth";
import { revalidatePath } from "next/cache";
import { humanizeError, parseDetalleEB } from "@/lib/errores";
import { formatNumeroVE } from "@/lib/dinero";
import { fechaHoraVEaISO, hoyVE, sumarDiasVE } from "@/lib/fechas";
import { LIMITES_TARIFA, type CreateTarifaInput, type ResultadoPublicarTarifa } from "@/lib/types/admin-tarifas";

/**
 * Publica una tarifa con fn_publicar_tarifa, en una sola operación: sin fecha (o con
 * una fecha que ya llegó) queda vigente al instante; con fecha futura queda
 * programada y la activa la tarea `activar_tarifas_programadas` a su hora.
 */
export async function createTarifa(input: CreateTarifaInput): Promise<ResultadoPublicarTarifa> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: "Solo el equipo de EnBus puede publicar tarifas." };
  }

  const tarifa_por_kg = Number(input?.tarifa_por_kg);
  const factor = Number(input?.factor_distancia_por_min);
  const dimensiones = Number(input?.dimensiones_max_cm);
  const peso = Number(input?.peso_max_kg);

  if (!Number.isFinite(tarifa_por_kg) || tarifa_por_kg <= 0 || tarifa_por_kg > LIMITES_TARIFA.tarifa_por_kg.max) {
    return { success: false, error: "El precio por kilo debe ser mayor que 0.", campo: "tarifa_por_kg" };
  }
  if (!Number.isFinite(factor) || factor < 0 || factor > LIMITES_TARIFA.factor_distancia_por_min.max) {
    return { success: false, error: "El recargo por minuto de viaje debe estar entre 0 y 1.", campo: "factor_distancia_por_min" };
  }
  if (!Number.isInteger(dimensiones) || dimensiones < 10 || dimensiones > 300) {
    return { success: false, error: "La medida máxima debe estar entre 10 y 300 cm.", campo: "dimensiones_max_cm" };
  }
  if (!Number.isFinite(peso) || peso < 1 || peso > 100) {
    return { success: false, error: "El peso máximo debe estar entre 1 y 100 kg.", campo: "peso_max_kg" };
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
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_publicar_tarifa", {
      p_tarifa_por_kg: tarifa_por_kg,
      p_factor_distancia_por_min: factor,
      p_dimensiones_max_cm: dimensiones,
      p_peso_max_kg: peso,
      p_vigente_desde: vigenteDesde,
      p_nota: (input.nota ?? "").trim() || null,
    });

    if (error) {
      console.error("Error publishing tariff:", error);
      const detalle = parseDetalleEB(error);
      return {
        success: false,
        error: humanizeError(error, "publicar la tarifa"),
        campo: typeof detalle.campo === "string" ? detalle.campo : undefined,
      };
    }

    const fila = (data ?? {}) as { id?: string; estado?: string; vigente_desde?: string };
    revalidatePath("/admin/tarifas");
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

/** Cancela la tarifa programada (fn_cancelar_tarifa_programada); la vigente no cambia. */
export async function cancelarTarifaProgramada(tarifaId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: "Solo el equipo de EnBus puede cambiar las tarifas." };
  }
  if (!esUuid(tarifaId)) return { success: false, error: "No encontramos la tarifa programada. Actualiza la página." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_cancelar_tarifa_programada", { p_tarifa_id: tarifaId });
    if (error) {
      console.error("Error cancelling scheduled tariff:", error);
      return { success: false, error: humanizeError(error, "cancelar la programación") };
    }
    revalidatePath("/admin/tarifas");
    return { success: true };
  } catch (error) {
    console.error("Error in cancelarTarifaProgramada:", error);
    return { success: false, error: humanizeError(error, "cancelar la programación") };
  }
}

export async function simularCosto(pesoKg: number, rutaId: string) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    if (!esUuid(rutaId)) {
      return { success: false, error: "Elige una ruta." };
    }

    pesoKg = Number(pesoKg);
    if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
      return { success: false, error: "El peso debe ser un número positivo." };
    }

    // Fetch active tariff
    const { data: tariff, error: tariffError } = await supabase
      .from("tarifas")
      .select("*")
      .eq("activa", true)
      .maybeSingle();

    if (tariffError) {
      console.error("Error fetching tariff for simulation:", tariffError);
      return { success: false, error: humanizeError(tariffError, "consultar la tarifa vigente") };
    }

    if (!tariff) {
      return { success: false, error: "No hay una tarifa vigente. Crea una con «Nueva tarifa»." };
    }

    // Fetch route details
    const { data: route, error: routeError } = await supabase
      .from("rutas")
      .select("duracion_estimada_min, estado_origen, ciudad_origen, estado_destino, ciudad_destino")
      .eq("id", rutaId)
      .single();

    if (routeError || !route) {
      console.error("Error fetching route for simulation:", routeError);
      return { success: false, error: humanizeError(routeError ?? { code: "PGRST116" }, "consultar la ruta") };
    }

    // Weight limit check
    if (pesoKg > Number(tariff.peso_max_kg)) {
      return {
        success: false,
        error: `El peso ingresado (${pesoKg} kg) supera el peso máximo permitido para envíos (${tariff.peso_max_kg} kg).`
      };
    }

    const tarifa_por_kg = Number(tariff.tarifa_por_kg);
    const factor_distancia_por_min = Number(tariff.factor_distancia_por_min);
    const duracion_estimada_min = Number(route.duracion_estimada_min);

    // Calculation: costo_base + costo_distancia
    // costo_base = peso_kg * tarifa_por_kg
    // costo_distancia = costo_base * factor_distancia_por_min * duracion_estimada_min
    // total = costo_base * (1 + factor_distancia_por_min * duracion_estimada_min)
    // Mismo redondeo que _costo_encomienda en la base: round(peso × kg × (1 + factor × min), 2).
    const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const costo_total = redondear(pesoKg * tarifa_por_kg * (1 + factor_distancia_por_min * duracion_estimada_min));
    const costo_base = redondear(pesoKg * tarifa_por_kg);
    const costo_distancia = redondear(costo_total - costo_base);

    const formula = `${formatNumeroVE(pesoKg)} kg × USD ${formatNumeroVE(tarifa_por_kg)} × (1 + ${formatNumeroVE(factor_distancia_por_min, 4)} × ${duracion_estimada_min} min)`;

    return {
      success: true,
      result: {
        costo_base,
        costo_distancia,
        costo_total,
        formula,
        tarifa_por_kg,
        factor_distancia_por_min,
        duracion_estimada_min,
        peso_kg: pesoKg
      }
    };
  } catch (error) {
    console.error("Error in simularCosto server action:", error);
    return { success: false, error: humanizeError(error, "simular el costo") };
  }
}

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

/** "1.234,56" -> 1234.56 · "100,81" -> 100.81 · "100.81" -> 100.81 */
function parseTasa(valor: string | number): number {
  if (typeof valor === "number") return valor;
  const texto = valor.trim().replace(/\s/g, "");
  if (!texto) return NaN;
  // El último separador es el decimal: "1.234,56" y "1,234.56" -> 1234.56.
  const normalizado =
    texto.lastIndexOf(",") > texto.lastIndexOf(".") ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalizado) ? Number(normalizado) : NaN;
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
    revalidatePath("/admin/tarifas");
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
