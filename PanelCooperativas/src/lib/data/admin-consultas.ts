// ─── Utilidades de consulta del panel de administración ─────────────────────
// PostgREST devuelve como máximo 1000 filas por petición (max_rows del
// proyecto): un `.limit(5000)` se recorta en silencio a 1000 y un conteo o una
// suma hechos sobre esas filas salen mal sin ningún error. Para sumar o
// agrupar en el servidor de Next se leen todas las páginas con `leerTodas`.

type Pagina<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Filas por petición: el máximo que entrega PostgREST en este proyecto. */
export const FILAS_POR_PETICION = 1000;

/**
 * Lee una consulta completa en páginas de 1000. `pagina(desde, hasta)` debe
 * devolver la consulta con `.range(desde, hasta)` y un orden estable (p. ej.
 * `.order("id")`), o las páginas se solapan. Lanza el error de la consulta.
 * `truncado` = true si se llegó a `maxFilas` (el resultado no está completo).
 */
export async function leerTodas<T>(
  pagina: (desde: number, hasta: number) => Pagina<T>,
  { maxFilas = 50_000 }: { maxFilas?: number } = {}
): Promise<{ filas: T[]; truncado: boolean }> {
  const filas: T[] = [];
  for (let desde = 0; desde < maxFilas; desde += FILAS_POR_PETICION) {
    const hasta = Math.min(desde + FILAS_POR_PETICION, maxFilas) - 1;
    const { data, error } = await pagina(desde, hasta);
    if (error) throw error;
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < hasta - desde + 1) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}

/** Ejecuta `fn` sobre cada elemento con a lo sumo `concurrencia` peticiones a la vez. */
export async function enLotes<T, R>(items: readonly T[], concurrencia: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrencia, items.length) }, trabajador));
  return resultados;
}

// ─── Dinero ──────────────────────────────────────────────────────────────────
// Las sumas se hacen en centavos enteros: sumar miles de floats (0,1 + 0,2…)
// acumula error y el total no cuadra con el de la base.

/** USD (o Bs) → centavos enteros. null/NaN → 0. */
export function aCentavos(monto: number | string | null | undefined): number {
  const n = Number(monto ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Centavos enteros → monto con 2 decimales. */
export function deCentavos(centavos: number): number {
  return centavos / 100;
}

/** Porcentaje de un monto en centavos, redondeado al centavo (half-up como round() de Postgres). */
export function porcentajeCentavos(centavos: number, porcentaje: number): number {
  return Math.round((centavos * porcentaje) / 100);
}

/** RPC sin aplicar en la base (PGRST202 / 42883): se usa el camino de respaldo. */
export function rpcNoDisponible(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883";
}

/** true si `fecha` es 'YYYY-MM-DD' y existe en el calendario (rechaza 2026-02-31). */
export function esFechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
