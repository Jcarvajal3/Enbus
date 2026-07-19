import { createClient } from "@/lib/supabase/server";
import type { SolicitudPendiente } from "@/lib/types/admin-solicitudes";

export async function fetchSolicitudesPendientes(): Promise<SolicitudPendiente[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cooperativas")
    .select("*")
    .eq("estado", "PENDIENTE")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching solicitudes pendientes:", error);
    return [];
  }

  return (data || []) as SolicitudPendiente[];
}

export async function countSolicitudesPendientes(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("cooperativas")
    .select("*", { count: "exact", head: true })
    .eq("estado", "PENDIENTE");

  if (error) {
    console.error("Error counting solicitudes pendientes:", error);
    return 0;
  }

  return count || 0;
}
