import { createClient, createAdminClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import { ordenarPorPrioridad, type Incidencia, type FetchIncidenciasFilters } from "../types/admin-incidencias";

const SELECT_BASE = `
  *,
  encomienda:encomiendas(tracking_id, valor_declarado, descripcion_contenido, estado),
  reportado_por_profile:profiles!reportado_por(nombre_completo, telefono),
  resuelta_por_profile:profiles!resuelta_por(nombre_completo)
`;
// boleto_id llega con la migración 20260720000002 (reportes de usuario).
const SELECT_CON_BOLETO = `${SELECT_BASE}, boleto:boletos(codigo_boleto, estado, asiento)`;

/** Sin la migración de la fase 3 no existe la relación con boletos: se consulta sin ella. */
function faltaRelacionBoleto(err: { code?: string } | null): boolean {
  return err?.code === "PGRST200" || err?.code === "42703";
}

type Embed<T> = T | T[] | null | undefined;
function uno<T>(v: Embed<T>): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

type FilaIncidencia = Omit<Incidencia, "encomienda" | "boleto" | "reportado_por_profile" | "resuelta_por_profile"> & {
  encomienda?: Embed<{ tracking_id: string; valor_declarado: number | string | null; descripcion_contenido: string; estado: string }>;
  boleto?: Embed<{ codigo_boleto: string; estado: string; asiento: string | null }>;
  reportado_por_profile?: Embed<{ nombre_completo: string; telefono?: string | null }>;
  resuelta_por_profile?: Embed<{ nombre_completo: string }>;
};

function normalizar(item: FilaIncidencia): Incidencia {
  const encomienda = uno(item.encomienda);
  return {
    ...item,
    encomienda: encomienda
      ? {
          tracking_id: encomienda.tracking_id,
          valor_declarado: encomienda.valor_declarado ? Number(encomienda.valor_declarado) : null,
          descripcion_contenido: encomienda.descripcion_contenido,
          estado: encomienda.estado,
        }
      : null,
    boleto: uno(item.boleto),
    reportado_por_profile: uno(item.reportado_por_profile),
    resuelta_por_profile: uno(item.resuelta_por_profile),
  };
}

/** Lista de incidencias. Lanza un error legible si la consulta falla (lo muestra error.tsx). */
export async function fetchIncidencias(filters: FetchIncidenciasFilters = {}): Promise<Incidencia[]> {
  const supabase = await createClient();

  const consultar = (select: string) => {
    let query = supabase.from("incidencias").select(select).order("created_at", { ascending: false }).limit(500); // las 500 más recientes
    if (filters.tipo && filters.tipo !== "all") query = query.eq("tipo", filters.tipo);
    const estado = filters.estado ?? "pendientes";
    if (estado === "pendientes") query = query.in("estado", ["ABIERTA", "EN_PROCESO"]);
    else if (estado === "ABIERTA" || estado === "EN_PROCESO" || estado === "RESUELTA") query = query.eq("estado", estado);
    return query;
  };

  let { data, error } = await consultar(SELECT_CON_BOLETO);
  if (faltaRelacionBoleto(error)) ({ data, error } = await consultar(SELECT_BASE));

  if (error) {
    console.error("Error fetching incidencias:", error);
    throw new Error(humanizeError(error, "cargar las incidencias"));
  }

  // Orden de atención: prioridad y, dentro de cada una, la más antigua primero (AD-19).
  return ordenarPorPrioridad(((data ?? []) as unknown as FilaIncidencia[]).map(normalizar));
}

/** Una incidencia con el contacto de quien la reportó (teléfono y correo). null si no existe. */
export async function fetchIncidenciaById(id: string): Promise<Incidencia | null> {
  const supabase = await createClient();

  const consultar = (select: string) => supabase.from("incidencias").select(select).eq("id", id).maybeSingle();
  let { data, error } = await consultar(SELECT_CON_BOLETO);
  if (faltaRelacionBoleto(error)) ({ data, error } = await consultar(SELECT_BASE));

  if (error) {
    console.error("Error fetching incidencia by id:", error);
    throw new Error(humanizeError(error, "cargar la incidencia"));
  }
  if (!data) return null;

  const incidencia = normalizar(data as unknown as FilaIncidencia);

  // Correo de quien reportó (auth.users): solo para contactarlo desde el detalle.
  if (incidencia.reportado_por && incidencia.reportado_por_profile) {
    const { data: auth, error: authError } = await createAdminClient().auth.admin.getUserById(incidencia.reportado_por);
    if (authError) console.error("Error fetching reporter email:", authError);
    incidencia.reportado_por_profile = { ...incidencia.reportado_por_profile, email: auth?.user?.email ?? null };
  }

  return incidencia;
}
