import { createClient } from "@/lib/supabase/server";
import type { Tarifa, RouteOption } from "@/lib/types/admin-tarifas";

export async function fetchTarifaVigente(): Promise<Tarifa | null> {
  try {
    const supabase = await createClient();
    
    // Fetch the active tariff and join with the creator's profile
    const { data, error } = await supabase
      .from("tarifas")
      .select("*, profiles:creada_por(nombre_completo)")
      .eq("activa", true)
      .maybeSingle();

    if (error) {
      console.error("Error fetching active tariff:", error);
      throw new Error(error.message);
    }

    if (!data) return null;

    return {
      id: data.id,
      tarifa_por_kg: Number(data.tarifa_por_kg),
      factor_distancia_por_min: Number(data.factor_distancia_por_min),
      dimensiones_max_cm: data.dimensiones_max_cm,
      peso_max_kg: Number(data.peso_max_kg),
      vigente_desde: data.vigente_desde,
      activa: data.activa,
      creada_por: data.creada_por,
      created_at: data.created_at,
      creador_nombre: (data.profiles as any)?.nombre_completo || null,
    };
  } catch (error) {
    console.error("Error inside fetchTarifaVigente:", error);
    return null;
  }
}

export async function fetchHistorialTarifas(): Promise<Tarifa[]> {
  try {
    const supabase = await createClient();

    // Fetch all tariffs ordered by vigencia / created_at DESC
    const { data, error } = await supabase
      .from("tarifas")
      .select("*, profiles:creada_por(nombre_completo)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching tariff history:", error);
      throw new Error(error.message);
    }

    return (data || []).map((row): Tarifa => ({
      id: row.id,
      tarifa_por_kg: Number(row.tarifa_por_kg),
      factor_distancia_por_min: Number(row.factor_distancia_por_min),
      dimensiones_max_cm: row.dimensiones_max_cm,
      peso_max_kg: Number(row.peso_max_kg),
      vigente_desde: row.vigente_desde,
      activa: row.activa,
      creada_por: row.creada_por,
      created_at: row.created_at,
      creador_nombre: (row.profiles as any)?.nombre_completo || null,
    }));
  } catch (error) {
    console.error("Error inside fetchHistorialTarifas:", error);
    return [];
  }
}

export async function fetchRutasParaSimulador(): Promise<RouteOption[]> {
  try {
    const supabase = await createClient();

    // Fetch active routes and join with the cooperativa name
    const { data, error } = await supabase
      .from("rutas")
      .select("id, estado_origen, ciudad_origen, estado_destino, ciudad_destino, duracion_estimada_min, cooperativas(nombre)")
      .eq("activa", true);

    if (error) {
      console.error("Error fetching routes for simulator:", error);
      throw new Error(error.message);
    }

    return (data || []).map((row): RouteOption => ({
      id: row.id,
      estado_origen: row.estado_origen,
      ciudad_origen: row.ciudad_origen,
      estado_destino: row.estado_destino,
      ciudad_destino: row.ciudad_destino,
      duracion_estimada_min: row.duracion_estimada_min,
      cooperativa_nombre: (row.cooperativas as any)?.nombre || "Cooperativa Desconocida",
    }));
  } catch (error) {
    console.error("Error inside fetchRutasParaSimulador:", error);
    return [];
  }
}
