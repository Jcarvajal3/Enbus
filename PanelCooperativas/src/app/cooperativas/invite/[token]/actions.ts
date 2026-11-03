"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { INICIO } from "@/lib/navigation";
import { CLAVE_ERROR, CLAVE_MINIMO } from "@/lib/ve";
import { humanizeError } from "@/lib/errores";

// Supabase client con service_role para operaciones de administración
function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}

/** Mismo mensaje para un enlace inexistente, vencido, revocado o ya usado (no se revela cuál). */
const MSG_INVITACION_INVALIDA =
  "Este enlace venció o ya fue usado. Pide a tu administrador uno nuevo (las invitaciones vencen a las 48 horas).";

type FilaInvitacion = {
  email: string;
  creado_por: string | null;
  role: string;
  cooperativa_id: string;
  sucursal_id: string | null;
  usado: boolean;
  expira_at: string;
  revocada_at?: string | null;
  cooperativas: unknown;
};

const ROLES_INVITABLES = ["taquillero", "admin_cooperativa"];

/**
 * true si la invitación es de un rol del panel, la creó un administrador de esa
 * misma cooperativa (o el equipo de EnBus) y su sucursal es de esa cooperativa.
 */
async function invitacionLegitima(
  supabase: ReturnType<typeof createAdminClient>,
  inv: FilaInvitacion
): Promise<boolean> {
  if (!ROLES_INVITABLES.includes(inv.role) || !inv.cooperativa_id || !inv.creado_por) return false;

  const [creador, sucursal] = await Promise.all([
    supabase.from("profiles").select("role, cooperativa_id").eq("id", inv.creado_por).maybeSingle(),
    inv.sucursal_id
      ? supabase.from("sucursales").select("cooperativa_id").eq("id", inv.sucursal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (creador.error || sucursal.error) {
    console.error("[validateInviteToken] Error al revisar la invitación:", creador.error ?? sucursal.error);
    return false;
  }
  const c = creador.data as { role?: string; cooperativa_id?: string | null } | null;
  const creadorValido =
    c?.role === "super_admin" || (c?.role === "admin_cooperativa" && c.cooperativa_id === inv.cooperativa_id);
  if (!creadorValido) return false;
  if (inv.sucursal_id) {
    const suc = sucursal.data as { cooperativa_id?: string } | null;
    if (!suc || suc.cooperativa_id !== inv.cooperativa_id) return false;
  }
  return true;
}

export async function validateInviteToken(token: string) {
  if (typeof token !== "string" || !/^[0-9a-f]{16,128}$/i.test(token)) {
    return { error: MSG_INVITACION_INVALIDA, invalida: true as const };
  }
  const supabase = createAdminClient();

  const consulta = (select: string) =>
    supabase.from("invitaciones").select(select).eq("token", token).maybeSingle();
  let res = await consulta(
    "email, role, cooperativa_id, sucursal_id, usado, expira_at, revocada_at, creado_por, cooperativas(nombre)"
  );
  // 42703: la columna revocada_at aún no existe (migración 20260720000002 sin aplicar).
  if (res.error?.code === "42703") {
    res = await consulta("email, role, cooperativa_id, sucursal_id, usado, expira_at, creado_por, cooperativas(nombre)");
  }

  if (res.error) {
    console.error("[validateInviteToken] Error:", res.error);
    return { error: humanizeError(res.error, "revisar la invitación") };
  }
  const invitacion = res.data as unknown as FilaInvitacion | null;

  if (
    !invitacion ||
    invitacion.usado ||
    invitacion.revocada_at ||
    new Date(invitacion.expira_at).getTime() < Date.now()
  ) {
    return { error: MSG_INVITACION_INVALIDA, invalida: true as const };
  }

  // La política RLS de INSERT en `invitaciones` solo exige que quien inserta sea
  // admin_cooperativa o super_admin: no limita el rol ni la cooperativa de la fila.
  // Como este flujo crea la cuenta con el cliente de servicio, aquí se exige que la
  // invitación sea coherente antes de aceptarla (si no, un administrador podría
  // crearse una invitación de super_admin o de otra cooperativa desde la API).
  if (!(await invitacionLegitima(supabase, invitacion))) {
    console.error("[validateInviteToken] Invitación incoherente rechazada:", {
      role: invitacion.role,
      cooperativa_id: invitacion.cooperativa_id,
      creado_por: invitacion.creado_por,
    });
    return { error: MSG_INVITACION_INVALIDA, invalida: true as const };
  }

  const embed = invitacion.cooperativas;
  const cooperativa = (Array.isArray(embed) ? embed[0] : embed) as { nombre?: string | null } | null;

  return {
    success: true,
    email: invitacion.email,
    role: invitacion.role,
    cooperativa_id: invitacion.cooperativa_id,
    /** Sucursal asignada por quien invitó (null si no tiene); se copia a profiles.sucursal_id. */
    sucursal_id: invitacion.sucursal_id ?? null,
    cooperativa_nombre: cooperativa?.nombre ?? null,
  };
}

export async function completeOnboarding(
  prevState: { error?: string | null; success?: boolean }, 
  formData: FormData
): Promise<{ error?: string | null; success?: boolean }> {
  const token = formData.get("token") as string;
  const nombre = String(formData.get("nombre") ?? "").trim();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!nombre) {
    return { error: "Escribe tu nombre completo." };
  }

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  if (password.length < CLAVE_MINIMO) {
    return { error: CLAVE_ERROR };
  }

  const validacion = await validateInviteToken(token);
  if (validacion.error) return { error: validacion.error };

  const supabaseAdmin = createAdminClient();

  // 1. Crear el usuario.
  // telefono y cedula_rif son UNIQUE en profiles: un marcador fijo ("PENDIENTE")
  // hacía fallar al segundo empleado invitado. Se usa uno único por usuario; el
  // empleado los completa luego en su perfil.
  const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: validacion.email!,
    password: password,
    email_confirm: true,
    user_metadata: {
      nombre_completo: nombre,
      telefono: `PENDIENTE-${crypto.randomUUID()}`,
      cedula_rif: `PENDIENTE-${crypto.randomUUID()}`
    }
  });

  if (createError) {
    console.error("Error creating invited user:", createError);
    return { error: humanizeError(createError, { accion: "crear tu cuenta", email: validacion.email }) };
  }

  const userId = authData.user.id;

  // 2. Actualizar profiles (el trigger handle_new_user crea la fila). Con service role,
  //    así que la protección de rol/cooperativa/sucursal (aa_proteger_perfil) no aplica.
  const { data: perfiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      role: validacion.role,
      cooperativa_id: validacion.cooperativa_id,
      sucursal_id: validacion.sucursal_id,
      nombre_completo: nombre
    })
    .eq("id", userId)
    .select("id");

  if (profileError || !perfiles || perfiles.length === 0) {
    console.error("Error updating invited user profile:", profileError ?? "perfil no encontrado");
    // Sin perfil configurado la cuenta quedaría inutilizable y bloquearía el correo:
    // se elimina para que la persona pueda reintentar con el mismo enlace.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) console.error("Error deleting half-created invited user:", deleteError);
    return {
      error: profileError
        ? humanizeError(profileError, "configurar tu perfil")
        : "No pudimos configurar tu perfil. Intenta de nuevo en unos minutos; si sigue pasando, avísale a tu cooperativa.",
    };
  }

  // 3. Marcar invitación como usada
  const { error: usadoError } = await supabaseAdmin
    .from("invitaciones")
    .update({ usado: true })
    .eq("token", token);
  if (usadoError) console.error("Error marking invitation as used:", usadoError);

  // 4. Iniciar sesión automáticamente (usando el cliente de sesión normal)
  const cookieStore = await cookies();
  const supabaseSession = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorar en server components
          }
        },
      },
    }
  );

  await supabaseSession.auth.signInWithPassword({
    email: validacion.email!,
    password: password,
  });

  // Mismo inicio para ambos roles (PN-04).
  redirect(INICIO);
}
