"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { revalidatePath } from "next/cache";

/**
 * Desbloquea el PIN de retiro de una encomienda reseteando intentos_pin y pin_bloqueado.
 * Solo aplica a encomiendas en estados activos (no terminales).
 */
export async function desbloquearPIN(encomiendaId: string) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    // Validate encomienda exists and is in an active (non-terminal) state
    const { data: enc, error: fetchError } = await supabase
      .from("encomiendas")
      .select("id, estado, pin_bloqueado")
      .eq("id", encomiendaId)
      .not("estado", "in", "(ENTREGADA,CANCELADA,DEVUELTA)")
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching encomienda for PIN unlock:", fetchError);
      return { success: false, error: fetchError.message };
    }

    if (!enc) {
      return { success: false, error: "Encomienda no encontrada o ya se encuentra en un estado terminal." };
    }

    const { error } = await supabase
      .from("encomiendas")
      .update({
        intentos_pin: 0,
        pin_bloqueado: false
      })
      .eq("id", encomiendaId);

    if (error) {
      console.error("Error unlocking PIN:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/admin/usuarios");
    return { success: true };
  } catch (err) {
    console.error("Error inside desbloquearPIN:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reenvía el PIN de retiro original de la encomienda al destinatario a través de WhatsApp y/o Push.
 * El PIN nunca se regenera — se reenvía el existente.
 * SEGURIDAD: El mensaje Push no incluye el PIN en texto claro para evitar que persista
 * en la tabla notificaciones_usuario. El PIN real sólo se envía por WhatsApp.
 */
export async function reenviarPIN(encomiendaId: string) {
  try {
    await requireSuperAdmin();
    // Use admin client for Edge Function invocations from server-side admin actions
    const adminSupabase = createAdminClient();
    const supabase = await createClient();

    // 1. Obtener la encomienda y los datos necesarios
    const { data: e, error: fetchError } = await supabase
      .from("encomiendas")
      .select("id, tracking_id, pin_retiro, receiver_nombre, receiver_telefono, receiver_user_id")
      .eq("id", encomiendaId)
      .single();

    if (fetchError || !e) {
      return { success: false, error: "Encomienda no encontrada." };
    }

    if (!e.pin_retiro) {
      return { success: false, error: "Esta encomienda no tiene un PIN de retiro generado aún." };
    }

    // 2. Invocar Edge Function de WhatsApp — el PIN completo se envía aquí
    let waEnviado = false;
    try {
      const { data: waData, error: waError } = await adminSupabase.functions.invoke("enviar-whatsapp", {
        body: {
          telefono: e.receiver_telefono,
          template_id: "pin_retiro_encomienda",
          variables: {
            tracking_id: e.tracking_id,
            pin_retiro: e.pin_retiro,
            receiver_nombre: e.receiver_nombre,
          },
          user_id: e.receiver_user_id || null,
          recurso_tipo: "encomienda",
          recurso_id: e.id,
        }
      });
      if (waError) {
        console.error("Error invoking enviar-whatsapp Edge Function:", waError);
      } else {
        waEnviado = waData?.enviado || false;
      }
    } catch (e1) {
      console.error("Failed to invoke enviar-whatsapp Edge Function:", e1);
    }

    // 3. Invocar Edge Function de Push si el destinatario está registrado.
    // NOTA DE SEGURIDAD: El mensaje Push NO incluye el PIN en texto claro porque la
    // notificación se persiste en la tabla notificaciones_usuario. El PIN real ya fue
    // enviado por WhatsApp. El push sólo notifica que deben revisar su WhatsApp.
    let pushEnviado = false;
    if (e.receiver_user_id) {
      try {
        const { data: pushData, error: pushError } = await adminSupabase.functions.invoke("enviar-push", {
          body: {
            user_id: e.receiver_user_id,
            titulo: "PIN de Retiro Disponible",
            mensaje: `Tu encomienda ${e.tracking_id} tiene un PIN de retiro disponible. Revisa tu WhatsApp para obtenerlo.`,
            recurso_tipo: "encomienda",
            recurso_id: e.id,
          }
        });
        if (pushError) {
          console.error("Error invoking enviar-push Edge Function:", pushError);
        } else {
          pushEnviado = pushData?.enviado || false;
        }
      } catch (e2) {
        console.error("Failed to invoke enviar-push Edge Function:", e2);
      }
    }

    revalidatePath("/admin/usuarios");
    return { 
      success: true, 
      message: `PIN reenviado. WhatsApp: ${waEnviado ? 'Enviado' : 'Fallido/Simulado'}. Push: ${e.receiver_user_id ? (pushEnviado ? 'Enviado' : 'Fallido') : 'N/A'}` 
    };
  } catch (err) {
    console.error("Error inside reenviarPIN:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Desactiva o reactiva a un usuario utilizando el sistema de suspensiones (ban_duration) de Supabase Auth.
 * Se usa ban_duration en lugar de deleteUser para preservar integridad referencial
 * con el historial de encomiendas, boletos y pagos del usuario.
 */
export async function toggleUsuarioEstado(userId: string, currentIsBanned: boolean) {
  try {
    const superAdmin = await requireSuperAdmin();
    if (superAdmin.id === userId) {
      return { success: false, error: "No puedes suspender tu propia cuenta de administrador." };
    }

    const adminSupabase = createAdminClient();

    // 100 años (876000h) para desactivar, o "none" para reactivar.
    // Consistente con el patrón toggleEmpleado del panel de cooperativas.
    const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
      ban_duration: currentIsBanned ? "none" : "876000h",
    });

    if (error) {
      console.error(`Error changing user ban state for ${userId}:`, error);
      return { success: false, error: error.message };
    }

    // Revalidate both list and detail pages
    revalidatePath("/admin/usuarios");
    revalidatePath(`/admin/usuarios/${userId}`);
    return { success: true };
  } catch (err) {
    console.error("Error inside toggleUsuarioEstado:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
