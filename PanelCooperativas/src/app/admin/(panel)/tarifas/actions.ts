"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { revalidatePath } from "next/cache";
import { humanizeError, parseDetalleEB } from "@/lib/errores";
import { formatNumeroVE } from "@/lib/dinero";
import { fechaHoraVEaISO, hoyVE, sumarDiasVE } from "@/lib/fechas";

export async function createTarifa(formData: FormData) {
  try {
    const superAdmin = await requireSuperAdmin();
    const supabase = await createClient();

    const tarifaPorKgStr = formData.get("tarifa_por_kg") as string;
    const factorDistanciaStr = formData.get("factor_distancia_por_min") as string;
    const dimensionesMaxStr = formData.get("dimensiones_max_cm") as string;
    const pesoMaxStr = formData.get("peso_max_kg") as string;
    const vigenteDesdeStr = formData.get("vigente_desde") as string;

    if (!tarifaPorKgStr || !factorDistanciaStr || !dimensionesMaxStr || !pesoMaxStr) {
      return { success: false, error: "Completa todos los campos de la tarifa." };
    }

    const tarifa_por_kg = parseFloat(tarifaPorKgStr);
    const factor_distancia_por_min = parseFloat(factorDistanciaStr);
    const dimensiones_max_cm = parseInt(dimensionesMaxStr, 10);
    const peso_max_kg = parseFloat(pesoMaxStr);
    // El campo datetime-local llega sin zona ("YYYY-MM-DDTHH:mm"): es hora de Venezuela, no la del servidor.
    const fechaHoraLocal = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(vigenteDesdeStr ?? "");
    const vigente_desde = fechaHoraLocal
      ? fechaHoraVEaISO(fechaHoraLocal[1], fechaHoraLocal[2])
      : vigenteDesdeStr
        ? new Date(vigenteDesdeStr).toISOString()
        : new Date().toISOString();

    if (isNaN(tarifa_por_kg) || tarifa_por_kg <= 0) {
      return { success: false, error: "La tarifa por kg debe ser un número positivo." };
    }
    if (isNaN(factor_distancia_por_min) || factor_distancia_por_min < 0) {
      return { success: false, error: "El factor de distancia debe ser un número no negativo." };
    }
    if (isNaN(dimensiones_max_cm) || dimensiones_max_cm <= 0) {
      return { success: false, error: "Las dimensiones máximas deben ser un número entero positivo." };
    }
    if (isNaN(peso_max_kg) || peso_max_kg <= 0) {
      return { success: false, error: "El peso máximo debe ser un número positivo." };
    }

    // Deactivate previous active tariffs first (to satisfy idx_tarifas_activa unique index)
    const { error: deactivateError } = await supabase
      .from("tarifas")
      .update({ activa: false })
      .eq("activa", true);

    if (deactivateError) {
      console.error("Error deactivating previous tariffs:", deactivateError);
      return { success: false, error: humanizeError(deactivateError, "reemplazar la tarifa vigente") };
    }

    // Insert new active tariff
    const { error: insertError } = await supabase
      .from("tarifas")
      .insert({
        tarifa_por_kg,
        factor_distancia_por_min,
        dimensiones_max_cm,
        peso_max_kg,
        vigente_desde,
        activa: true,
        creada_por: superAdmin.id
      });

    if (insertError) {
      console.error("Error inserting new tariff:", insertError);
      return { success: false, error: humanizeError(insertError, "crear la tarifa") };
    }

    revalidatePath("/admin/tarifas");
    return { success: true };
  } catch (error) {
    console.error("Error in createTarifa server action:", error);
    return { success: false, error: humanizeError(error, "crear la tarifa") };
  }
}

export async function simularCosto(pesoKg: number, rutaId: string) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    if (!rutaId) {
      return { success: false, error: "Elige una ruta." };
    }

    if (isNaN(pesoKg) || pesoKg <= 0) {
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
    const costo_base = pesoKg * tarifa_por_kg;
    const costo_distancia = costo_base * (factor_distancia_por_min * duracion_estimada_min);
    const costo_total = costo_base + costo_distancia;

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
