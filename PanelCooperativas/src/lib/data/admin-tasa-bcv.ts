import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import { requireSuperAdmin } from "./admin-auth";

export interface HistorialTasaBCV {
  fecha: string;
  tasa: number;
  fuente: "dolarapi" | "manual";
  motivo: string | null;
  registrada_por: string | null;
  registrada_por_nombre: string | null;
  created_at: string;
  updated_at: string;
}

type FilaHistorialTasaBCV = {
  fecha: string;
  tasa: number | string;
  fuente: string;
  motivo: string | null;
  registrada_por: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { nombre_completo?: string | null } | null;
};

export async function fetchHistorialTasasBCV(): Promise<HistorialTasaBCV[]> {
  await requireSuperAdmin();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasas_bcv")
      .select("fecha, tasa, fuente, motivo, registrada_por, created_at, updated_at, profiles:registrada_por(nombre_completo)")
      .order("fecha", { ascending: false })
      .limit(60);

    if (error) {
      console.error("Error fetching tasas BCV history:", error);
      throw new Error(humanizeError(error, "cargar el historial de tasas BCV"));
    }

    return ((data || []) as unknown as FilaHistorialTasaBCV[]).map((row) => ({
      fecha: String(row.fecha).slice(0, 10),
      tasa: Number(row.tasa),
      fuente: row.fuente === "manual" ? "manual" : "dolarapi",
      motivo: row.motivo ?? null,
      registrada_por: row.registrada_por ?? null,
      registrada_por_nombre: row.profiles?.nombre_completo ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (error) {
    console.error("Error inside fetchHistorialTasasBCV:", error);
    throw error instanceof Error ? error : new Error(humanizeError(error, "cargar el historial de tasas BCV"));
  }
}
