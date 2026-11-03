"use server";

// ─── Resumen: bandeja "Requiere tu atención" (#51, PC-14) ────────────────────
// Una sola llamada a fn_bandeja_cooperativa() (migración 20260721000002): los
// conteos ya vienen filtrados por la sucursal del empleado, si la tiene.

import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import type { BandejaCooperativa } from "@/lib/types/operacion";

export type ResultadoBandeja =
  | { ok: true; data: BandejaCooperativa; error?: undefined }
  | { ok: false; data?: undefined; error: string };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Normaliza la respuesta (los numeric de Postgres pueden llegar como texto). */
function normalizar(d: Partial<BandejaCooperativa> | null): BandejaCooperativa {
  const p = d?.proxima_salida ?? null;
  return {
    pagos_por_verificar: num(d?.pagos_por_verificar),
    reembolsos_por_devolver: num(d?.reembolsos_por_devolver),
    reembolsos_usd: num(d?.reembolsos_usd),
    encomiendas_por_vencer: num(d?.encomiendas_por_vencer),
    dias_minimos_para_devolucion: num(d?.dias_minimos_para_devolucion),
    encomiendas_por_despachar: num(d?.encomiendas_por_despachar),
    encomiendas_en_camino: num(d?.encomiendas_en_camino),
    proxima_salida:
      p && p.viaje_id
        ? {
            viaje_id: p.viaje_id,
            ciudad_origen: p.ciudad_origen ?? "",
            ciudad_destino: p.ciudad_destino ?? "",
            salida: p.salida,
            minutos_para_salir: num(p.minutos_para_salir),
            boletos_vendidos: num(p.boletos_vendidos),
            asientos_disponibles: num(p.asientos_disponibles),
            encomiendas_por_despachar: num(p.encomiendas_por_despachar),
          }
        : null,
    generado_at: d?.generado_at ?? new Date().toISOString(),
  };
}

export async function cargarBandeja(): Promise<ResultadoBandeja> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_bandeja_cooperativa");
  if (error) {
    console.error("[cargarBandeja] Error:", error);
    return { ok: false, error: humanizeError(error, "cargar tus pendientes") };
  }
  return { ok: true, data: normalizar(data as Partial<BandejaCooperativa> | null) };
}
