"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireSuperAdmin, esUuid } from "@/lib/data/admin-auth";
import { revalidatePath } from "next/cache";
import { humanizeError } from "@/lib/errores";
import { desbloquearPinEncomienda } from "@/app/admin/(panel)/encomiendas/actions";

const MINIMO_MOTIVO = 5;
/** Encomiendas cerradas: no se reenvía el PIN. */
const ESTADOS_CERRADOS = ["ENTREGADA", "CANCELADA", "DEVUELTA"];
/** Reenvíos de PIN permitidos por encomienda en la ventana. */
const MAX_REENVIOS_PIN = 3;
const VENTANA_REENVIOS_PIN = 15 * 60;

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
    if (!esUuid(encomiendaId)) {
      return { success: false, error: "No encontramos la encomienda. Actualiza la página e intenta de nuevo." };
    }
    // Use admin client for Edge Function invocations from server-side admin actions
    const adminSupabase = createAdminClient();
    const supabase = await createClient();

    // 1. Obtener la encomienda y los datos necesarios
    const { data: e, error: fetchError } = await supabase
      .from("encomiendas")
      .select("id, tracking_id, estado, pin_retiro, receiver_nombre, receiver_telefono, receiver_user_id")
      .eq("id", encomiendaId)
      .maybeSingle();

    if (fetchError || !e) {
      console.error("Error fetching encomienda for PIN resend:", fetchError);
      return { success: false, error: humanizeError(fetchError ?? { code: "PGRST116" }, "cargar la encomienda") };
    }

    if (ESTADOS_CERRADOS.includes(e.estado)) {
      return { success: false, error: "Esta encomienda ya está cerrada: no hace falta reenviar el PIN." };
    }
    if (!e.pin_retiro) {
      return { success: false, error: "Esta encomienda todavía no tiene PIN: se genera cuando la taquilla la recibe." };
    }

    // Límite de reenvíos por encomienda (doble clic, varios admins o un abuso):
    // cada reenvío es un WhatsApp pagado y un mensaje más al destinatario.
    const { data: limite, error: limiteError } = await adminSupabase.rpc("fn_consumir_limite", {
      p_clave: `reenviar_pin:${e.id}`,
      p_maximo: MAX_REENVIOS_PIN,
      p_ventana_segundos: VENTANA_REENVIOS_PIN,
    });
    if (limiteError) {
      // Sin la RPC (o con un fallo técnico) no se bloquea el reenvío; queda en el log.
      console.warn("[reenviarPIN] No se pudo consultar el límite de reenvíos:", limiteError);
    } else if ((limite as { permitido?: boolean } | null)?.permitido === false) {
      const segundos = Number((limite as { reintentar_en_segundos?: number }).reintentar_en_segundos ?? 0);
      const minutos = Math.max(1, Math.ceil(segundos / 60));
      return {
        success: false,
        error: `Ya reenviamos este PIN ${MAX_REENVIOS_PIN} veces hace poco. Espera ${minutos} ${minutos === 1 ? "minuto" : "minutos"} o dáselo por otro medio.`,
      };
    }

    // 2. Invocar Edge Function de WhatsApp — el PIN completo se envía aquí
    let waEnviado = false;
    // Canales que fallaron: se avisan en el toast en vez de dar el envío por bueno (AD-21).
    const fallidos: string[] = [];
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
        fallidos.push("WhatsApp");
      } else {
        waEnviado = waData?.enviado || false;
        if (!waEnviado) fallidos.push("WhatsApp");
      }
    } catch (e1) {
      console.error("Failed to invoke enviar-whatsapp Edge Function:", e1);
      fallidos.push("WhatsApp");
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
          fallidos.push("la notificación de la app");
        } else {
          pushEnviado = pushData?.enviado || false;
        }
      } catch (e2) {
        console.error("Failed to invoke enviar-push Edge Function:", e2);
        fallidos.push("la notificación de la app");
      }
    }

    revalidatePath("/admin/usuarios");
    return { 
      success: true, 
      enviado: waEnviado || pushEnviado,
      fallidos,
      message: waEnviado
        ? fallidos.length > 0
          ? `Le reenviamos el PIN por WhatsApp a ${e.receiver_nombre}, pero no pudimos enviar ${fallidos.join(" ni ")}.`
          : `Le reenviamos el PIN por WhatsApp a ${e.receiver_nombre}.`
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
    if (!esUuid(userId)) {
      return { success: false, error: "No encontramos la cuenta. Actualiza la página." };
    }
    if (superAdmin.id === userId) {
      return { success: false, error: "No puedes suspender tu propia cuenta." };
    }
    const motivoLimpio = String(motivo ?? "").trim().slice(0, 500);
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

/**
 * Completa la baja de una cuenta que la persona eliminó desde la app (Google Play):
 * borra su identidad de Auth (borrado suave, `deleteUser(id, true)`) y marca
 * `bajas_cuenta.auth_eliminada_at`. Lo hace la edge function `eliminar-cuenta`;
 * esto es el respaldo cuando no está desplegada o falló.
 */
export async function completarBajaCuenta(usuarioId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: "Solo el equipo de EnBus puede completar bajas de cuenta." };
  }
  if (!esUuid(usuarioId)) return { success: false, error: "No encontramos la cuenta. Actualiza la página." };

  try {
    const adminSupabase = createAdminClient();

    const [{ data: perfil, error: perfilError }, { data: baja, error: bajaError }] = await Promise.all([
      adminSupabase.from("profiles").select("id, eliminada_at").eq("id", usuarioId).maybeSingle(),
      adminSupabase.from("bajas_cuenta").select("id, auth_eliminada_at").eq("usuario_id", usuarioId).maybeSingle(),
    ]);
    if (perfilError || bajaError) {
      console.error("Error loading account deletion:", perfilError ?? bajaError);
      return { success: false, error: humanizeError(perfilError ?? bajaError, "cargar la baja de la cuenta") };
    }
    if (!perfil?.eliminada_at || !baja) {
      return {
        success: false,
        error: "Esta cuenta no pidió su baja desde la app. Para cerrarle el acceso, suspéndela.",
      };
    }
    if (baja.auth_eliminada_at) {
      revalidatePath("/admin/usuarios");
      return { success: true };
    }

    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(usuarioId, true);
    // Si la identidad ya no existe (la borró la edge function a medias), solo falta marcarla.
    const yaNoExiste = deleteError && (deleteError.status === 404 || /not.?found/i.test(deleteError.message ?? ""));
    if (deleteError && !yaNoExiste) {
      console.error("Error deleting auth user:", deleteError);
      return { success: false, error: humanizeError(deleteError, "borrar el acceso de la cuenta") };
    }

    const { error: updateError } = await adminSupabase
      .from("bajas_cuenta")
      .update({ auth_eliminada_at: new Date().toISOString() })
      .eq("usuario_id", usuarioId)
      .is("auth_eliminada_at", null);
    if (updateError) {
      console.error("Error marking account deletion:", updateError);
      return {
        success: false,
        error: "Borramos el acceso, pero no pudimos marcar la baja como completada. Intenta de nuevo.",
      };
    }

    revalidatePath("/admin/usuarios");
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { success: true };
  } catch (err) {
    console.error("Error inside completarBajaCuenta:", err);
    return { success: false, error: humanizeError(err, "completar la baja de la cuenta") };
  }
}
