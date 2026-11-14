// ─── Consultas públicas del sitio (SOLO SERVIDOR) ────────────────────────────
// Usan el cliente con service role: importar únicamente desde server components y
// server actions. Ninguna función lanza: sin configuración devuelven null o [], y
// ante un error lo registran y devuelven algo que la página sabe mostrar u ocultar.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TasaRef } from "@/lib/dinero.generated";

// ─── Cliente ─────────────────────────────────────────────────────────────────

let cliente: SupabaseClient | null | undefined;

/**
 * Cliente admin de Supabase, o null si faltan las variables. A diferencia de
 * `createAdminClient()` del panel, no lanza: el sitio se ve igual sin configuración
 * y solo oculta lo que depende de los datos.
 */
export function supabaseSitio(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cliente = url && clave ? createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cliente;
}

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

export interface RutaPopular {
  ciudad_origen: string;
  ciudad_destino: string;
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

// ─── Utilidades ──────────────────────────────────────────────────────────────

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

// ─── Consultas ───────────────────────────────────────────────────────────────

/** Tasa BCV vigente (`fn_tasa_bcv_vigente`), o null. */
export async function tasaBCV(): Promise<TasaRef | null> {
  const supabase = supabaseSitio();
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

/** Rastreo público por código de seguimiento (`fn_rastrear_encomienda_publico`). null sin configuración. */
export async function rastrear(codigo: string): Promise<ResultadoRastreo | null> {
  const supabase = supabaseSitio();
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

/** Rutas con más salidas próximas (`fn_rutas_populares`); [] sin configuración o ante un error. */
export async function rutasPopulares(limite = 8): Promise<RutaPopular[]> {
  const supabase = supabaseSitio();
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
        ciudad_destino: String(r.ciudad_destino ?? ""),
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
  const supabase = supabaseSitio();
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
