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

    const { error } = await supabase.from("encomiendas")
      .update({ 
        viaje_asignado_id: viajeId,
        estado: "EN_TRANSITO" 
      })
      .in("id", encomiendaIds)
      .eq("estado", "RECIBIDO");

    if (error) return { success: false, error: error.message };

    revalidatePath("/cooperativas/taquilla/encomiendas");
    revalidatePath("/cooperativas/taquilla/encomiendas/despacho");
    
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error interno en el servidor" };
  }
}
