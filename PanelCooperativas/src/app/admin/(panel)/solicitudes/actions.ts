"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { revalidatePath } from "next/cache";
import { sendApprovalEmail, sendRejectionEmail } from "@/lib/email";

export async function aprobarSolicitud(cooperativaId: string, comisionPorcentaje: number) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    if (comisionPorcentaje < 0 || comisionPorcentaje > 100) {
      return { success: false, error: "La comisión debe ser un número entre 0 y 100." };
    }

    // 1. Get the cooperativa details (to get the email for notification)
    const { data: cooperativa, error: fetchError } = await supabase
      .from("cooperativas")
      .select("nombre, email")
      .eq("id", cooperativaId)
      .single();

    if (fetchError || !cooperativa) {
      console.error("Error fetching cooperativa for approval:", fetchError);
      return { success: false, error: "No se encontró la cooperativa para aprobar." };
    }

    // 2. Update the status and commission
    const { error: updateError } = await supabase
      .from("cooperativas")
      .update({
        estado: "ACTIVA",
        comision_porcentaje: comisionPorcentaje,
        updated_at: new Date().toISOString()
      })
      .eq("id", cooperativaId);

    if (updateError) {
      console.error("Error updating cooperativa to ACTIVA:", updateError);
      return { success: false, error: "Error al actualizar el estado de la cooperativa." };
    }

    // 3. Send email notification if email exists
    if (cooperativa.email) {
      const emailResult = await sendApprovalEmail({
        email: cooperativa.email,
        cooperativaNombre: cooperativa.nombre,
        comisionPorcentaje
      });

      if (!emailResult.success) {
        console.warn("Failed to send approval email notification:", emailResult.error);
      }
    }

    // 4. Revalidate cache
    revalidatePath("/admin/cooperativas");
    revalidatePath("/admin/solicitudes");
    revalidatePath("/admin/dashboard");
    revalidatePath(`/admin/cooperativas/${cooperativaId}`);

    return { success: true };
  } catch (error) {
    console.error("Exception in aprobarSolicitud server action:", error);
    return { success: false, error: error instanceof Error ? error.message : "Error interno del servidor." };
  }
}

export async function rechazarSolicitud(cooperativaId: string, motivo: string) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    if (!motivo || motivo.trim().length === 0) {
      return { success: false, error: "El motivo del rechazo es requerido." };
    }

    // 1. Get the cooperativa details
    const { data: cooperativa, error: fetchError } = await supabase
      .from("cooperativas")
      .select("nombre, email")
      .eq("id", cooperativaId)
      .single();

    if (fetchError || !cooperativa) {
      console.error("Error fetching cooperativa for rejection:", fetchError);
      return { success: false, error: "No se encontró la cooperativa." };
    }

    // 2. Update status to DESACTIVADA (rejected/disabled)
    const { error: updateError } = await supabase
      .from("cooperativas")
      .update({
        estado: "DESACTIVADA",
        updated_at: new Date().toISOString()
      })
      .eq("id", cooperativaId);

    if (updateError) {
      console.error("Error updating cooperativa to DESACTIVADA:", updateError);
      return { success: false, error: "Error al registrar el rechazo de la solicitud." };
    }

    // 3. Send email notification if email exists
    if (cooperativa.email) {
      const emailResult = await sendRejectionEmail({
        email: cooperativa.email,
        cooperativaNombre: cooperativa.nombre,
        motivo
      });

      if (!emailResult.success) {
        console.warn("Failed to send rejection email notification:", emailResult.error);
      }
    }

    // 4. Revalidate cache
    revalidatePath("/admin/cooperativas");
    revalidatePath("/admin/solicitudes");
    revalidatePath("/admin/dashboard");
    revalidatePath(`/admin/cooperativas/${cooperativaId}`);

    return { success: true };
  } catch (error) {
    console.error("Exception in rechazarSolicitud server action:", error);
    return { success: false, error: error instanceof Error ? error.message : "Error interno del servidor." };
  }
}
