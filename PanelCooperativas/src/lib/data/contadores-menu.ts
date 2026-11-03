"use server";

// ─── Contadores del menú (fase 5, D7) ────────────────────────────────────────
// Los sidebars los piden al montar, al cambiar de ruta y cada 60 s. Misma fuente
// que la bandeja del Resumen (cooperativas) y que el sidebar/KPI del admin, para
// que el número del menú y el de la pantalla coincidan. Si la consulta falla, el
// menú se queda sin contador (nunca muestra un número inventado).

import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import type { ClaveContador } from "@/lib/navigation";
import type { ClaveContadorAdmin } from "@/lib/admin-navigation";

const CLAVES: ClaveContador[] = [
  "pagos_por_verificar",
  "reembolsos_por_devolver",
  "encomiendas_en_camino",
  "encomiendas_por_vencer",
];

/** Pendientes de la cooperativa (y de la sucursal del empleado, si la tiene). */
export async function contadoresCooperativa(): Promise<Partial<Record<ClaveContador, number>>> {
  // fn_bandeja_cooperativa valida el rol (_contexto_staff): sin permiso devuelve error y no hay contadores.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_bandeja_cooperativa");
  if (error || !data) {
    if (error) console.error("[contadoresCooperativa]", error.code, error.message);
    return {};
  }

  const bandeja = data as Partial<Record<ClaveContador, unknown>>;
  const salida: Partial<Record<ClaveContador, number>> = {};
  for (const clave of CLAVES) {
    const n = Number(bandeja[clave]);
    if (Number.isFinite(n) && n > 0) salida[clave] = n;
  }
  return salida;
}

/** Solicitudes en revisión e incidencias abiertas o en proceso. */
export async function contadoresAdmin(): Promise<Record<ClaveContadorAdmin, number>> {
  const user = await getUserProfile();
  if (!user || user.role !== "super_admin") return { solicitudes: 0, incidencias: 0 };

  const supabase = await createClient();
  const [solicitudes, incidencias] = await Promise.all([
    supabase.from("cooperativas").select("id", { count: "exact", head: true }).eq("estado", "PENDIENTE"),
    supabase.from("incidencias").select("id", { count: "exact", head: true }).in("estado", ["ABIERTA", "EN_PROCESO"]),
  ]);
  if (solicitudes.error) console.error("[contadoresAdmin] solicitudes:", solicitudes.error.message);
  if (incidencias.error) console.error("[contadoresAdmin] incidencias:", incidencias.error.message);

  return {
    solicitudes: solicitudes.error ? 0 : solicitudes.count ?? 0,
    incidencias: incidencias.error ? 0 : incidencias.count ?? 0,
  };
}
