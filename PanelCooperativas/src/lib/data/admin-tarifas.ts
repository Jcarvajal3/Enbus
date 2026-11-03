import { createClient } from "@/lib/supabase/server";
import { estadoDeTarifa, type Tarifa, type RouteOption } from "@/lib/types/admin-tarifas";
import { humanizeError } from "@/lib/errores";

type FilaTarifa = Record<string, unknown> & {
  id: string;
  tarifa_por_kg: number | string;
  factor_distancia_por_min: number | string;
  dimensiones_max_cm: number;
  peso_max_kg: number | string;
  vigente_desde: string;
  activa: boolean;
  creada_por: string;
  created_at: string;
  publicada_at?: string | null;
  reemplazada_at?: string | null;
  nota?: string | null;
  profiles?: { nombre_completo?: string | null } | null;
};

function aTarifa(row: FilaTarifa): Tarifa {
  return {
    id: row.id,
    tarifa_por_kg: Number(row.tarifa_por_kg),
    factor_distancia_por_min: Number(row.factor_distancia_por_min),
    dimensiones_max_cm: row.dimensiones_max_cm,
    peso_max_kg: Number(row.peso_max_kg),
    vigente_desde: row.vigente_desde,
    activa: row.activa,
    creada_por: row.creada_por,
    created_at: row.created_at,
    creador_nombre: row.profiles?.nombre_completo || null,
    publicada_at: row.publicada_at ?? null,
    reemplazada_at: row.reemplazada_at ?? null,
    nota: row.nota ?? null,
    estado: estadoDeTarifa(row),
  };
}

export async function fetchTarifaVigente(): Promise<Tarifa | null> {
  try {
    const supabase = await createClient();
    
    // Fetch the active tariff and join with the creator's profile
    const { data, error } = await supabase
      .from("tarifas")
      .select("*, profiles:creada_por(nombre_completo)")
      .eq("activa", true)
      .maybeSingle();

    if (error) {
      console.error("Error fetching active tariff:", error);
      throw new Error(humanizeError(error, "cargar las tarifas"));
    }

    if (!data) return null;

    return aTarifa(data);
  } catch (error) {
    // Un error no es "sin tarifa vigente": se propaga a error.tsx con "Reintentar".
    console.error("Error inside fetchTarifaVigente:", error);
    throw error instanceof Error ? error : new Error(humanizeError(error, "cargar las tarifas"));
  }
}

/**
 * Tarifa programada (publicada con fecha futura, todavía sin entrar en vigor).
 * fn_publicar_tarifa deja como mucho una: cada programación nueva reemplaza a la anterior.
 */
export async function fetchTarifaProgramada(): Promise<Tarifa | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarifas")
    .select("*, profiles:creada_por(nombre_completo)")
    .eq("activa", false)
    .not("publicada_at", "is", null)
    .is("reemplazada_at", null)
    .order("vigente_desde", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching scheduled tariff:", error);
    throw new Error(humanizeError(error, "cargar las tarifas"));
  }
  return data ? aTarifa(data as FilaTarifa) : null;
}

export async function fetchHistorialTarifas(): Promise<Tarifa[]> {
  try {
    const supabase = await createClient();

    // Fetch all tariffs ordered by vigencia / created_at DESC
    const { data, error } = await supabase
      .from("tarifas")
      .select("*, profiles:creada_por(nombre_completo)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching tariff history:", error);
      throw new Error(humanizeError(error, "cargar las tarifas"));
    }

    return (data || []).map(aTarifa);
  } catch (error) {
    console.error("Error inside fetchHistorialTarifas:", error);
    throw error instanceof Error ? error : new Error(humanizeError(error, "cargar las tarifas"));
  }
}

export async function fetchRutasParaSimulador(): Promise<RouteOption[]> {
  try {
    const supabase = await createClient();

    // Fetch active routes and join with the cooperativa name
    const { data, error } = await supabase
      .from("rutas")
      .select("id, estado_origen, ciudad_origen, estado_destino, ciudad_destino, duracion_estimada_min, cooperativas(nombre)")
      .eq("activa", true);

    if (error) {
      console.error("Error fetching routes for simulator:", error);
      throw new Error(humanizeError(error, "cargar las tarifas"));
    }

    return (data || []).map((row): RouteOption => ({
      id: row.id,
      estado_origen: row.estado_origen,
      ciudad_origen: row.ciudad_origen,
      estado_destino: row.estado_destino,
      ciudad_destino: row.ciudad_destino,
      duracion_estimada_min: row.duracion_estimada_min,
      cooperativa_nombre: (row.cooperativas as { nombre?: string | null } | null)?.nombre || "Cooperativa sin nombre",
    }));
  } catch (error) {
    console.error("Error inside fetchRutasParaSimulador:", error);
    throw error instanceof Error ? error : new Error(humanizeError(error, "cargar las rutas"));
  }
}
