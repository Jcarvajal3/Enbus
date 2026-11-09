import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

// Desde 20261109000009_cooperativas_columnas_publicas.sql, anon y authenticated solo leen de la
// tabla `cooperativas` las columnas públicas (id, nombre, logo_url, estado, calificacion_promedio,
// total_calificaciones). Comisión, RIF, correo, teléfono, representante, motivo_estado… se leen
// por la RPC `fn_cooperativas_privadas()`: todas las filas para el super admin y la propia para el
// personal de la cooperativa. Un select('*') o un embed de esas columnas sobre la tabla responde
// 42501 (sin permiso).

const RPC = "fn_cooperativas_privadas";

/**
 * PGRST202: la RPC no está en el caché de esquema (migración 20261109000009 sin aplicar);
 * 42883: la función no existe. Mientras tanto la tabla sigue dejando leer todas las columnas.
 */
const RPC_NO_DISPONIBLE = new Set(["PGRST202", "42883"]);

function tabla(supabase: SupabaseClient) {
  return supabase.from("cooperativas");
}

/** Lo que recibe la consulta: se usa igual que `supabase.from("cooperativas")` (solo `select`). */
export type FuenteCooperativas = ReturnType<typeof tabla>;

/**
 * Lee cooperativas con todas sus columnas por `fn_cooperativas_privadas()`. La consulta recibe
 * la fuente y la arma como sobre la tabla (select con embeds, filtros, orden, single…):
 *
 *   leerCooperativasPrivadas(supabase, (c) => c.select("id, rif").eq("id", id).maybeSingle())
 *
 * Sin la migración aplicada, repite la misma consulta sobre la tabla. No admite las opciones
 * `count`/`head` de select: para contar, la tabla basta (id y estado son públicos).
 */
export async function leerCooperativasPrivadas<R extends { error: PostgrestError | null }>(
  supabase: SupabaseClient,
  consulta: (fuente: FuenteCooperativas) => PromiseLike<R>
): Promise<R> {
  const porRpc = {
    select: (columnas?: string) => supabase.rpc(RPC).select(columnas),
  } as unknown as FuenteCooperativas;
  const resultado = await consulta(porRpc);
  if (resultado.error && RPC_NO_DISPONIBLE.has(resultado.error.code)) {
    return consulta(tabla(supabase));
  }
  return resultado;
}
