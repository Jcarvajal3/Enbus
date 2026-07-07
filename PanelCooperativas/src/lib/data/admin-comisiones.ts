import { createClient } from "@/lib/supabase/server";
import { ComisionCiclo } from "../types/admin-comisiones";

export interface FetchCiclosFilters {
  cooperativaId?: string;
  pagado?: boolean | string;
  periodoInicio?: string;
  periodoFin?: string;
}

/**
 * Obtiene los ciclos de comisiones filtrados y ordenados.
 */
export async function fetchCiclosComisiones(filters: FetchCiclosFilters = {}): Promise<ComisionCiclo[]> {
  try {
    const supabase = await createClient();
    
    let query = supabase
      .from("comisiones_ciclo")
      .select(`
        *,
        cooperativas (
          nombre
        )
      `)
      .order("created_at", { ascending: false });

    if (filters.cooperativaId && filters.cooperativaId !== "all") {
      query = query.eq("cooperativa_id", filters.cooperativaId);
    }

    if (filters.pagado !== undefined && filters.pagado !== "" && filters.pagado !== "all") {
      const isPagado = typeof filters.pagado === "string" ? filters.pagado === "true" : filters.pagado;
      query = query.eq("pagado", isPagado);
    }

    if (filters.periodoInicio) {
      query = query.gte("periodo_inicio", filters.periodoInicio);
    }

    if (filters.periodoFin) {
      query = query.lte("periodo_fin", filters.periodoFin);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching ciclos de comisiones:", error);
      return [];
    }

    return (data || []).map((ciclo: any) => ({
      ...ciclo,
      total_encomiendas: Number(ciclo.total_encomiendas),
      total_boletos: Number(ciclo.total_boletos),
      comision_porcentaje: Number(ciclo.comision_porcentaje),
      monto_comision: Number(ciclo.monto_comision),
      cooperativa_nombre: ciclo.cooperativas?.nombre || "Cooperativa Desconocida",
    }));
  } catch (error) {
    console.error("Unexpected error inside fetchCiclosComisiones:", error);
    return [];
  }
}

/**
 * Obtiene el listado de cooperativas activas para poblar selectores.
 */
export async function fetchCooperativasList() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cooperativas")
      .select("id, nombre, comision_porcentaje")
      .eq("estado", "ACTIVA")
      .order("nombre", { ascending: true });

    if (error) {
      console.error("Error fetching cooperativas list:", error);
      return [];
    }

    return (data || []).map((coop: any) => ({
      id: coop.id,
      nombre: coop.nombre,
      comision_porcentaje: Number(coop.comision_porcentaje),
    }));
  } catch (error) {
    console.error("Unexpected error inside fetchCooperativasList:", error);
    return [];
  }
}
