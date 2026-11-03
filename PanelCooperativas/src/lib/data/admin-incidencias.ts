import { createClient, createAdminClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import {
  ordenarPorPrioridad,
  type Incidencia,
  type FetchIncidenciasFilters,
  type PaginaIncidencias,
} from "../types/admin-incidencias";
import { normalizarCodigoBoleto, normalizarTracking } from "@/lib/artefactos.generated";
import { requireSuperAdmin, esUuid } from "./admin-auth";

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

// ─── Lista paginada en el servidor ──────────────────────────────────────────
// Antes se traían las 500 más recientes y se ordenaban y filtraban en el
// navegador: con más de 500 pendientes, las más antiguas (justo las que hay que
// atender primero) no aparecían y la búsqueda no las encontraba. Ahora el orden
// de atención (prioridad y, dentro de ella, la más antigua primero) se arma en
// el servidor: un conteo por grupo de prioridad y solo las filas de la página.

export const INCIDENCIAS_POR_PAGINA = 50;

/** Grupos de prioridad (mismas reglas que prioridadIncidencia), como filtros de PostgREST. */
const GRUPOS_PRIORIDAD = [
  // alta: pérdida o daño
  "tipo.in.(PERDIDA,DANADA)",
  // media: más de 72 h en tránsito o reporte de un pago
  "or(tipo.eq.ALERTA_AMARILLA,and(tipo.eq.REPORTE_USUARIO,categoria.eq.PAGO))",
  // baja: el resto
  "and(tipo.not.in.(PERDIDA,DANADA,ALERTA_AMARILLA),or(tipo.neq.REPORTE_USUARIO,categoria.is.null,categoria.neq.PAGO))",
] as const;

/** "INC-1A2B3C" → rango de ids que empiezan por esos 6 hex (el código es el prefijo del id). */
function rangoCodigoIncidencia(texto: string): { desde: string; hasta: string | null } | null {
  const m = texto.toUpperCase().replace(/\s+/g, "").match(/^(?:INC-?)?([0-9A-F]{6})$/);
  if (!m) return null;
  const prefijo = m[1].toLowerCase();
  const siguiente = parseInt(prefijo, 16) + 1;
  return {
    desde: `${prefijo}00-0000-0000-0000-000000000000`,
    hasta: siguiente > 0xffffff ? null : `${siguiente.toString(16).padStart(6, "0")}00-0000-0000-0000-000000000000`,
  };
}

/**
 * Condición `or` de la búsqueda: descripción, código INC-…, código de la
 * encomienda o del boleto y nombre de quien reportó (estos tres se resuelven a
 * ids con una consulta corta a su tabla). null si no hay nada que buscar.
 */
async function condicionBusqueda(supabase: Awaited<ReturnType<typeof createClient>>, q: string): Promise<string | null> {
  // Sin comas, paréntesis, comillas ni comodines: romperían el filtro `or`.
  const termino = q.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!termino) return null;

  const tracking = normalizarTracking(termino);
  const boleto = normalizarCodigoBoleto(termino);
  const [encomiendas, boletos, perfiles] = await Promise.all([
    supabase.from("encomiendas").select("id").ilike("tracking_id", `%${tracking}%`).limit(50),
    supabase.from("boletos").select("id").ilike("codigo_boleto", `%${boleto.replace(/-/g, "%")}%`).limit(50),
    supabase.from("profiles").select("id").ilike("nombre_completo", `%${termino}%`).limit(50),
  ]);
  for (const r of [encomiendas, boletos, perfiles]) {
    if (r.error) console.error("[fetchIncidencias] búsqueda:", r.error);
  }
  const ids = (r: { data: { id: string }[] | null }) => (r.data ?? []).map((x) => x.id).join(",");

  const partes = [`descripcion.ilike.%${termino}%`];
  if (ids(encomiendas)) partes.push(`encomienda_id.in.(${ids(encomiendas)})`);
  if (ids(boletos)) partes.push(`boleto_id.in.(${ids(boletos)})`);
  if (ids(perfiles)) partes.push(`reportado_por.in.(${ids(perfiles)})`);
  const rango = rangoCodigoIncidencia(termino);
  if (rango) partes.push(rango.hasta ? `and(id.gte.${rango.desde},id.lt.${rango.hasta})` : `id.gte.${rango.desde}`);
  return `or(${partes.join(",")})`;
}

/**
 * Página de incidencias en orden de atención (AD-19: prioridad y, dentro de cada
 * una, la más antigua primero), con filtros y búsqueda en el servidor. Lanza un
 * error legible si la consulta falla (lo muestra error.tsx).
 */
export async function fetchIncidencias(filters: FetchIncidenciasFilters = {}): Promise<PaginaIncidencias> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const porPagina = INCIDENCIAS_POR_PAGINA;
  const pagina = Math.max(1, Math.floor(Number(filters.pagina) || 1));

  const busqueda = await condicionBusqueda(supabase, filters.q ?? "");

  /** Incidencias de un grupo de prioridad con los filtros y la búsqueda aplicados. */
  const consulta = (select: string, grupo: string, opciones?: { count: "exact"; head: true }) => {
    let q = supabase.from("incidencias").select(select, opciones);
    if (filters.tipo && filters.tipo !== "all") q = q.eq("tipo", filters.tipo);
    const estado = filters.estado ?? "pendientes";
    if (estado === "pendientes") q = q.in("estado", ["ABIERTA", "EN_PROCESO"]);
    else if (estado === "ABIERTA" || estado === "EN_PROCESO" || estado === "RESUELTA") q = q.eq("estado", estado);
    // Una sola condición `or` (grupo de prioridad Y búsqueda) para no depender de
    // cómo combina PostgREST dos parámetros `or`.
    return q.or(busqueda ? `and(${grupo},${busqueda})` : grupo);
  };

  // 1. Cuántas hay en cada grupo de prioridad.
  const conteos = await Promise.all(
    GRUPOS_PRIORIDAD.map((grupo) => consulta("id", grupo, { count: "exact", head: true }))
  );
  const errorConteo = conteos.find((c) => c.error)?.error;
  if (errorConteo) {
    console.error("Error counting incidencias:", errorConteo);
    throw new Error(humanizeError(errorConteo, "cargar las incidencias"));
  }
  const cantidades = conteos.map((c) => c.count ?? 0);
  const total = cantidades.reduce((a, b) => a + b, 0);

  // 2. Solo las filas de esta página, recorriendo los grupos en orden.
  const tramos: { grupo: string; desde: number; hasta: number }[] = [];
  let saltar = (pagina - 1) * porPagina;
  let faltan = porPagina;
  GRUPOS_PRIORIDAD.forEach((grupo, i) => {
    if (faltan <= 0) return;
    const n = cantidades[i];
    if (saltar >= n) {
      saltar -= n;
      return;
    }
    const tomar = Math.min(faltan, n - saltar);
    tramos.push({ grupo, desde: saltar, hasta: saltar + tomar - 1 });
    faltan -= tomar;
    saltar = 0;
  });

  const leerTramo = async (t: (typeof tramos)[number]) => {
    const consultar = (select: string) =>
      consulta(select, t.grupo)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(t.desde, t.hasta);
    let { data, error } = await consultar(SELECT_CON_BOLETO);
    if (faltaRelacionBoleto(error)) ({ data, error } = await consultar(SELECT_BASE));
    if (error) {
      console.error("Error fetching incidencias:", error);
      throw new Error(humanizeError(error, "cargar las incidencias"));
    }
    return ((data ?? []) as unknown as FilaIncidencia[]).map(normalizar);
  };

  const filas = (await Promise.all(tramos.map(leerTramo))).flat();
  // Ya vienen en orden de atención; ordenarPorPrioridad lo garantiza si dos filas
  // cambiaron de grupo entre el conteo y la lectura.
  return { incidencias: ordenarPorPrioridad(filas), total, pagina, porPagina };
}

/** Una incidencia con el contacto de quien la reportó (teléfono y correo). null si no existe. */
export async function fetchIncidenciaById(id: string): Promise<Incidencia | null> {
  // Antes de usar la service role (correo de quien reportó).
  await requireSuperAdmin();
  if (!esUuid(id)) return null;
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
