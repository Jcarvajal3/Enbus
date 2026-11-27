"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { codigoEB, humanizeError, parseDetalleEB } from "@/lib/errores";
import type { SalidaViaje } from "@/lib/types/pagos";
import type { ImpactoCancelarViaje, ResultadoCancelarViaje } from "@/lib/types/reembolsos";
import type { BusParaViaje, ResultadoAsignarBus, ResultadoCompletarViaje, ResultadoEditarViaje } from "@/lib/types/operacion";
import { fechaHoraVEaISO } from "@/lib/fechas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Unidad 2" antes que "Unidad 10". */
const ORDEN_UNIDAD = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

type FalloAsignar = {
  success: false;
  data?: undefined;
  error: string;
  codigo?: string;
  /** `detail.campo`: "bus", etc. */
  campo?: string;
};

function falloAsignar(error: unknown, accion: string): FalloAsignar {
  const detalle = parseDetalleEB(error);
  return {
    success: false,
    error: humanizeError(error, accion),
    codigo: codigoEB(error) ?? undefined,
    campo: typeof detalle.campo === "string" ? detalle.campo : undefined,
  };
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
  /** Campo con el error (`detail.campo`): "salida", "asientos", "motivo" o "bus". */
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

function revalidarViaje() {
  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/taquilla/boletos");
  revalidatePath("/cooperativas/despacho");
  revalidatePath("/cooperativas/dashboard");
}

/**
 * Edita un viaje programado (solo el administrador; lo valida fn_editar_viaje).
 * `undefined` = sin cambio; `""` en unidad o chofer lo borra. La salida llega en
 * hora de Venezuela ('YYYY-MM-DDTHH:mm'). Si cambia la hora y hay pasajeros, el
 * motivo es obligatorio y se avisa a cada comprador. `busId` cambia de bus: la base
 * copia su unidad, su chofer (salvo `nombreChofer`) y sus asientos (salvo
 * `asientosTotales`), sin bajar de los asientos ya vendidos. `quitarUnidad` la deja
 * "Por asignar".
 */
export async function editarViaje(input: {
  viajeId: string;
  salida?: string;
  numeroUnidad?: string;
  nombreChofer?: string;
  asientosTotales?: number;
  busId?: string;
  /** Deja la salida sin unidad (fn_asignar_bus con bus nulo); los demás cambios se aplican antes. */
  quitarUnidad?: boolean;
  motivo?: string;
}): Promise<{ success: true; data: ResultadoEditarViaje; error?: undefined } | FalloViaje> {
  if (!UUID_RE.test(input.viajeId ?? "")) {
    return { success: false, error: "No encontramos ese viaje. Actualiza la página e intenta de nuevo." };
  }
  if (input.busId !== undefined && !UUID_RE.test(input.busId)) {
    return { success: false, error: "No encontramos ese bus. Actualiza la página y vuelve a elegirlo.", campo: "bus" };
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
  const hayOtrosCambios =
    input.salida !== undefined ||
    input.numeroUnidad !== undefined ||
    input.nombreChofer !== undefined ||
    input.asientosTotales !== undefined ||
    input.busId !== undefined;
  if (input.quitarUnidad && !hayOtrosCambios) {
    const { data: q, error: errorQuitar } = await supabase.rpc("fn_asignar_bus", {
      p_viaje_id: input.viajeId,
      p_bus_id: null,
      p_nombre_chofer: null,
    });
    if (errorQuitar) {
      console.error("[editarViaje] Error al quitar la unidad:", errorQuitar);
      return falloViaje(errorQuitar, "quitar la unidad del viaje");
    }
    revalidarViaje();
    const r = (q ?? {}) as Partial<ResultadoAsignarBus>;
    return {
      success: true,
      data: {
        viaje_id: input.viajeId,
        salida: "",
        llegada_estimada: "",
        asientos_totales: Number(r.asientos_totales) || 0,
        asientos_disponibles: Number(r.asientos_disponibles) || 0,
        bus_id: null,
        numero_unidad: null,
        nombre_chofer: null,
        pasajeros_avisados: 0,
      },
    };
  }
  const { data, error } = await supabase.rpc("fn_editar_viaje", {
    p_viaje_id: input.viajeId,
    p_numero_unidad: input.numeroUnidad === undefined ? null : input.numeroUnidad.trim(),
    p_nombre_chofer: input.nombreChofer === undefined ? null : input.nombreChofer.trim(),
    p_fecha_hora_salida: salidaISO,
    p_asientos_totales: asientos,
    p_motivo: input.motivo?.trim() || null,
    // Solo si cambia el bus (p_bus_id existe desde 20261109000001).
    ...(input.busId !== undefined ? { p_bus_id: input.busId } : {}),
  });
  if (error) {
    console.error("[editarViaje] Error:", error);
    return falloViaje(error, "editar el viaje");
  }

  if (input.quitarUnidad) {
    const { error: errorQuitar } = await supabase.rpc("fn_asignar_bus", {
      p_viaje_id: input.viajeId,
      p_bus_id: null,
      p_nombre_chofer: null,
    });
    if (errorQuitar) {
      console.error("[editarViaje] Error al quitar la unidad:", errorQuitar);
      revalidarViaje();
      return falloViaje(errorQuitar, "quitar la unidad");
    }
  }

  revalidarViaje();
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

/**
 * Asigna (o quita, con `busId` null) la unidad de una salida programada. Un chofer
 * vacío deja el del bus. Si ya hay boletos, la base no sube los asientos sola.
 */
export async function asignarUnidad(input: {
  viajeId: string;
  busId: string | null;
  nombreChofer?: string;
}): Promise<{ success: true; data: ResultadoAsignarBus; error?: undefined } | FalloAsignar> {
  if (!UUID_RE.test(input.viajeId ?? "")) {
    return { success: false, error: "No encontramos esa salida. Actualiza la página e intenta de nuevo." };
  }
  if (input.busId !== null && !UUID_RE.test(input.busId ?? "")) {
    return { success: false, error: "No encontramos ese bus. Actualiza la página y vuelve a elegirlo.", campo: "bus" };
  }
  const chofer = (input.nombreChofer ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_asignar_bus", {
    p_viaje_id: input.viajeId,
    p_bus_id: input.busId,
    p_nombre_chofer: input.busId && chofer ? chofer : null,
  });
  if (error) {
    console.error("[asignarUnidad] Error:", error);
    return falloAsignar(error, input.busId ? "asignar la unidad" : "quitar la unidad");
  }
  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/despacho");
  revalidatePath("/cooperativas/taquilla/boletos");
  revalidatePath("/cooperativas/dashboard");
  return { success: true, data: data as ResultadoAsignarBus };
}

/** Buses activos de la cooperativa (para el diálogo de marcar salida cuando falta la unidad). */
export async function listarBusesActivos(): Promise<
  { success: true; data: BusParaViaje[]; error?: undefined } | { success: false; data?: undefined; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Tu sesión expiró. Inicia sesión de nuevo para continuar." };
  const { data: perfil } = await supabase.from("profiles").select("cooperativa_id").eq("id", user.id).single();
  if (!perfil?.cooperativa_id) return { success: false, error: "No encontramos tu cooperativa." };

  const { data, error } = await supabase
    .from("buses")
    .select("id, numero_unidad, placa, asientos, chofer_nombre")
    .eq("cooperativa_id", perfil.cooperativa_id)
    .eq("activo", true)
    .limit(500);
  if (error) {
    console.error("[listarBusesActivos] Error:", error);
    return { success: false, error: humanizeError(error, "cargar los buses") };
  }
  const buses = ((data ?? []) as BusParaViaje[]).sort((a, b) => ORDEN_UNIDAD.compare(a.numero_unidad, b.numero_unidad));
  return { success: true, data: buses };
}
