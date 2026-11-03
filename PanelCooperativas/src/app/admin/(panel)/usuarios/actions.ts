"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { revalidatePath } from "next/cache";
import { humanizeError } from "@/lib/errores";
import { desbloquearPinEncomienda } from "@/app/admin/(panel)/encomiendas/actions";

const MINIMO_MOTIVO = 5;

/**
 * Desbloquea el PIN de retiro con fn_desbloquear_pin (misma acción que "Buscar
 * encomienda"). El UPDATE directo no funcionaba: `encomiendas` no tiene política
 * UPDATE para el super admin.
 */
export async function desbloquearPIN(encomiendaId: string, motivo: string) {
  return desbloquearPinEncomienda(encomiendaId, motivo);
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
      console.error("Error fetching encomienda for PIN resend:", fetchError);
      return { success: false, error: humanizeError(fetchError ?? { code: "PGRST116" }, "cargar la encomienda") };
    }

    if (!e.pin_retiro) {
      return { success: false, error: "Esta encomienda todavía no tiene PIN: se genera cuando la taquilla la recibe." };
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
            titulo: "Tu PIN de retiro",
            mensaje: `Te reenviamos el PIN de retiro de la encomienda ${e.tracking_id} por WhatsApp.`,
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
      enviado: waEnviado || pushEnviado,
      message: waEnviado
        ? `Le reenviamos el PIN por WhatsApp a ${e.receiver_nombre}.`
        : "No pudimos enviar el WhatsApp. Dale el PIN por otro medio o revisa la configuración de WhatsApp."
    };
  } catch (err) {
    console.error("Error inside reenviarPIN:", err);
    return { success: false, error: humanizeError(err, "reenviar el PIN") };
  }
}

/**
 * Desactiva o reactiva a un usuario utilizando el sistema de suspensiones (ban_duration) de Supabase Auth.
 * Se usa ban_duration en lugar de deleteUser para preservar integridad referencial
 * con el historial de encomiendas, boletos y pagos del usuario.
 */
export async function toggleUsuarioEstado(userId: string, currentIsBanned: boolean, motivo?: string) {
  try {
    const superAdmin = await requireSuperAdmin();
    if (superAdmin.id === userId) {
      return { success: false, error: "No puedes suspender tu propia cuenta." };
    }
    const motivoLimpio = (motivo ?? "").trim();
    if (!currentIsBanned && motivoLimpio.length < MINIMO_MOTIVO) {
      return { success: false, error: `Escribe el motivo de la suspensión (mínimo ${MINIMO_MOTIVO} caracteres).` };
    }

    const adminSupabase = createAdminClient();

    // 100 años (876000h) para desactivar, o "none" para reactivar.
    // Consistente con el patrón toggleEmpleado del panel de cooperativas.
    const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
      ban_duration: currentIsBanned ? "none" : "876000h",
      // Queda constancia del motivo en la cuenta (app_metadata se combina con lo existente).
      app_metadata: currentIsBanned
        ? { suspension_motivo: null, suspension_at: null, suspension_por: null }
        : { suspension_motivo: motivoLimpio, suspension_at: new Date().toISOString(), suspension_por: superAdmin.id },
    });

    if (error) {
      console.error(`Error changing user ban state for ${userId}:`, error);
      return { success: false, error: humanizeError(error, currentIsBanned ? "reactivar la cuenta" : "suspender la cuenta") };
    }

    // Revalidate both list and detail pages
    revalidatePath("/admin/usuarios");
    revalidatePath(`/admin/usuarios/${userId}`);
    return { success: true };
  } catch (err) {
    console.error("Error inside toggleUsuarioEstado:", err);
    return { success: false, error: humanizeError(err, "cambiar el estado de la cuenta") };
  }
}
