"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { codigoEB, humanizeError, parseDetalleEB } from "@/lib/errores";
import type { SalidaViaje } from "@/lib/types/pagos";
import type { ImpactoCancelarViaje, ResultadoCancelarViaje } from "@/lib/types/reembolsos";
import type { ResultadoCompletarViaje, ResultadoEditarViaje } from "@/lib/types/operacion";
import { fechaHoraVEaISO } from "@/lib/fechas";
import { planificarSalidas } from "./salidas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!rutaId) return { error: "Elige la ruta del viaje." };

  const { data: ruta } = await supabase
    .from("rutas")
    .select("duracion_estimada_min, activa")
    .eq("id", rutaId)
    .eq("cooperativa_id", profile.cooperativa_id)
    .single();

  if (!ruta) return { error: "No encontramos la ruta. Actualiza la página y vuelve a elegirla." };
  if (!ruta.activa) return { error: "Esa ruta está desactivada. Reactívala en Rutas o elige otra." };

  // Parse numeric fields — FormData always delivers strings
  const asientosTotales = parseInt(payload.asientos_totales);
  if (isNaN(asientosTotales) || asientosTotales < 1 || asientosTotales > 80) {
    return { error: "El bus debe tener entre 1 y 80 asientos." };
  }

  // Las fechas y horas del formulario son hora de Venezuela. Se convierten a ISO con
  // lib/fechas para no depender de la zona horaria del servidor (Vercel corre en UTC).
  if (isRecurring) {
    // Misma función que el resumen del formulario: se crea exactamente lo anunciado.
    const plan = planificarSalidas({
      dias: recurringDays ?? [],
      desde: recurringStart ?? "",
      hasta: recurringEnd ?? "",
      hora: payload.hora_fija ?? "",
    });
    if (!plan.ok) return { error: plan.error };

    const viajesToInsert = plan.salidas.map((salida) => ({
      cooperativa_id: profile.cooperativa_id,
      ruta_id: rutaId,
      fecha_hora_salida: salida,
      fecha_hora_llegada_est: llegadaEstimada(salida, ruta.duracion_estimada_min),
      asientos_totales: asientosTotales,
      asientos_disponibles: asientosTotales,
      numero_unidad: payload.numero_unidad || null,
      nombre_chofer: payload.nombre_chofer || null,
      estado: "PROGRAMADO",
    }));

    const { error } = await supabase.from("viajes").insert(viajesToInsert);
    if (error) {
      console.error("[guardarViaje] Error insertar recurrentes:", error);
      return { error: humanizeError(error, "programar los viajes") };
    }
  } else {
    // Viaje único. El input datetime-local envía 'YYYY-MM-DDTHH:mm' sin zona horaria.
    if (!payload.fecha_hora_salida) return { error: "Elige la fecha y la hora de salida." };

    const [fecha, hora] = payload.fecha_hora_salida.split("T");
    let salida: string;
    try {
      salida = fechaHoraVEaISO(fecha ?? "", hora ?? "");
    } catch {
      return { error: "Revisa la fecha y la hora de salida." };
    }
    if (new Date(salida).getTime() <= Date.now()) {
      return { error: "La salida tiene que ser más tarde que ahora." };
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
  revalidatePath("/cooperativas/dashboard");
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

type FalloViaje = {
  success: false;
  data?: undefined;
  error: string;
  codigo?: string;
  /** Campo con el error (`detail.campo`): "salida", "asientos" o "motivo". */
  campo?: string;
  /** EB_DATOS_INVALIDOS en asientos: mínimo que admite el bus. */
  minimo?: number;
};

function falloViaje(error: unknown, accion: string): FalloViaje {
  const detalle = parseDetalleEB(error);
  const minimo = Number(detalle.minimo);
  return {
    success: false,
    error: humanizeError(error, accion),
    codigo: codigoEB(error) ?? undefined,
    campo: typeof detalle.campo === "string" ? detalle.campo : undefined,
    minimo: Number.isFinite(minimo) && minimo > 0 ? minimo : undefined,
  };
}

/**
 * Edita un viaje programado (solo el administrador; lo valida fn_editar_viaje).
 * `undefined` = sin cambio; `""` en unidad o chofer lo borra. La salida llega en
 * hora de Venezuela ('YYYY-MM-DDTHH:mm'). Si cambia la hora y hay pasajeros, el
 * motivo es obligatorio y se avisa a cada comprador.
 */
export async function editarViaje(input: {
  viajeId: string;
  salida?: string;
  numeroUnidad?: string;
  nombreChofer?: string;
  asientosTotales?: number;
  motivo?: string;
}): Promise<{ success: true; data: ResultadoEditarViaje; error?: undefined } | FalloViaje> {
  if (!UUID_RE.test(input.viajeId ?? "")) {
    return { success: false, error: "No encontramos ese viaje. Actualiza la página e intenta de nuevo." };
  }
  let salidaISO: string | null = null;
  if (input.salida !== undefined) {
    const [fecha, hora] = input.salida.split("T");
    try {
      salidaISO = fechaHoraVEaISO(fecha ?? "", hora ?? "");
    } catch {
      return { success: false, error: "Revisa la fecha y la hora de salida.", campo: "salida" };
    }
  }
  let asientos: number | null = null;
  if (input.asientosTotales !== undefined) {
    asientos = Math.trunc(Number(input.asientosTotales));
    if (!Number.isFinite(asientos) || asientos < 1 || asientos > 80) {
      return { success: false, error: "El bus debe tener entre 1 y 80 asientos.", campo: "asientos" };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_editar_viaje", {
    p_viaje_id: input.viajeId,
    p_numero_unidad: input.numeroUnidad === undefined ? null : input.numeroUnidad.trim(),
    p_nombre_chofer: input.nombreChofer === undefined ? null : input.nombreChofer.trim(),
    p_fecha_hora_salida: salidaISO,
    p_asientos_totales: asientos,
    p_motivo: input.motivo?.trim() || null,
  });
  if (error) {
    console.error("[editarViaje] Error:", error);
    return falloViaje(error, "editar el viaje");
  }

  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/taquilla/boletos");
  revalidatePath("/cooperativas/despacho");
  revalidatePath("/cooperativas/dashboard");
  return { success: true, data: data as ResultadoEditarViaje };
}

/** El bus llegó: EN_CURSO → COMPLETADO (ambos roles; lo valida fn_completar_viaje). */
export async function completarViaje(
  viajeId: string
): Promise<{ success: true; data: ResultadoCompletarViaje; error?: undefined } | FalloViaje> {
  if (!UUID_RE.test(viajeId ?? "")) {
    return { success: false, error: "No encontramos ese viaje. Actualiza la página e intenta de nuevo." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_completar_viaje", { p_viaje_id: viajeId });
  if (error) {
    console.error("[completarViaje] Error:", error);
    return falloViaje(error, "marcar la llegada del viaje");
  }
  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/recepcion-destino");
  revalidatePath("/cooperativas/dashboard");
  return { success: true, data: (data ?? { estado: "COMPLETADO" }) as ResultadoCompletarViaje };
}
