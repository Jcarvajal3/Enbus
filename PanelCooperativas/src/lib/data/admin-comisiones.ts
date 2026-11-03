import { createClient } from "@/lib/supabase/server";
import { ComisionCiclo } from "../types/admin-comisiones";
import { humanizeError } from "@/lib/errores";
import { requireSuperAdmin, esUuid } from "./admin-auth";
import { leerTodas } from "./admin-consultas";

export interface FetchCiclosFilters {
  cooperativaId?: string;
  pagado?: boolean | string;
  periodoInicio?: string;
  periodoFin?: string;
}

/** Tope de ciclos que se cargan en la tabla (los más recientes). */
export const MAX_CICLOS = 20_000;

/**
 * Obtiene los ciclos de comisiones filtrados y ordenados (todas las páginas, no
 * solo las 1000 primeras que devuelve PostgREST). Lanza un error legible si la
 * consulta falla (una lista vacía por error parecería "no hay ciclos").
 */
export async function fetchCiclosComisiones(
  filters: FetchCiclosFilters = {}
): Promise<{ ciclos: ComisionCiclo[]; truncado: boolean }> {
  await requireSuperAdmin();
  const supabase = await createClient();

  const consulta = (desde: number, hasta: number) => {
    let query = supabase
      .from("comisiones_ciclo")
      .select(`
        *,
        cooperativas (
          nombre
        )
      `)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (filters.cooperativaId && filters.cooperativaId !== "all" && esUuid(filters.cooperativaId)) {
      query = query.eq("cooperativa_id", filters.cooperativaId);
    }
    if (filters.pagado !== undefined && filters.pagado !== "" && filters.pagado !== "all") {
      const isPagado = typeof filters.pagado === "string" ? filters.pagado === "true" : filters.pagado;
      query = query.eq("pagado", isPagado);
    }
    if (filters.periodoInicio) query = query.gte("periodo_inicio", filters.periodoInicio);
    if (filters.periodoFin) query = query.lte("periodo_fin", filters.periodoFin);
    return query.range(desde, hasta);
  };

  let resultado;
  try {
    resultado = await leerTodas(consulta, { maxFilas: MAX_CICLOS });
  } catch (error) {
    console.error("Error fetching ciclos de comisiones:", error);
    throw new Error(humanizeError(error, "cargar los ciclos de comisiones"));
  }

  return {
    truncado: resultado.truncado,
    ciclos: resultado.filas.map((ciclo) => ({
      ...ciclo,
      total_encomiendas: Number(ciclo.total_encomiendas),
      total_boletos: Number(ciclo.total_boletos),
      comision_porcentaje: Number(ciclo.comision_porcentaje),
      monto_comision: Number(ciclo.monto_comision),
      cooperativa_nombre: ciclo.cooperativas?.nombre || "Cooperativa sin nombre",
    })),
  };
}

/** Estados en los que una cooperativa puede tener ventas (y por lo tanto ciclos). */
export const ESTADOS_CON_VENTAS = ["ACTIVA", "SUSPENDIDA", "DESACTIVADA"] as const;

/**
 * Cooperativas que pueden tener ciclos (activas, suspendidas o desactivadas: una
 * suspendida sigue debiendo la comisión de lo que vendió). Para los selectores.
 * Lanza el error: un selector vacío por error parecería "no hay cooperativas".
 */
export async function fetchCooperativasList() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cooperativas")
    .select("id, nombre, comision_porcentaje, estado")
    .in("estado", [...ESTADOS_CON_VENTAS])
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error fetching cooperativas list:", error);
    throw new Error(humanizeError(error, "cargar las cooperativas"));
  }

  return (data || []).map((coop) => ({
    id: coop.id as string,
    nombre: coop.nombre as string,
    comision_porcentaje: Number(coop.comision_porcentaje),
    estado: coop.estado as string,
  }));
}
