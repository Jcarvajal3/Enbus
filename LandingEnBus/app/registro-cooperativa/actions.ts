"use server";

// El registro de cooperativas se hace en el panel (`{cooperativasUrl}/cooperativas/registro`).
// La landing ya no crea cooperativas: solo conserva el reenvío de la invitación para
// las solicitudes antiguas que se hicieron desde aquí. Límites atómicos con fn_consumir_limite
// (migración 20260721000003): 1 cada 5 min por RIF y 5 por hora por IP (hash, nunca la IP).

import { obtenerSupabaseAdmin } from "@/lib/supabase";
import { sendInvitationEmail } from "@/lib/email";
import { consumirLimite, consumirLimitePorIp, minutosTexto, textoEntrada } from "@/lib/limites";
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
  /** Código del error, si lo hay (EB_DEMASIADOS_INTENTOS: se alcanzó un límite de frecuencia). */
  codigo?: "EB_DEMASIADOS_INTENTOS";
  /** Con EB_DEMASIADOS_INTENTOS: segundos que faltan para poder intentarlo de nuevo. */
  reintentarEnSegundos?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Largo máximo de una dirección de correo (RFC 5321). */
const EMAIL_MAX = 254;
const INVITACION_DIAS = 7;
const ESPERA_MINUTOS = 5;
const MAX_POR_IP_HORA = 5;

const NO_DISPONIBLE = "El reenvío no está disponible en este momento. Escríbenos por WhatsApp.";

function demasiadosIntentos(segundos: number, porRif: boolean): ReenvioState {
  return {
    success: false,
    codigo: "EB_DEMASIADOS_INTENTOS",
    reintentarEnSegundos: segundos,
    error: porRif
      ? `Ya enviamos un correo hace poco. Revisa tu bandeja de entrada y la carpeta de spam. Intenta de nuevo en ${minutosTexto(segundos)}.`
      : `Hiciste varios intentos seguidos. Intenta de nuevo en ${minutosTexto(segundos)}.`,
  };
}

/**
 * Reenvía la invitación de una solicitud pendiente hecha desde la landing. Exige el mismo
 * RIF y correo con que se registró, crea una invitación nueva y, enviado el correo, revoca
 * (`revocada_at`) las anteriores sin usar: solo el último enlace sirve.
 */
export async function reenviarInvitacion(rifInput: unknown, emailInput: unknown): Promise<ReenvioState> {
  // Acción pública: el cliente puede mandar cualquier valor, no solo cadenas.
  const rifTexto = textoEntrada(rifInput, 40);
  const rif = normalizeRif(rifTexto);
  const email = textoEntrada(emailInput, EMAIL_MAX + 1);

  const fieldErrors: Partial<Record<CampoReenvio, string>> = {};
  if (!rifTexto) fieldErrors.rif = "Escribe el RIF de la cooperativa.";
  else if (!rif) fieldErrors.rif = RIF_ERROR;
  if (!email) fieldErrors.email = "Escribe el correo con el que hiciste la solicitud.";
  else if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) fieldErrors.email = "El correo no es válido. Revisa que esté bien escrito (por ejemplo, nombre@correo.com).";
  if (Object.keys(fieldErrors).length > 0 || !rif) {
    return { success: false, error: "Revisa los campos marcados.", fieldErrors };
  }

  const supabase = obtenerSupabaseAdmin();
  const panel = cooperativasUrl();
  if (!supabase || !panel) {
    return { success: false, error: NO_DISPONIBLE };
  }

  try {
    // Por IP antes de consultar nada: frena a quien prueba RIF y correos al azar.
    const porIp = await consumirLimitePorIp(supabase, "invitacion-ip", MAX_POR_IP_HORA, 3600);
    if (!porIp.permitido) return demasiadosIntentos(porIp.reintentarEnSegundos, false);

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
    // Las cooperativas registradas desde el panel crean la cuenta del administrador sin
    // invitación: si ya hay un administrador, no se manda un enlace para crear otro.
    const { data: admin, error: adminError } = await supabase
      .from("profiles")
      .select("id")
      .eq("cooperativa_id", cooperativa.id)
      .eq("role", "admin_cooperativa")
      .is("eliminada_at", null)
      .limit(1)
      .maybeSingle();
    if (adminError) {
      console.error("Error reading cooperativa admin for resend:", adminError);
      return { success: false, error: "No pudimos reenviar la invitación. Intenta de nuevo en unos minutos." };
    }

    if (yaUsada || admin) {
      return {
        success: false,
        cuentaCreada: true,
        error: "Tu cooperativa ya tiene una cuenta de administrador. Inicia sesión en el panel.",
      };
    }

    // Por RIF: un correo cada 5 minutos (atómico). Sin la RPC, se mira la última invitación.
    const porRif = await consumirLimite(supabase, `invitacion:${rif}`, 1, ESPERA_MINUTOS * 60);
    if (!porRif.permitido) return demasiadosIntentos(porRif.reintentarEnSegundos, true);
    if ("sinRpc" in porRif) {
      const ultima = invitaciones?.[0]?.created_at ? new Date(invitaciones[0].created_at).getTime() : 0;
      const restanteMs = ultima + ESPERA_MINUTOS * 60_000 - Date.now();
      if (restanteMs > 0) return demasiadosIntentos(Math.ceil(restanteMs / 1000), true);
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
      .select("id, token")
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

    // Solo vale el último enlace: se revocan las invitaciones de administrador anteriores sin usar.
    // Después del envío, para no dejar a nadie sin un enlace válido si el correo falla.
    const { error: revocarError } = await supabase
      .from("invitaciones")
      .update({ revocada_at: new Date().toISOString() })
      .eq("cooperativa_id", cooperativa.id)
      .eq("role", "admin_cooperativa")
      .eq("usado", false)
      .is("revocada_at", null)
      .neq("id", invitacion.id);
    if (revocarError) {
      // 42703: la columna revocada_at no existe (migración 20260720000002 sin aplicar). El correo ya salió.
      console.warn("reenviarInvitacion: no se pudieron revocar las invitaciones anteriores:", revocarError);
    }

    return { success: true, emailEnviado: true };
  } catch (error) {
    console.error("Exception in reenviarInvitacion server action:", error);
    return { success: false, error: "Ocurrió un error inesperado al reenviar la invitación. Intenta de nuevo." };
  }
}
