// ─── Consultas públicas de la landing (SOLO SERVIDOR) ───────────────────────
// Usa el cliente con service role: importar únicamente desde server components y
// server actions (no hay `server-only` instalado; no importar desde "use client").
// Ninguna función lanza: sin configuración devuelven null o [], y ante un error
// lo registran y devuelven un resultado que la página sabe mostrar u ocultar.

import type { PostgrestError } from "@supabase/supabase-js";
import { obtenerSupabaseAdmin } from "@/lib/supabase";
import type { TasaRef } from "@/lib/dinero";
import { nombreLocalidad } from "@/lib/estados";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Lugar {
  estado: string | null;
  ciudad: string | null;
}

export interface EncomiendaPublica {
  tracking_id: string;
  estado: string;
  cooperativa: string | null;
  origen: Lugar;
  destino: Lugar;
  creada_at: string;
  actualizada_at: string | null;
  historial: { estado: string; fecha: string }[];
}

export type ResultadoRastreo =
  | { tipo: "encontrada"; encomienda: EncomiendaPublica }
  | { tipo: "no_encontrada" }
  | { tipo: "error" };

export interface OpcionCotizacion {
  cooperativa_id: string;
  cooperativa: string;
  calificacion: number | null;
  duracion_min: number | null;
  costo_usd: number;
  costo_bs: number | null;
}

export interface Cotizacion {
  peso_max_kg: number | null;
  tasa: TasaRef | null;
  opciones: OpcionCotizacion[];
}

export type ResultadoCotizacion =
  | { tipo: "ok"; cotizacion: Cotizacion }
  | { tipo: "error"; mensaje: string; campo?: string };

export interface RutaPopular {
  ciudad_origen: string;
  estado_origen: string | null;
  ciudad_destino: string;
  estado_destino: string | null;
  desde_usd: number;
  duracion_min: number | null;
  cooperativas: number;
  salidas_proximas: number;
}

export interface Estadisticas {
  cooperativas: number;
  ciudades: number;
  rutas: number;
}

/**
 * Origen con los destinos a los que hay al menos una ruta activa. Son los valores
 * guardados en `rutas` ("puerto_la_cruz"); para mostrarlos, `nombreLocalidad()`.
 */
export interface OrigenConDestinos {
  origen: string;
  destinos: string[];
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const ERROR_GENERICO_COTIZAR = "No pudimos calcular el costo en este momento. Intenta de nuevo en unos minutos.";

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Errores de negocio (P0001 con código EB_*): el `hint` ya está escrito para el usuario. */
function errorDeNegocio(error: PostgrestError): { mensaje: string; campo?: string } | null {
  if (!/^EB_/.test(error.message ?? "") || !error.hint) return null;
  let campo: string | undefined;
  try {
    const detalle = error.details ? JSON.parse(error.details) : null;
    if (detalle && typeof detalle.campo === "string") campo = detalle.campo;
  } catch {
    // details no siempre es JSON: el campo es opcional.
  }
  return { mensaje: error.hint, campo };
}

/** Quita tildes y mayúsculas para comparar nombres de ciudades. */
function claveCiudad(ciudad: string): string {
  return ciudad
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// ─── Consultas ───────────────────────────────────────────────────────────────

/** Tasa BCV vigente (`fn_tasa_bcv_vigente`), o null. */
export async function tasaBCV(): Promise<TasaRef | null> {
  const supabase = obtenerSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .rpc("fn_tasa_bcv_vigente")
      .maybeSingle<{ tasa: number | string; fecha: string }>();
    if (error) {
      console.error("No se pudo leer la tasa BCV:", error.message);
      return null;
    }
    const tasa = numero(data?.tasa);
    if (!data || tasa === null || tasa <= 0 || !data.fecha) return null;
    return { tasa, fecha: String(data.fecha).slice(0, 10) };
  } catch (err) {
    console.error("No se pudo leer la tasa BCV:", err);
    return null;
  }
}

/**
 * Rastreo público por código de seguimiento (`fn_rastrear_encomienda_publico`,
 * solo service role). null si falta la configuración.
 */
export async function rastrear(codigo: string): Promise<ResultadoRastreo | null> {
  const supabase = obtenerSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("fn_rastrear_encomienda_publico", { p_tracking: codigo });
    if (error) {
      console.error("No se pudo rastrear la encomienda:", error.message);
      return { tipo: "error" };
    }
    if (!data || typeof data !== "object") return { tipo: "no_encontrada" };

    const d = data as Record<string, unknown>;
    const origen = (d.origen ?? {}) as Record<string, unknown>;
    const destino = (d.destino ?? {}) as Record<string, unknown>;
    const historial = Array.isArray(d.historial) ? (d.historial as Record<string, unknown>[]) : [];

    return {
      tipo: "encontrada",
      encomienda: {
        tracking_id: String(d.tracking_id ?? codigo),
        estado: String(d.estado ?? ""),
        cooperativa: texto(d.cooperativa),
        origen: { estado: texto(origen.estado), ciudad: texto(origen.ciudad) },
        destino: { estado: texto(destino.estado), ciudad: texto(destino.ciudad) },
        creada_at: String(d.creada_at ?? ""),
        actualizada_at: texto(d.actualizada_at),
        historial: historial
          .filter((h) => typeof h.estado === "string" && typeof h.fecha === "string")
          .map((h) => ({ estado: String(h.estado), fecha: String(h.fecha) })),
      },
    };
  } catch (err) {
    console.error("No se pudo rastrear la encomienda:", err);
    return { tipo: "error" };
  }
}

/**
 * Cotización referencial (`fn_cotizar_envio_publico`). null si falta la configuración;
 * los errores de negocio devuelven el `hint` para mostrarlo tal cual.
 */
export async function cotizar(
  pesoKg: number,
  origen: string,
  destino: string
): Promise<ResultadoCotizacion | null> {
  const supabase = obtenerSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("fn_cotizar_envio_publico", {
      p_peso_kg: pesoKg,
      p_ciudad_origen: origen,
      p_ciudad_destino: destino,
    });
    if (error) {
      const negocio = errorDeNegocio(error);
      if (negocio) return { tipo: "error", ...negocio };
      console.error("No se pudo cotizar el envío:", error.message);
      return { tipo: "error", mensaje: ERROR_GENERICO_COTIZAR };
    }

    const d = (data ?? {}) as Record<string, unknown>;
    const tasaNum = numero(d.tasa_bcv);
    const tasaFecha = texto(d.tasa_bcv_fecha);
    const opciones = Array.isArray(d.opciones) ? (d.opciones as Record<string, unknown>[]) : [];

    return {
      tipo: "ok",
      cotizacion: {
        peso_max_kg: numero(d.peso_max_kg),
        tasa: tasaNum !== null && tasaNum > 0 && tasaFecha ? { tasa: tasaNum, fecha: tasaFecha.slice(0, 10) } : null,
        opciones: opciones
          .map((o) => ({
            cooperativa_id: String(o.cooperativa_id ?? ""),
            cooperativa: String(o.cooperativa ?? "Cooperativa"),
            calificacion: numero(o.calificacion),
            duracion_min: numero(o.duracion_min),
            costo_usd: numero(o.costo_usd) ?? NaN,
            costo_bs: numero(o.costo_bs),
          }))
          .filter((o) => Number.isFinite(o.costo_usd)),
      },
    };
  } catch (err) {
    console.error("No se pudo cotizar el envío:", err);
    return { tipo: "error", mensaje: ERROR_GENERICO_COTIZAR };
  }
}

/** Rutas con más salidas próximas (`fn_rutas_populares`); [] sin configuración o ante un error. */
export async function rutasPopulares(limite = 6): Promise<RutaPopular[]> {
  const supabase = obtenerSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("fn_rutas_populares", { p_limite: limite });
    if (error) {
      console.error("No se pudieron leer las rutas populares:", error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[])
      .map((r) => ({
        ciudad_origen: String(r.ciudad_origen ?? ""),
        estado_origen: texto(r.estado_origen),
        ciudad_destino: String(r.ciudad_destino ?? ""),
        estado_destino: texto(r.estado_destino),
        desde_usd: numero(r.desde_usd) ?? NaN,
        duracion_min: numero(r.duracion_min),
        cooperativas: numero(r.cooperativas) ?? 0,
        salidas_proximas: numero(r.salidas_proximas) ?? 0,
      }))
      .filter((r) => r.ciudad_origen && r.ciudad_destino && Number.isFinite(r.desde_usd) && r.desde_usd > 0);
  } catch (err) {
    console.error("No se pudieron leer las rutas populares:", err);
    return [];
  }
}

/** Cifras reales para la portada (`fn_estadisticas_publicas`), o null. */
export async function estadisticas(): Promise<Estadisticas | null> {
  const supabase = obtenerSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("fn_estadisticas_publicas");
    if (error) {
      console.error("No se pudieron leer las estadísticas:", error.message);
      return null;
    }
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      cooperativas: numero(d.cooperativas) ?? 0,
      ciudades: numero(d.ciudades) ?? 0,
      rutas: numero(d.rutas) ?? 0,
    };
  } catch (err) {
    console.error("No se pudieron leer las estadísticas:", err);
    return null;
  }
}

/**
 * Orígenes y destinos con ruta activa de una cooperativa activa, para los selectores
 * de la calculadora. [] sin configuración o ante un error (la calculadora se oculta).
 */
export async function origenesConDestinos(): Promise<OrigenConDestinos[]> {
  const supabase = obtenerSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data: coops, error: errorCoops } = await supabase
      .from("cooperativas")
      .select("id")
      .eq("estado", "ACTIVA");
    if (errorCoops) {
      console.error("No se pudieron leer las cooperativas activas:", errorCoops.message);
      return [];
    }
    const ids = (coops ?? []).map((c) => c.id as string);
    if (ids.length === 0) return [];

    const { data: rutas, error: errorRutas } = await supabase
      .from("rutas")
      .select("ciudad_origen, ciudad_destino")
      .eq("activa", true)
      .in("cooperativa_id", ids)
      .limit(2000);
    if (errorRutas) {
      console.error("No se pudieron leer las rutas:", errorRutas.message);
      return [];
    }

    // Agrupa por ciudad sin distinguir tildes ni mayúsculas (como normalizar_localidad).
    const mapa = new Map<string, { origen: string; destinos: Map<string, string> }>();
    for (const r of rutas ?? []) {
      const origen = String(r.ciudad_origen ?? "").trim();
      const destino = String(r.ciudad_destino ?? "").trim();
      if (!origen || !destino) continue;
      const k = claveCiudad(origen);
      const entrada = mapa.get(k) ?? { origen, destinos: new Map<string, string>() };
      entrada.destinos.set(claveCiudad(destino), destino);
      mapa.set(k, entrada);
    }

    // Se ordena por el nombre que se muestra ("Mérida"), no por el valor guardado ("merida").
    const orden = (a: string, b: string) => nombreLocalidad(a).localeCompare(nombreLocalidad(b), "es");
    return [...mapa.values()]
      .map((e) => ({ origen: e.origen, destinos: [...e.destinos.values()].sort(orden) }))
      .sort((a, b) => orden(a.origen, b.origen));
  } catch (err) {
    console.error("No se pudieron leer las rutas:", err);
    return [];
  }
}
