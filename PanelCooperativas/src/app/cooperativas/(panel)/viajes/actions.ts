"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function guardarViaje(
  payload: Record<string, string>,
  isRecurring: boolean,
  recurringDays?: string[],
  recurringStart?: string,
  recurringEnd?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("cooperativa_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin_cooperativa") return { error: "No autorizado" };

  const rutaId = payload.ruta_id;
  if (!rutaId) return { error: "Debes seleccionar una ruta" };

  const { data: ruta } = await supabase
    .from("rutas")
    .select("duracion_estimada_min, activa")
    .eq("id", rutaId)
    .eq("cooperativa_id", profile.cooperativa_id)
    .single();

  if (!ruta) return { error: "Ruta no encontrada" };
  if (!ruta.activa) return { error: "La ruta seleccionada está inactiva" };

  // Parse numeric fields — FormData always delivers strings
  const asientosTotales = parseInt(payload.asientos_totales);
  if (isNaN(asientosTotales) || asientosTotales < 1) {
    return { error: "El número de asientos debe ser mayor a 0" };
  }

  if (isRecurring && recurringDays && recurringStart && recurringEnd) {
    if (recurringDays.length === 0) {
      return { error: "Debes seleccionar al menos un día de la semana" };
    }

    const [hours, minutes] = (payload.hora_fija ?? "").split(":");
    if (!hours || !minutes) return { error: "La hora de salida es requerida" };

    // Build start/end as local midnight to avoid UTC offset shifting the day
    const current = new Date(`${recurringStart}T${payload.hora_fija}:00`);
    const end = new Date(`${recurringEnd}T23:59:59`);

    const viajesToInsert: object[] = [];

    while (current <= end) {
      const dayMap = ["D", "L", "M", "Mi", "J", "V", "S"];
      const dayStr = dayMap[current.getDay()];

      if (recurringDays.includes(dayStr)) {
        const salida = new Date(current);
        const llegada = new Date(salida.getTime() + ruta.duracion_estimada_min * 60000);

        viajesToInsert.push({
          cooperativa_id: profile.cooperativa_id,
          ruta_id: rutaId,
          fecha_hora_salida: salida.toISOString(),
          fecha_hora_llegada_est: llegada.toISOString(),
          asientos_totales: asientosTotales,
          asientos_disponibles: asientosTotales,
          numero_unidad: payload.numero_unidad || null,
          nombre_chofer: payload.nombre_chofer || null,
          estado: "PROGRAMADO",
        });
      }

      current.setDate(current.getDate() + 1);
    }

    if (viajesToInsert.length === 0) {
      return { error: "No hay fechas coincidentes en el rango con los días seleccionados" };
    }

    const { error } = await supabase.from("viajes").insert(viajesToInsert);
    if (error) {
      console.error("[guardarViaje] Error insertar recurrentes:", error);
      return { error: `Error de base de datos: ${error.message}` };
    }
  } else {
    // Viaje único
    if (!payload.fecha_hora_salida) return { error: "La fecha de salida es requerida" };

    const salida = new Date(payload.fecha_hora_salida);
    if (isNaN(salida.getTime())) return { error: "Fecha de salida inválida" };

    const llegada = new Date(salida.getTime() + ruta.duracion_estimada_min * 60000);

    const { error } = await supabase.from("viajes").insert({
      cooperativa_id: profile.cooperativa_id,
      ruta_id: rutaId,
      fecha_hora_salida: salida.toISOString(),
      fecha_hora_llegada_est: llegada.toISOString(),
      asientos_totales: asientosTotales,
      asientos_disponibles: asientosTotales,
      numero_unidad: payload.numero_unidad || null,
      nombre_chofer: payload.nombre_chofer || null,
      estado: "PROGRAMADO",
    });

    if (error) {
      console.error("[guardarViaje] Error insertar viaje único:", error);
      return { error: `Error de base de datos: ${error.message}` };
    }
  }

  revalidatePath("/cooperativas/viajes");
  return { success: true };
}

export async function cancelarViaje(viajeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("cooperativa_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin_cooperativa") return { error: "No autorizado" };

  const { error } = await supabase
    .from("viajes")
    .update({ estado: "CANCELADO" })
    .eq("id", viajeId)
    .eq("cooperativa_id", profile.cooperativa_id);

  if (error) {
    console.error("[cancelarViaje] Error:", error);
    return { error: `Error de base de datos: ${error.message}` };
  }

  revalidatePath("/cooperativas/viajes");
  return { success: true };
}

export async function checkBoletosVendidos(viajeId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("boletos")
    .select("id", { count: "exact", head: true })
    .eq("viaje_id", viajeId)
    .in("estado", ["RESERVADO", "PAGADO"]);

  if (error) return { error: "Error verificando boletos" };
  return { count: count || 0 };
}
