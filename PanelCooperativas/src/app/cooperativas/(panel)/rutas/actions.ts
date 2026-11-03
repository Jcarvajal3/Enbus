"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { humanizeError } from "@/lib/errores";

/** "15,50" | "15.50" | "1.250,00" -> número (NaN si no es válido). */
function parsePrecio(valor: FormDataEntryValue | null): number {
  const texto = String(valor ?? "").trim().replace(/\s/g, "");
  if (!texto) return NaN;
  // El último separador es el decimal: "1.234,56" y "1,234.56" -> 1234.56.
  const normalizado =
    texto.lastIndexOf(",") > texto.lastIndexOf(".") ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalizado) ? Number(normalizado) : NaN;
}

export async function guardarRuta(formData: FormData, rutaId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión de nuevo." };

  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa") {
    return { error: "Solo el administrador de la cooperativa puede crear o editar rutas." };
  }

  const estado_origen = formData.get("estado_origen") as string;
  const ciudad_origen = formData.get("ciudad_origen") as string;
  const estado_destino = formData.get("estado_destino") as string;
  const ciudad_destino = formData.get("ciudad_destino") as string;
  const duracion_estimada_min = parseInt(formData.get("duracion_estimada_min") as string, 10);
  // Precio de referencia en USD: el pasajero paga en Bs a la tasa BCV del día.
  const precio_pasaje = Math.round(parsePrecio(formData.get("precio_pasaje")) * 100) / 100;
  const activa = formData.get("activa") === "on";

  if (!estado_origen || !ciudad_origen || !estado_destino || !ciudad_destino) {
    return { error: "Elige el estado y la ciudad de origen y de destino." };
  }
  if (isNaN(duracion_estimada_min) || duracion_estimada_min <= 0) {
    return { error: "La duración debe ser un número de minutos mayor a 0." };
  }
  if (isNaN(precio_pasaje) || precio_pasaje <= 0) {
    return { error: "Escribe el precio del pasaje en dólares, por ejemplo 15 o 15,50." };
  }
  if (estado_origen === estado_destino && ciudad_origen === ciudad_destino) {
    return { error: "El origen y el destino no pueden ser la misma ciudad." };
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
    if (error) return { error: humanizeError(error, "actualizar la ruta") };
  } else {
    const { error } = await supabase.from("rutas").insert(payload);
    if (error) return { error: humanizeError(error, "crear la ruta") };
  }

  revalidatePath("/cooperativas/rutas");
  return { success: true };
}

export async function checkDesactivarRuta(rutaId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión de nuevo." };

  const { count, error } = await supabase
    .from("viajes")
    .select("id", { count: "exact", head: true })
    .eq("ruta_id", rutaId)
    .eq("estado", "PROGRAMADO")
    .gt("fecha_hora_salida", new Date().toISOString());

  if (error) return { error: humanizeError(error, "revisar los viajes de la ruta") };
  return { hasViajes: (count || 0) > 0, count: count || 0 };
}

export async function toggleActivaRuta(rutaId: string, activa: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión de nuevo." };

  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa") {
    return { error: "Solo el administrador de la cooperativa puede activar o desactivar rutas." };
  }

  const { error } = await supabase.from("rutas").update({ activa }).eq("id", rutaId).eq("cooperativa_id", profile.cooperativa_id);
  if (error) return { error: humanizeError(error, "cambiar el estado de la ruta") };

  revalidatePath("/cooperativas/rutas");
  return { success: true };
}
