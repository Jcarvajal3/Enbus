"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { revalidatePath } from "next/cache";

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
      return { success: false, error: "Todos los campos obligatorios deben ser completados." };
    }

    const tarifa_por_kg = parseFloat(tarifaPorKgStr);
    const factor_distancia_por_min = parseFloat(factorDistanciaStr);
    const dimensiones_max_cm = parseInt(dimensionesMaxStr, 10);
    const peso_max_kg = parseFloat(pesoMaxStr);
    const vigente_desde = vigenteDesdeStr ? new Date(vigenteDesdeStr).toISOString() : new Date().toISOString();

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
      return { success: false, error: "Error al actualizar las tarifas anteriores." };
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
      return { success: false, error: insertError.message || "Error al crear la nueva tarifa." };
    }

    revalidatePath("/admin/tarifas");
    return { success: true };
  } catch (error: any) {
    console.error("Error in createTarifa server action:", error);
    return { success: false, error: error.message || "Error interno del servidor." };
  }
}

export async function simularCosto(pesoKg: number, rutaId: string) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    if (!rutaId) {
      return { success: false, error: "Debe seleccionar una ruta." };
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
      return { success: false, error: "Error al consultar la tarifa activa." };
    }

    if (!tariff) {
      return { success: false, error: "No hay ninguna tarifa activa configurada en el sistema." };
    }

    // Fetch route details
    const { data: route, error: routeError } = await supabase
      .from("rutas")
      .select("duracion_estimada_min, estado_origen, ciudad_origen, estado_destino, ciudad_destino")
      .eq("id", rutaId)
      .single();

    if (routeError || !route) {
      console.error("Error fetching route for simulation:", routeError);
      return { success: false, error: "Error al consultar la ruta especificada." };
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

    const formula = `${pesoKg.toFixed(2)} kg × $${tarifa_por_kg.toFixed(2)} × (1 + ${factor_distancia_por_min.toFixed(4)} × ${duracion_estimada_min} min)`;

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
  } catch (error: any) {
    console.error("Error in simularCosto server action:", error);
    return { success: false, error: error.message || "Error interno de simulación." };
  }
}
