"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function guardarRuta(formData: FormData, rutaId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa") return { error: "No autorizado" };

  const estado_origen = formData.get("estado_origen") as string;
  const ciudad_origen = formData.get("ciudad_origen") as string;
  const estado_destino = formData.get("estado_destino") as string;
  const ciudad_destino = formData.get("ciudad_destino") as string;
  const duracion_estimada_min = parseInt(formData.get("duracion_estimada_min") as string);
  const precio_pasaje = parseFloat(formData.get("precio_pasaje") as string);
  const activa = formData.get("activa") === "on";

  if (!estado_origen || !ciudad_origen || !estado_destino || !ciudad_destino) {
    return { error: "Todos los campos de origen y destino son requeridos" };
  }
  if (duracion_estimada_min <= 0 || isNaN(duracion_estimada_min)) {
    return { error: "La duración debe ser un número mayor a 0" };
  }
  if (precio_pasaje <= 0 || isNaN(precio_pasaje)) {
    return { error: "El precio debe ser un número mayor a 0" };
  }
  if (estado_origen === estado_destino && ciudad_origen === ciudad_destino) {
    return { error: "El origen y el destino no pueden ser exactamente iguales" };
  }

  const payload = {
    cooperativa_id: profile.cooperativa_id,
    estado_origen,
    ciudad_origen,
    estado_destino,
    ciudad_destino,
    duracion_estimada_min,
    precio_pasaje,
    activa,
  };

  if (rutaId) {
    const { error } = await supabase.from("rutas").update(payload).eq("id", rutaId).eq("cooperativa_id", profile.cooperativa_id);
    if (error) return { error: "Error al actualizar ruta" };
  } else {
    const { error } = await supabase.from("rutas").insert(payload);
    if (error) return { error: "Error al crear ruta" };
  }

  revalidatePath("/cooperativas/rutas");
  return { success: true };
}

export async function checkDesactivarRuta(rutaId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  
  const { count, error } = await supabase
    .from("viajes")
    .select("id", { count: "exact", head: true })
    .eq("ruta_id", rutaId)
    .eq("estado", "PROGRAMADO")
    .gt("fecha_hora_salida", new Date().toISOString());

  if (error) return { error: "Error al consultar viajes" };
  return { hasViajes: (count || 0) > 0, count: count || 0 };
}

export async function toggleActivaRuta(rutaId: string, activa: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  
  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa") return { error: "No autorizado" };

  const { error } = await supabase.from("rutas").update({ activa }).eq("id", rutaId).eq("cooperativa_id", profile.cooperativa_id);
  if (error) return { error: "Error al cambiar estado de la ruta" };

  revalidatePath("/cooperativas/rutas");
  return { success: true };
}
