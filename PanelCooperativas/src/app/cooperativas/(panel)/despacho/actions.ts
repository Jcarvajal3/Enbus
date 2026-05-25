"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function despacharEncomiendas(viajeId: string, encomiendaIds: string[]) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "No autorizado" };

    if (!encomiendaIds.length) {
      return { success: false, error: "No hay encomiendas seleccionadas" };
    }

    // 1. Actualizar las encomiendas seleccionadas de PAGADA a EN_TRANSITO
    const { error: encomiendasError } = await supabase.from("encomiendas")
      .update({ 
        viaje_asignado_id: viajeId,
        estado: "EN_TRANSITO" 
      })
      .in("id", encomiendaIds)
      .eq("estado", "PAGADA");

    if (encomiendasError) {
      console.error("Error al actualizar encomiendas en despacho:", encomiendasError);
      return { success: false, error: encomiendasError.message };
    }

    // 2. Actualizar el estado del viaje a EN_CURSO (Spec: Al despachar, el viaje asociado cambia a estado EN_CURSO)
    const { error: viajeError } = await supabase.from("viajes")
      .update({ estado: "EN_CURSO" })
      .eq("id", viajeId);

    if (viajeError) {
      console.error("Error al actualizar el estado del viaje a EN_CURSO:", viajeError);
      return { success: false, error: viajeError.message };
    }

    // Revalidar las rutas afectadas
    revalidatePath("/cooperativas/taquilla/encomiendas");
    revalidatePath("/cooperativas/despacho");
    revalidatePath("/cooperativas/viajes");
    
    return { success: true };
  } catch (error) {
    console.error("Error inesperado en despacharEncomiendas Server Action:", error);
    return { success: false, error: "Error interno en el servidor" };
  }
}
