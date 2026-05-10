"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

export async function validateInviteToken(token: string) {
  const supabase = createAdminClient();

  const { data: invitacion, error } = await supabase
    .from("invitaciones")
    .select("email, role, cooperativa_id, usado, expira_at, cooperativas(nombre)")
    .eq("token", token)
    .single();

  if (error || !invitacion) {
    return { error: "Invitación no encontrada." };
  }

  if (invitacion.usado) {
    return { error: "Esta invitación ya fue utilizada." };
  }

  if (new Date(invitacion.expira_at) < new Date()) {
    return { error: "Esta invitación ha expirado." };
  }

  return { 
    success: true, 
    email: invitacion.email,
    role: invitacion.role,
    cooperativa_id: invitacion.cooperativa_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cooperativa_nombre: (invitacion.cooperativas as any)?.nombre 
  };
}

export async function completeOnboarding(
  prevState: { error?: string | null; success?: boolean }, 
  formData: FormData
): Promise<{ error?: string | null; success?: boolean }> {
  const token = formData.get("token") as string;
  const nombre = formData.get("nombre") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const validacion = await validateInviteToken(token);
  if (validacion.error) return { error: validacion.error };

  const supabaseAdmin = createAdminClient();

  // 1. Crear el usuario
  const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: validacion.email!,
    password: password,
    email_confirm: true,
    user_metadata: {
      nombre_completo: nombre,
      telefono: "PENDIENTE",
      cedula_rif: "PENDIENTE"
    }
  });

  if (createError) {
    return { error: "Error al crear el usuario: " + createError.message };
  }

  const userId = authData.user.id;

  // 2. Actualizar profiles (El trigger maneja la inserción en base de datos de producción)
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      role: validacion.role,
      cooperativa_id: validacion.cooperativa_id,
      nombre_completo: nombre
    })
    .eq("id", userId);

  if (profileError) {
    return { error: "Error al actualizar perfil: " + profileError.message };
  }

  // 3. Marcar invitación como usada
  await supabaseAdmin
    .from("invitaciones")
    .update({ usado: true })
    .eq("token", token);

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

  if (validacion.role === "taquillero") {
    redirect("/cooperativas/taquilla/encomiendas");
  } else {
    redirect("/cooperativas/dashboard");
  }
}
