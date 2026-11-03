"use server";

// El registro de cooperativas se hace en el panel (`{cooperativasUrl}/cooperativas/registro`).
// La landing ya no crea cooperativas: solo conserva el reenvío de la invitación para
// las solicitudes antiguas que se hicieron desde aquí (límite: una por RIF cada 5 minutos).

import { obtenerSupabaseAdmin } from "@/lib/supabase";
import { sendInvitationEmail } from "@/lib/email";
import { normalizeRif, RIF_ERROR } from "@/lib/rif";
import { cooperativasUrl } from "@/lib/urls";

export type CampoReenvio = "rif" | "email";

export interface ReenvioState {
  success: boolean;
  emailEnviado?: boolean;
  error?: string;
  /** Errores por campo, para mostrarlos junto a cada input. */
  fieldErrors?: Partial<Record<CampoReenvio, string>>;
  /** true si la invitación ya se usó: la cuenta existe y basta con iniciar sesión. */
  cuentaCreada?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITACION_DIAS = 7;
const ESPERA_MINUTOS = 5;

const NO_DISPONIBLE = "El reenvío no está disponible en este momento. Escríbenos por WhatsApp.";

/**
 * Reenvía la invitación de una solicitud pendiente hecha desde la landing. Exige el mismo
 * RIF y correo con que se registró y crea una invitación nueva (así `created_at` marca el
 * último envío y el límite de 5 minutos por RIF se cumple).
 */
export async function reenviarInvitacion(rifInput: string, emailInput: string): Promise<ReenvioState> {
  const rif = normalizeRif(rifInput);
  const email = (emailInput ?? "").trim();

  const fieldErrors: Partial<Record<CampoReenvio, string>> = {};
  if (!(rifInput ?? "").trim()) fieldErrors.rif = "Escribe el RIF de la cooperativa.";
  else if (!rif) fieldErrors.rif = RIF_ERROR;
  if (!email) fieldErrors.email = "Escribe el correo con el que hiciste la solicitud.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "El correo no es válido. Revisa que esté bien escrito (por ejemplo, nombre@correo.com).";
  if (Object.keys(fieldErrors).length > 0 || !rif) {
    return { success: false, error: "Revisa los campos marcados.", fieldErrors };
  }

  const supabase = obtenerSupabaseAdmin();
  const panel = cooperativasUrl();
  if (!supabase || !panel) {
    return { success: false, error: NO_DISPONIBLE };
  }

  try {
    const { data: cooperativa, error: fetchError } = await supabase
      .from("cooperativas")
      .select("id, nombre, estado, email")
      .eq("rif", rif)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching cooperativa for resend:", fetchError);
      return { success: false, error: "No pudimos reenviar la invitación. Intenta de nuevo en unos minutos." };
    }

    if (
      !cooperativa ||
      cooperativa.estado !== "PENDIENTE" ||
      (cooperativa.email ?? "").toLowerCase() !== email.toLowerCase()
    ) {
      return {
        success: false,
        error: "No encontramos una solicitud pendiente con ese RIF y correo. Revisa los datos o escríbenos.",
      };
    }

    // Últimas invitaciones de esta cooperativa: límite por tiempo y cuenta ya creada.
    const { data: invitaciones, error: invitacionesError } = await supabase
      .from("invitaciones")
      .select("created_at, usado, email, role")
      .eq("cooperativa_id", cooperativa.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (invitacionesError) {
      console.error("Error reading invitaciones for resend:", invitacionesError);
      return { success: false, error: "No pudimos reenviar la invitación. Intenta de nuevo en unos minutos." };
    }

    const yaUsada = (invitaciones ?? []).some(
      (i) => i.usado && i.role === "admin_cooperativa" && String(i.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (yaUsada) {
      return {
        success: false,
        cuentaCreada: true,
        error: "Ya creaste la cuenta de administrador con esta invitación. Inicia sesión en el panel.",
      };
    }

    const ultima = invitaciones?.[0]?.created_at ? new Date(invitaciones[0].created_at).getTime() : 0;
    const restanteMs = ultima + ESPERA_MINUTOS * 60_000 - Date.now();
    if (restanteMs > 0) {
      const minutos = Math.max(1, Math.ceil(restanteMs / 60_000));
      return {
        success: false,
        error: `Ya te enviamos una invitación hace poco. Revisa tu correo (también la carpeta de spam) y, si no llegó, pide otra en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`,
      };
    }

    const { data: superAdmin, error: superAdminError } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();

    if (superAdminError || !superAdmin) {
      console.error("Error finding super admin for invitation:", superAdminError);
      return { success: false, error: "No pudimos reenviar la invitación. Intenta de nuevo más tarde." };
    }

    const destino = cooperativa.email ?? email;
    const { data: invitacion, error: inviteError } = await supabase
      .from("invitaciones")
      .insert({
        email: destino,
        role: "admin_cooperativa",
        cooperativa_id: cooperativa.id,
        creado_por: superAdmin.id,
        expira_at: new Date(Date.now() + INVITACION_DIAS * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("token")
      .single();

    if (inviteError || !invitacion?.token) {
      console.error("Error creating invitation:", inviteError);
      return { success: false, error: "No pudimos generar la invitación. Intenta de nuevo en unos minutos." };
    }

    const resultado = await sendInvitationEmail({
      email: destino,
      cooperativaNombre: cooperativa.nombre,
      inviteLink: `${panel}/cooperativas/invite/${invitacion.token}`,
    });

    if (!resultado.success) {
      console.warn("Invitation email was not sent:", resultado.error);
      return {
        success: false,
        emailEnviado: false,
        error: `No pudimos enviar el correo esta vez. Intenta de nuevo en ${ESPERA_MINUTOS} minutos o escríbenos por WhatsApp.`,
      };
    }

    return { success: true, emailEnviado: true };
  } catch (error) {
    console.error("Exception in reenviarInvitacion server action:", error);
    return { success: false, error: "Ocurrió un error inesperado al reenviar la invitación. Intenta de nuevo." };
  }
}
