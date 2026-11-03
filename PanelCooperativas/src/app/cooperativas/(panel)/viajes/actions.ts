"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { codigoEB, humanizeError, parseDetalleEB } from "@/lib/errores";
import type { SalidaViaje } from "@/lib/types/pagos";
import type { ImpactoCancelarViaje, ResultadoCancelarViaje } from "@/lib/types/reembolsos";
import { fechaHoraVEaISO, sumarDiasVE } from "@/lib/fechas";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Índice = getUTCDay() (0 = domingo). Deben coincidir con los valores del ToggleGroup del cliente.
const DIAS_SEMANA = ["D", "L", "M", "Mi", "J", "V", "S"];

/** Día de la semana de una fecha 'YYYY-MM-DD' (calendario puro, sin zona horaria). */
function diaSemana(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Llegada estimada en ISO a partir de la salida ISO y la duración de la ruta. */
function llegadaEstimada(salidaISO: string, duracionMin: number): string {
  return new Date(new Date(salidaISO).getTime() + duracionMin * 60000).toISOString();
}

export async function guardarViaje(
  payload: Record<string, string>,
  isRecurring: boolean,
  recurringDays?: string[],
  recurringStart?: string,
  recurringEnd?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión de nuevo para continuar." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("cooperativa_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin_cooperativa") return { error: "Solo el administrador de la cooperativa puede programar viajes." };

  const rutaId = payload.ruta_id;
  if (!rutaId) return { error: "Debes seleccionar una ruta" };

  const { data: ruta } = await supabase
    .from("rutas")
    .select("duracion_estimada_min, activa")
    .eq("id", rutaId)
    .eq("cooperativa_id", profile.cooperativa_id)
    .single();

  if (!ruta) return { error: "No encontramos la ruta. Actualiza la página y vuelve a elegirla." };
  if (!ruta.activa) return { error: "La ruta seleccionada está inactiva" };

  // Parse numeric fields — FormData always delivers strings
  const asientosTotales = parseInt(payload.asientos_totales);
  if (isNaN(asientosTotales) || asientosTotales < 1) {
    return { error: "El número de asientos debe ser mayor a 0" };
  }

  // Las fechas y horas del formulario son hora de Venezuela. Se convierten a ISO con
  // lib/fechas para no depender de la zona horaria del servidor (Vercel corre en UTC).
  if (isRecurring) {
    if (!recurringDays || recurringDays.length === 0) {
      return { error: "Debes seleccionar al menos un día de la semana" };
    }
    if (!recurringStart || !recurringEnd || !FECHA_RE.test(recurringStart) || !FECHA_RE.test(recurringEnd)) {
      return { error: "Elige las fechas «Desde» y «Hasta» del periodo." };
    }
    if (recurringStart > recurringEnd) {
      return { error: "La fecha «Desde» debe ser anterior o igual a la fecha «Hasta»." };
    }

    const horaFija = payload.hora_fija ?? "";
    if (!HORA_RE.test(horaFija)) return { error: "La hora de salida es requerida" };

    const viajesToInsert: object[] = [];

    try {
      // Comparar 'YYYY-MM-DD' como texto equivale a comparar fechas
      for (let fecha = recurringStart; fecha <= recurringEnd; fecha = sumarDiasVE(fecha, 1)) {
        if (!recurringDays.includes(diaSemana(fecha))) continue;

        const salida = fechaHoraVEaISO(fecha, horaFija);

        viajesToInsert.push({
          cooperativa_id: profile.cooperativa_id,
          ruta_id: rutaId,
          fecha_hora_salida: salida,
          fecha_hora_llegada_est: llegadaEstimada(salida, ruta.duracion_estimada_min),
          asientos_totales: asientosTotales,
          asientos_disponibles: asientosTotales,
          numero_unidad: payload.numero_unidad || null,
          nombre_chofer: payload.nombre_chofer || null,
          estado: "PROGRAMADO",
        });
      }
    } catch {
      return { error: "Revisa las fechas y la hora de salida: alguna no es válida." };
    }

    if (viajesToInsert.length === 0) {
      return { error: "No hay fechas coincidentes en el rango con los días seleccionados" };
    }

    const { error } = await supabase.from("viajes").insert(viajesToInsert);
    if (error) {
      console.error("[guardarViaje] Error insertar recurrentes:", error);
      return { error: humanizeError(error, "programar los viajes") };
    }
  } else {
    // Viaje único. El input datetime-local envía 'YYYY-MM-DDTHH:mm' sin zona horaria.
    if (!payload.fecha_hora_salida) return { error: "La fecha de salida es requerida" };

    const [fecha, hora] = payload.fecha_hora_salida.split("T");
    let salida: string;
    try {
      salida = fechaHoraVEaISO(fecha ?? "", hora ?? "");
    } catch {
      return { error: "Fecha de salida inválida" };
    }

    const { error } = await supabase.from("viajes").insert({
      cooperativa_id: profile.cooperativa_id,
      ruta_id: rutaId,
      fecha_hora_salida: salida,
      fecha_hora_llegada_est: llegadaEstimada(salida, ruta.duracion_estimada_min),
      asientos_totales: asientosTotales,
      asientos_disponibles: asientosTotales,
      numero_unidad: payload.numero_unidad || null,
      nombre_chofer: payload.nombre_chofer || null,
      estado: "PROGRAMADO",
    });

    if (error) {
      console.error("[guardarViaje] Error insertar viaje único:", error);
      return { error: humanizeError(error, "programar el viaje") };
    }
  }

  revalidatePath("/cooperativas/viajes");
  return { success: true };
}

/**
 * Cancela un viaje programado (solo el administrador; lo valida fn_cancelar_viaje):
 * los boletos pagados pasan a CANCELADO con reembolso del 100 %, las reservas se
 * anulan y se avisa a cada comprador con el motivo. Si hay pagos por verificar en
 * el viaje, falla con EB_PAGOS_PENDIENTES (se resuelven antes).
 */
export async function cancelarViaje(
  viajeId: string,
  motivo: string
): Promise<
  | { success: true; data: ResultadoCancelarViaje; error?: undefined; codigo?: undefined; pendientes?: undefined }
  | {
      success: false;
      data?: undefined;
      error: string;
      codigo?: string;
      /** EB_PAGOS_PENDIENTES: cuántos pagos por verificar bloquean la cancelación. */
      pendientes?: number;
    }
> {
  if (!UUID_RE.test(viajeId ?? "")) {
    return { success: false, error: "No encontramos ese viaje. Actualiza la página e intenta de nuevo." };
  }
  const texto = (motivo ?? "").trim();
  if (texto.length < 5) {
    return {
      success: false,
      error: "Escribe el motivo de la cancelación (mínimo 5 caracteres). Se lo enviaremos a los pasajeros.",
      codigo: "EB_MOTIVO_REQUERIDO",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cancelar_viaje", { p_viaje_id: viajeId, p_motivo: texto });
  if (error) {
    console.error("[cancelarViaje] Error:", error);
    const pendientes = Number(parseDetalleEB(error).pendientes);
    return {
      success: false,
      error: humanizeError(error, "cancelar el viaje"),
      codigo: codigoEB(error) ?? undefined,
      pendientes: Number.isFinite(pendientes) && pendientes > 0 ? pendientes : undefined,
    };
  }

  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/reembolsos");
  revalidatePath("/cooperativas/taquilla/boletos");
  revalidatePath("/cooperativas/despacho");
  revalidatePath("/cooperativas/pagos");
  return { success: true, data: (data ?? { estado: "CANCELADO" }) as ResultadoCancelarViaje };
}

/**
 * Lo que pasará si se cancela el viaje: boletos pagados (y su total en USD),
 * reservas sin pagar, pagos por verificar y encomiendas ya despachadas.
 */
export async function checkBoletosVendidos(
  viajeId: string
): Promise<{ impacto: ImpactoCancelarViaje; error?: undefined } | { impacto?: undefined; error: string }> {
  if (!UUID_RE.test(viajeId ?? "")) {
    return { error: "No encontramos ese viaje. Actualiza la página e intenta de nuevo." };
  }
  const supabase = await createClient();
  const [boletosRes, encomiendasRes] = await Promise.all([
    supabase
      .from("boletos")
      .select("id, estado, precio, pago:pagos!boletos_pago_id_fkey(estado_verificacion)")
      .eq("viaje_id", viajeId)
      .in("estado", ["RESERVADO", "PAGADO"]),
    supabase
      .from("encomiendas")
      .select("id", { count: "exact", head: true })
      .eq("viaje_id", viajeId)
      .eq("estado", "EN_TRANSITO"),
  ]);

  const error = boletosRes.error ?? encomiendasRes.error;
  if (error) {
    console.error("[checkBoletosVendidos] Error:", error);
    return { error: humanizeError(error, "revisar los boletos del viaje") };
  }

  const impacto: ImpactoCancelarViaje = {
    pagados: 0,
    total_usd: 0,
    reservas: 0,
    pagos_pendientes: 0,
    encomiendas_en_transito: encomiendasRes.count ?? 0,
  };
  for (const b of boletosRes.data ?? []) {
    // PostgREST puede devolver el embed como objeto o como arreglo.
    const embed = b.pago as unknown;
    const pago = (Array.isArray(embed) ? embed[0] : embed) as { estado_verificacion?: string | null } | null;
    if (b.estado === "PAGADO") {
      impacto.pagados += 1;
      impacto.total_usd += Number(b.precio ?? 0);
    } else if (pago?.estado_verificacion === "PENDIENTE") {
      impacto.pagos_pendientes += 1;
    } else {
      impacto.reservas += 1;
    }
  }
  impacto.total_usd = Math.round(impacto.total_usd * 100) / 100;
  return { impacto };
}

/**
 * Marca la salida del bus (PROGRAMADO → EN_CURSO): cierra la venta de boletos de esa
 * salida y libera las reservas sin pagar. Los pagos en verificación siguen pendientes.
 * Lo pueden hacer el taquillero y el administrador (lo valida fn_marcar_salida_viaje).
 */
export async function marcarSalidaViaje(viajeId: string): Promise<
  | { success: true; data: SalidaViaje; error?: undefined; codigo?: undefined }
  | { success: false; data?: undefined; error: string; codigo?: string }
> {
  if (!UUID_RE.test(viajeId ?? "")) {
    return { success: false, error: "No encontramos ese viaje. Actualiza la página e intenta de nuevo." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_marcar_salida_viaje", { p_viaje_id: viajeId });
  if (error) {
    console.error("[marcarSalidaViaje] Error:", error);
    return { success: false, error: humanizeError(error, "marcar la salida del viaje"), codigo: codigoEB(error) ?? undefined };
  }

  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/despacho");
  revalidatePath("/cooperativas/taquilla/boletos");
  revalidatePath("/cooperativas/pagos");
  return { success: true, data: data as SalidaViaje };
}
