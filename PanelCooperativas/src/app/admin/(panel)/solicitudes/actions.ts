"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin, esUuid } from "@/lib/data/admin-auth";
import { revalidatePath } from "next/cache";
import { sendApprovalEmail, sendRejectionEmail } from "@/lib/email";
import { humanizeError } from "@/lib/errores";
import type { EstadoCooperativa } from "@/lib/types/admin-cooperativas";

interface ResultadoSolicitud {
  success: boolean;
  error?: string;
  /** true solo si el correo de notificación salió; false si falló o la cooperativa no tiene correo. */
  emailEnviado?: boolean;
  email?: string | null;
}

const MINIMO_MOTIVO = 5;
const SOLICITUD_YA_RESUELTA = "Esta solicitud ya no está en revisión: otra persona la resolvió. Actualiza la página.";
const NO_ENCONTRADA = "No encontramos la solicitud. Actualiza la página e intenta de nuevo.";

/** fn_cambiar_estado_cooperativa devuelve ya_procesado si la cooperativa ya estaba en ese estado. */
function yaProcesado(data: unknown): boolean {
  return Boolean((data as { ya_procesado?: boolean } | null)?.ya_procesado);
}

function revalidarSolicitudes(cooperativaId: string) {
  revalidatePath("/admin/cooperativas");
  revalidatePath("/admin/solicitudes");
  revalidatePath("/admin/dashboard");
  revalidatePath(`/admin/cooperativas/${cooperativaId}`);
}

/** RPC sin aplicar (migraciones 20260720* pendientes). */
function rpcNoDisponible(err: { code?: string } | null): boolean {
  return err?.code === "PGRST202" || err?.code === "42883";
}

/**
 * Cambia el estado con fn_cambiar_estado_cooperativa (super admin): valida la
 * transición, exige motivo para RECHAZADA/SUSPENDIDA/DESACTIVADA y guarda
 * motivo_estado, estado_cambiado_at y estado_cambiado_por.
 */
async function cambiarEstado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cooperativaId: string,
  estado: EstadoCooperativa,
  motivo?: string | null
) {
  return supabase.rpc("fn_cambiar_estado_cooperativa", {
    p_cooperativa_id: cooperativaId,
    p_estado: estado,
    p_motivo: motivo?.trim() || null,
  });
}

export async function aprobarSolicitud(cooperativaId: string, comisionPorcentaje: number): Promise<ResultadoSolicitud> {
  try {
    await requireSuperAdmin();
    if (!esUuid(cooperativaId)) return { success: false, error: NO_ENCONTRADA };
    const supabase = await createClient();

    comisionPorcentaje = Number(comisionPorcentaje);
    if (!Number.isFinite(comisionPorcentaje) || comisionPorcentaje < 0 || comisionPorcentaje > 100) {
      return { success: false, error: "La comisión debe ser un número entre 0 y 100." };
    }

    const { data: cooperativa, error: fetchError } = await supabase
      .from("cooperativas")
      .select("nombre, email, estado")
      .eq("id", cooperativaId)
      .maybeSingle();

    if (fetchError || !cooperativa) {
      console.error("[aprobarSolicitud] cooperativa:", fetchError);
      return { success: false, error: fetchError ? humanizeError(fetchError, "cargar la solicitud") : NO_ENCONTRADA };
    }
    // Otra pestaña u otro admin ya la resolvió: no se toca la comisión ni se repite el correo.
    if (cooperativa.estado !== "PENDIENTE") {
      return { success: false, error: SOLICITUD_YA_RESUELTA };
    }

    // 1. Estado primero: la RPC bloquea la fila (FOR UPDATE) y, si dos admins aprueban a
    // la vez, al segundo le responde ya_procesado. Así solo quien aprobó de verdad
    // guarda su comisión y envía el correo (antes los dos escribían la comisión y los
    // dos mandaban el correo, cada uno con su porcentaje).
    const { data: estadoData, error: estadoError } = await cambiarEstado(supabase, cooperativaId, "ACTIVA");
    if (estadoError) {
      if (!rpcNoDisponible(estadoError)) {
        console.error("[aprobarSolicitud] estado:", estadoError);
        return { success: false, error: humanizeError(estadoError, "aprobar la solicitud") };
      }
      // Base sin la migración de la fase 3: activación directa y condicional.
      const { data: activadas, error: directoError } = await supabase
        .from("cooperativas")
        .update({ estado: "ACTIVA", updated_at: new Date().toISOString() })
        .eq("id", cooperativaId)
        .eq("estado", "PENDIENTE")
        .select("id");
      if (directoError) {
        console.error("[aprobarSolicitud] estado directo:", directoError);
        return { success: false, error: humanizeError(directoError, "aprobar la solicitud") };
      }
      if (!activadas || activadas.length === 0) return { success: false, error: SOLICITUD_YA_RESUELTA };
    } else if (yaProcesado(estadoData)) {
      return { success: false, error: SOLICITUD_YA_RESUELTA };
    }

    // 2. Comisión acordada (los ciclos se calculan con el porcentaje vigente al generarlos).
    const { error: comisionError } = await supabase
      .from("cooperativas")
      .update({ comision_porcentaje: comisionPorcentaje, updated_at: new Date().toISOString() })
      .eq("id", cooperativaId);
    if (comisionError) {
      console.error("[aprobarSolicitud] comisión:", comisionError);
      revalidarSolicitudes(cooperativaId);
      return {
        success: false,
        error: "Aprobamos la cooperativa, pero no pudimos guardar la comisión. Corrígela desde «Editar datos» antes de generar ciclos.",
      };
    }

    // 3. Correo: emailEnviado = false si no hay correo o si el envío falló (la UI avisa al admin).
    let emailEnviado = false;
    if (cooperativa.email) {
      const emailResult = await sendApprovalEmail({
        email: cooperativa.email,
        cooperativaNombre: cooperativa.nombre,
        comisionPorcentaje,
      });
      emailEnviado = emailResult.success;
    }

    revalidarSolicitudes(cooperativaId);
    return { success: true, emailEnviado, email: cooperativa.email as string | null };
  } catch (error) {
    console.error("[aprobarSolicitud]", error);
    return { success: false, error: humanizeError(error, "aprobar la solicitud") };
  }
}

/** Rechazo reversible: RECHAZADA con motivo; la cooperativa corrige y pide una nueva revisión. */
export async function rechazarSolicitud(cooperativaId: string, motivo: string): Promise<ResultadoSolicitud> {
  try {
    await requireSuperAdmin();
    if (!esUuid(cooperativaId)) return { success: false, error: NO_ENCONTRADA };
    const supabase = await createClient();

    const motivoLimpio = String(motivo ?? "").trim().slice(0, 500);
    if (motivoLimpio.length < MINIMO_MOTIVO) {
      return { success: false, error: `Escribe el motivo del rechazo (mínimo ${MINIMO_MOTIVO} caracteres).` };
    }

    const { data: cooperativa, error: fetchError } = await supabase
      .from("cooperativas")
      .select("nombre, email, estado")
      .eq("id", cooperativaId)
      .maybeSingle();

    if (fetchError || !cooperativa) {
      console.error("[rechazarSolicitud] cooperativa:", fetchError);
      return { success: false, error: fetchError ? humanizeError(fetchError, "cargar la solicitud") : NO_ENCONTRADA };
    }
    if (cooperativa.estado !== "PENDIENTE") {
      return { success: false, error: SOLICITUD_YA_RESUELTA };
    }

    const { data: estadoData, error: estadoError } = await cambiarEstado(supabase, cooperativaId, "RECHAZADA", motivoLimpio);
    if (estadoError) {
      console.error("[rechazarSolicitud] estado:", estadoError);
      return { success: false, error: humanizeError(estadoError, "rechazar la solicitud") };
    }
    // Otro admin la rechazó al mismo tiempo: no se repite el correo.
    if (yaProcesado(estadoData)) return { success: false, error: SOLICITUD_YA_RESUELTA };

    let emailEnviado = false;
    if (cooperativa.email) {
      const emailResult = await sendRejectionEmail({
        email: cooperativa.email,
        cooperativaNombre: cooperativa.nombre,
        motivo: motivoLimpio,
      });
      emailEnviado = emailResult.success;
    }

    revalidarSolicitudes(cooperativaId);
    return { success: true, emailEnviado, email: cooperativa.email as string | null };
  } catch (error) {
    console.error("[rechazarSolicitud]", error);
    return { success: false, error: humanizeError(error, "rechazar la solicitud") };
  }
}

/** RECHAZADA → PENDIENTE: la solicitud vuelve a "En revisión". */
export async function reabrirSolicitud(cooperativaId: string): Promise<ResultadoSolicitud> {
  try {
    await requireSuperAdmin();
    if (!esUuid(cooperativaId)) return { success: false, error: NO_ENCONTRADA };
    const supabase = await createClient();
    const { error } = await cambiarEstado(supabase, cooperativaId, "PENDIENTE");
    if (error) {
      console.error("[reabrirSolicitud]", error);
      return { success: false, error: humanizeError(error, "reabrir la solicitud") };
    }
    revalidarSolicitudes(cooperativaId);
    return { success: true };
  } catch (error) {
    console.error("[reabrirSolicitud]", error);
    return { success: false, error: humanizeError(error, "reabrir la solicitud") };
  }
}

/** Descarta la solicitud para siempre (→ DESACTIVADA, con motivo). No se puede deshacer. */
export async function descartarSolicitud(cooperativaId: string, motivo: string): Promise<ResultadoSolicitud> {
  try {
    await requireSuperAdmin();
    if (!esUuid(cooperativaId)) return { success: false, error: NO_ENCONTRADA };
    const motivoLimpio = String(motivo ?? "").trim().slice(0, 500);
    if (motivoLimpio.length < MINIMO_MOTIVO) {
      return { success: false, error: `Escribe el motivo (mínimo ${MINIMO_MOTIVO} caracteres).` };
    }
    const supabase = await createClient();
    const { error } = await cambiarEstado(supabase, cooperativaId, "DESACTIVADA", motivoLimpio);
    if (error) {
      console.error("[descartarSolicitud]", error);
      return { success: false, error: humanizeError(error, "descartar la solicitud") };
    }
    revalidarSolicitudes(cooperativaId);
    return { success: true };
  } catch (error) {
    console.error("[descartarSolicitud]", error);
    return { success: false, error: humanizeError(error, "descartar la solicitud") };
  }
}
