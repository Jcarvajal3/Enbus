import { createClient } from "@/lib/supabase/server";
import { Incidencia, FetchIncidenciasFilters } from "../types/admin-incidencias";

export async function fetchIncidencias(filters: FetchIncidenciasFilters = {}): Promise<Incidencia[]> {
  const supabase = await createClient();
  
  let query = supabase
    .from("incidencias")
    .select(`
      *,
      encomienda:encomiendas(tracking_id, valor_declarado, descripcion_contenido, estado),
      reportado_por_profile:profiles!reportado_por(nombre_completo),
      resuelta_por_profile:profiles!resuelta_por(nombre_completo)
    `)
    .order("created_at", { ascending: false });

  if (filters.tipo && filters.tipo !== "all") {
    query = query.eq("tipo", filters.tipo);
  }

  if (filters.estado && filters.estado !== "all") {
    query = query.eq("estado", filters.estado);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching incidencias:", error);
    return [];
  }

  return (data || []).map((item: any) => ({
    ...item,
    encomienda: item.encomienda ? {
      tracking_id: item.encomienda.tracking_id,
      valor_declarado: item.encomienda.valor_declarado ? Number(item.encomienda.valor_declarado) : null,
      descripcion_contenido: item.encomienda.descripcion_contenido,
      estado: item.encomienda.estado
    } : null,
    reportado_por_profile: item.reportado_por_profile || null,
    resuelta_por_profile: item.resuelta_por_profile || null,
  })) as Incidencia[];
}

export async function fetchIncidenciaById(id: string): Promise<Incidencia | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("incidencias")
    .select(`
      *,
      encomienda:encomiendas(tracking_id, valor_declarado, descripcion_contenido, estado),
      reportado_por_profile:profiles!reportado_por(nombre_completo),
      resuelta_por_profile:profiles!resuelta_por(nombre_completo)
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching incidencia by id:", error);
    return null;
  }

  if (!data) return null;

  return {
    ...data,
    encomienda: data.encomienda ? {
      tracking_id: data.encomienda.tracking_id,
      valor_declarado: data.encomienda.valor_declarado ? Number(data.encomienda.valor_declarado) : null,
      descripcion_contenido: data.encomienda.descripcion_contenido,
      estado: data.encomienda.estado
    } : null,
    reportado_por_profile: data.reportado_por_profile || null,
    resuelta_por_profile: data.resuelta_por_profile || null,
  } as Incidencia;
}
