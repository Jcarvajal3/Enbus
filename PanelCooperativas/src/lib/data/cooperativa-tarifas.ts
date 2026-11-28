import { createClient } from "@/lib/supabase/server";
import { esUuid } from "@/lib/data/admin-auth";
import { humanizeError } from "@/lib/errores";
import { aTarifa, type FilaTarifa, type RouteOption, type Tarifa } from "@/lib/types/tarifas";

/** Tarifas del historial que se muestran (las más recientes). */
export const MAX_HISTORIAL_TARIFAS = 200;

export async function fetchTarifaVigenteCooperativa(cooperativaId: string): Promise<Tarifa | null> {
  if (!esUuid(cooperativaId)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tarifas")
      .select("*, profiles:creada_por(nombre_completo)")
      .eq("cooperativa_id", cooperativaId)
      .eq("activa", true)
      .maybeSingle();

    if (error) {
      console.error("Error fetching active cooperativa tariff:", error);
      throw new Error(humanizeError(error, "cargar las tarifas"));
    }

    return data ? aTarifa(data as FilaTarifa) : null;
  } catch (error) {
    console.error("Error inside fetchTarifaVigenteCooperativa:", error);
    throw error instanceof Error ? error : new Error(humanizeError(error, "cargar las tarifas"));
  }
}

/**
 * Tarifa programada de la cooperativa (publicada con fecha futura, todavía sin entrar en vigor).
 */
export async function fetchTarifaProgramadaCooperativa(cooperativaId: string): Promise<Tarifa | null> {
  if (!esUuid(cooperativaId)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tarifas")
      .select("*, profiles:creada_por(nombre_completo)")
      .eq("cooperativa_id", cooperativaId)
      .eq("activa", false)
      .not("publicada_at", "is", null)
      .is("reemplazada_at", null)
      .order("vigente_desde", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching scheduled cooperativa tariff:", error);
      throw new Error(humanizeError(error, "cargar las tarifas"));
    }

    return data ? aTarifa(data as FilaTarifa) : null;
  } catch (error) {
    console.error("Error inside fetchTarifaProgramadaCooperativa:", error);
    throw error instanceof Error ? error : new Error(humanizeError(error, "cargar las tarifas"));
  }
}

export async function fetchHistorialTarifasCooperativa(cooperativaId: string): Promise<Tarifa[]> {
  if (!esUuid(cooperativaId)) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tarifas")
      .select("*, profiles:creada_por(nombre_completo)")
      .eq("cooperativa_id", cooperativaId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAX_HISTORIAL_TARIFAS);

    if (error) {
      console.error("Error fetching cooperativa tariff history:", error);
      throw new Error(humanizeError(error, "cargar las tarifas"));
    }

    return (data || []).map((row) => aTarifa(row as FilaTarifa));
  } catch (error) {
    console.error("Error inside fetchHistorialTarifasCooperativa:", error);
    throw error instanceof Error ? error : new Error(humanizeError(error, "cargar las tarifas"));
  }
}

export async function fetchRutasParaSimuladorCooperativa(cooperativaId: string): Promise<RouteOption[]> {
  if (!esUuid(cooperativaId)) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rutas")
      .select("id, estado_origen, ciudad_origen, estado_destino, ciudad_destino, duracion_estimada_min")
      .eq("cooperativa_id", cooperativaId)
      .eq("activa", true)
      .order("ciudad_origen", { ascending: true })
      .order("ciudad_destino", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.error("Error fetching cooperativa routes for simulator:", error);
      throw new Error(humanizeError(error, "cargar las rutas"));
    }

    return (data || []).map(
      (row): RouteOption => ({
        id: row.id,
        estado_origen: row.estado_origen,
        ciudad_origen: row.ciudad_origen,
        estado_destino: row.estado_destino,
        ciudad_destino: row.ciudad_destino,
        duracion_estimada_min: row.duracion_estimada_min,
      })
    );
  } catch (error) {
    console.error("Error inside fetchRutasParaSimuladorCooperativa:", error);
    throw error instanceof Error ? error : new Error(humanizeError(error, "cargar las rutas"));
  }
}
