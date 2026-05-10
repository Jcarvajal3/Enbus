"use server";

import { createClient } from "@/lib/supabase/server";

export async function recibirEncomienda(encomiendaId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("encomiendas")
    .update({ estado: "EN_OFICINA_DESTINO" })
    .eq("id", encomiendaId)
    .eq("estado", "EN_TRANSITO"); // Safety check

  // Notificaciones al destinatario (Push + WhatsApp con PIN)
  // se disparan via trigger/Edge Function automáticamente

  return { success: !error, error: error?.message };
}

export async function recibirLote(encomiendaIds: string[]) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("encomiendas")
    .update({ estado: "EN_OFICINA_DESTINO" })
    .in("id", encomiendaIds)
    .eq("estado", "EN_TRANSITO");

  return { success: !error, count: encomiendaIds.length, error: error?.message };
}
