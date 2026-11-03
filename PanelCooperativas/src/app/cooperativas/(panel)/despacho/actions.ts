"use server";

// ─── Despacho de encomiendas a un viaje ─────────────────────────────────────
// fn_despachar_encomiendas valida todo en el servidor (todo o nada): mismo
// destino y origen que el viaje, recibida, pagada o con cobro en destino.
// Despachar NO cambia el estado del viaje: la salida del bus se marca aparte
// (viajes/actions.ts → marcarSalidaViaje).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { codigoEB, humanizeError, parseDetalleEB } from "@/lib/errores";
import type { DespachoRealizado, EncomiendaRechazadaDespacho } from "@/lib/types/pagos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function despacharEncomiendas(
  viajeId: string,
  encomiendaIds: string[]
): Promise<
  | { success: true; data: DespachoRealizado; error?: undefined; codigo?: undefined; rechazadas?: undefined }
  | {
      success: false;
      data?: undefined;
      error: string;
      codigo?: string;
      /** Encomiendas que no pueden ir en este viaje (EB_DESPACHO_INVALIDO). */
      rechazadas?: EncomiendaRechazadaDespacho[];
    }
> {
  if (!UUID_RE.test(viajeId ?? "")) {
    return { success: false, error: "Primero elige el viaje en el que vas a cargar las encomiendas." };
  }
  const ids = Array.from(new Set((encomiendaIds ?? []).filter((id) => UUID_RE.test(id))));
  if (ids.length === 0) {
    return { success: false, error: "Escanea al menos una encomienda antes de confirmar el despacho." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_despachar_encomiendas", {
      p_viaje_id: viajeId,
      p_encomienda_ids: ids,
    });

    if (error) {
      console.error("Error al despachar las encomiendas:", error);
      const detalle = parseDetalleEB(error);
      return {
        success: false,
        error: humanizeError(error, "despachar las encomiendas"),
        codigo: codigoEB(error) ?? undefined,
        rechazadas: Array.isArray(detalle.rechazadas)
          ? (detalle.rechazadas as EncomiendaRechazadaDespacho[])
          : undefined,
      };
    }

    revalidatePath("/cooperativas/taquilla/encomiendas");
    revalidatePath("/cooperativas/despacho");
    revalidatePath("/cooperativas/recepcion-destino");
    revalidatePath("/cooperativas/viajes");
    return { success: true, data: data as DespachoRealizado };
  } catch (error) {
    console.error("Error inesperado en despacharEncomiendas:", error);
    return { success: false, error: humanizeError(error, "despachar las encomiendas") };
  }
}
