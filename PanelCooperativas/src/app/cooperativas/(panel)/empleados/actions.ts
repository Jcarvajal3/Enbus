"use server";

// ─── Empleados e invitaciones (#40) ─────────────────────────────────────────
// La tabla `invitaciones` no tiene política UPDATE: reenviar y revocar se hacen
// con el cliente de servicio, después de comprobar que la invitación es de la
// cooperativa del administrador.

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { humanizeError } from "@/lib/errores";

export type RolInvitacion = "taquillero" | "admin_cooperativa";

export type ResultadoInvitacion =
  | { success: true; token: string; expiraAt: string; existente?: boolean; error?: undefined; campo?: undefined }
  | { success?: undefined; token?: undefined; expiraAt?: undefined; existente?: undefined; error: string; campo?: "email" | "sucursal" | "rol" };

const VIGENCIA_MS = 48 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_SESION = "Tu sesión expiró. Inicia sesión de nuevo para continuar.";
const MSG_SOLO_ADMIN = "Solo el administrador de la cooperativa puede gestionar los empleados.";
const MSG_INVITACION_NO_ENCONTRADA = "No encontramos esa invitación en tu cooperativa. Actualiza la página.";

/** Perfil del administrador que hace la acción, o el error para mostrar. */
async function adminActual(): Promise<
  { ok: true; userId: string; cooperativaId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: MSG_SESION };
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("cooperativa_id, role")
    .eq("id", user.id)
    .single();
  if (error) {
    console.error("[empleados] Error al leer el perfil:", error);
    return { ok: false, error: humanizeError(error, "verificar tu cuenta") };
  }
  if (!profile || profile.role !== "admin_cooperativa" || !profile.cooperativa_id) {
    return { ok: false, error: MSG_SOLO_ADMIN };
  }
  return { ok: true, userId: user.id, cooperativaId: profile.cooperativa_id as string };
}

/** Escapa los comodines de ILIKE para comparar el correo sin distinguir mayúsculas. */
function correoExacto(email: string) {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function invitarEmpleado(formData: FormData): Promise<ResultadoInvitacion> {
  const admin = await adminActual();
  if (!admin.ok) return { error: admin.error };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const sucursalId = String(formData.get("sucursalId") ?? "");
  const rolTexto = String(formData.get("rol") ?? "taquillero");
  const rol: RolInvitacion | null =
    rolTexto === "taquillero" || rolTexto === "admin_cooperativa" ? rolTexto : null;

  if (!UUID_RE.test(sucursalId)) return { error: "Elige la sucursal donde trabajará.", campo: "sucursal" };
  if (!rol) return { error: "Elige el rol del empleado.", campo: "rol" };
  if (!EMAIL_RE.test(email)) {
    return { error: "Escribe un correo válido, por ejemplo nombre@correo.com.", campo: "email" };
  }

  // La sucursal debe ser de la cooperativa del administrador y estar activa
  const { data: sucursal, error: sucursalError } = await supabase
    .from("sucursales")
    .select("id, activa")
    .eq("id", sucursalId)
    .eq("cooperativa_id", admin.cooperativaId)
    .maybeSingle();
  if (sucursalError) {
    console.error("[invitarEmpleado] Error al leer la sucursal:", sucursalError);
    return { error: humanizeError(sucursalError, "verificar la sucursal") };
  }
  if (!sucursal) {
    return { error: "No encontramos esa sucursal en tu cooperativa. Actualiza la página y vuelve a elegirla.", campo: "sucursal" };
  }
  if (!sucursal.activa) {
    return { error: "Esa sucursal está desactivada. Actívala o elige otra.", campo: "sucursal" };
  }

  // 1. ¿Hay una invitación vigente para este correo?
  const ahoraIso = new Date().toISOString();
  let consultaActiva = await adminSupabase
    .from("invitaciones")
    .select("id, token, cooperativa_id, sucursal_id, role, expira_at")
    .ilike("email", correoExacto(email))
    .eq("usado", false)
    .is("revocada_at", null)
    .gt("expira_at", ahoraIso);
  if (consultaActiva.error?.code === "42703") {
    // Sin la columna revocada_at (migración 20260720000002 sin aplicar)
    consultaActiva = await adminSupabase
      .from("invitaciones")
      .select("id, token, cooperativa_id, sucursal_id, role, expira_at")
      .ilike("email", correoExacto(email))
      .eq("usado", false)
      .gt("expira_at", ahoraIso);
  }
  if (consultaActiva.error) {
    console.error("[invitarEmpleado] Error al buscar invitaciones:", consultaActiva.error);
    return { error: humanizeError(consultaActiva.error, "crear la invitación") };
  }

  const activas = consultaActiva.data ?? [];
  if (activas.length > 0) {
    // Se reutiliza solo la invitación de esta cooperativa y del mismo rol (su enlace sigue sirviendo).
    const propia = activas.find((i) => i.cooperativa_id === admin.cooperativaId && i.role === rol);
    if (!propia) {
      return {
        error: "Este correo ya tiene una invitación vigente con otro rol o de otra cooperativa. Revócala o usa otro correo.",
        campo: "email",
      };
    }
    if (propia.sucursal_id !== sucursalId) {
      const { error: updError } = await adminSupabase
        .from("invitaciones")
        .update({ sucursal_id: sucursalId })
        .eq("id", propia.id);
      if (updError) {
        console.error("[invitarEmpleado] Error al cambiar la sucursal:", updError);
        return { error: humanizeError(updError, "actualizar la invitación") };
      }
    }
    revalidatePath("/cooperativas/empleados");
    return { success: true, token: propia.token as string, expiraAt: propia.expira_at as string, existente: true };
  }

  // 2. ¿El correo ya tiene cuenta en EnBus? La invitación no serviría (no se puede crear otra cuenta).
  const { data: yaRegistrado, error: emailError } = await adminSupabase.rpc("fn_email_registrado", {
    p_email: email,
  });
  if (emailError) {
    console.error("[invitarEmpleado] Error al verificar el correo:", emailError);
  } else if (yaRegistrado === true) {
    return {
      error: "Este correo ya tiene una cuenta en EnBus. Invita a la persona con otro correo.",
      campo: "email",
    };
  }

  // 3. Nueva invitación. /cooperativas/invite/[token] busca por `token`.
  const expiraAt = new Date(Date.now() + VIGENCIA_MS).toISOString();
  const { data: invitacion, error: insertError } = await adminSupabase
    .from("invitaciones")
    .insert({
      email,
      role: rol,
      cooperativa_id: admin.cooperativaId,
      sucursal_id: sucursalId,
      creado_por: admin.userId,
      expira_at: expiraAt,
    })
    .select("id, token, expira_at")
    .single();

  if (insertError || !invitacion) {
    console.error("[invitarEmpleado] Error al crear la invitación:", insertError);
    return { error: humanizeError(insertError, "crear la invitación") };
  }

  revalidatePath("/cooperativas/empleados");
  return { success: true, token: invitacion.token as string, expiraAt: invitacion.expira_at as string };
}

/** Lee una invitación con el cliente de servicio y comprueba que sea de la cooperativa. */
async function invitacionPropia(id: string, cooperativaId: string) {
  if (!UUID_RE.test(id ?? "")) return { error: MSG_INVITACION_NO_ENCONTRADA } as const;
  const { data, error } = await createAdminClient()
    .from("invitaciones")
    .select("id, token, cooperativa_id, usado")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[empleados] Error al leer la invitación:", error);
    return { error: humanizeError(error, "buscar la invitación") } as const;
  }
  if (!data || data.cooperativa_id !== cooperativaId) return { error: MSG_INVITACION_NO_ENCONTRADA } as const;
  if (data.usado) return { error: "Esta invitación ya se usó: la persona ya creó su cuenta. Actualiza la página." } as const;
  return { data } as const;
}

/** Renueva el enlace por 48 horas más (sirve también para una invitación vencida). */
export async function reenviarInvitacion(
  id: string
): Promise<{ success: true; token: string; expiraAt: string; error?: undefined } | { success?: undefined; error: string }> {
  const admin = await adminActual();
  if (!admin.ok) return { error: admin.error };
  const inv = await invitacionPropia(id, admin.cooperativaId);
  if ("error" in inv) return { error: inv.error as string };

  const expiraAt = new Date(Date.now() + VIGENCIA_MS).toISOString();
  const { error } = await createAdminClient()
    .from("invitaciones")
    .update({ expira_at: expiraAt })
    .eq("id", id)
    .eq("cooperativa_id", admin.cooperativaId);
  if (error) {
    console.error("[reenviarInvitacion] Error:", error);
    return { error: humanizeError(error, "renovar la invitación") };
  }

  revalidatePath("/cooperativas/empleados");
  return { success: true, token: inv.data.token as string, expiraAt };
}

/** El enlace deja de funcionar (revocada_at = ahora). */
export async function revocarInvitacion(id: string): Promise<{ success: true; error?: undefined } | { success?: undefined; error: string }> {
  const admin = await adminActual();
  if (!admin.ok) return { error: admin.error };
  const inv = await invitacionPropia(id, admin.cooperativaId);
  if ("error" in inv) return { error: inv.error as string };

  const { error } = await createAdminClient()
    .from("invitaciones")
    .update({ revocada_at: new Date().toISOString() })
    .eq("id", id)
    .eq("cooperativa_id", admin.cooperativaId);
  if (error) {
    console.error("[revocarInvitacion] Error:", error);
    return { error: humanizeError(error, "revocar la invitación") };
  }

  revalidatePath("/cooperativas/empleados");
  return { success: true };
}

export async function toggleEmpleado(
  targetId: string,
  action: "desactivar" | "reactivar"
): Promise<{ success: true; error?: undefined } | { success?: undefined; error: string }> {
  const admin = await adminActual();
  if (!admin.ok) return { error: admin.error };

  if (admin.userId === targetId) {
    return { error: "No puedes desactivar tu propia cuenta." };
  }

  // El empleado debe ser de la misma cooperativa
  const supabase = await createClient();
  const { data: targetProfile, error: perfilError } = await supabase
    .from("profiles")
    .select("cooperativa_id")
    .eq("id", targetId)
    .maybeSingle();
  if (perfilError) {
    console.error("[toggleEmpleado] Error al leer el empleado:", perfilError);
    return { error: humanizeError(perfilError, "buscar al empleado") };
  }
  if (!targetProfile || targetProfile.cooperativa_id !== admin.cooperativaId) {
    return { error: "No encontramos a ese empleado en tu cooperativa. Actualiza la página." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(targetId, {
    ban_duration: action === "desactivar" ? "876000h" : "none",
  });

  if (error) {
    console.error(`[toggleEmpleado] Error al ${action}:`, error);
    return { error: humanizeError(error, `${action} al empleado`) };
  }

  if (action === "desactivar") {
    // El ban no invalida las sesiones abiertas: sin esto el empleado seguía
    // trabajando hasta que su token caducaba. Mejor esfuerzo (las RPC ya rechazan
    // a los empleados desactivados).
    const { error: sesionesError } = await adminClient.rpc("fn_cerrar_sesiones_usuario", { p_usuario_id: targetId });
    if (sesionesError) console.warn("[toggleEmpleado] No se pudieron cerrar las sesiones:", sesionesError);
  }

  revalidatePath("/cooperativas/empleados");
  return { success: true };
}
