"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

interface ActionState {
  error?: string | null;
  success?: boolean;
}

export async function registrarCooperativa(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const nombre = formData.get("nombre") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const rif = formData.get("rif") as string;
  const telefono = formData.get("telefono") as string;
  const representante = formData.get("representante") as string;

  // Validations
  if (!nombre || !email || !password || !confirmPassword || !rif || !telefono || !representante) {
    return { error: "Todos los campos son requeridos." };
  }

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  // Validate RIF format (J-XXXXXXXX)
  const rifRegex = /^J-\d{8,9}$/;
  if (!rifRegex.test(rif)) {
    return { error: "El RIF debe tener el formato J-XXXXXXXX (letra J seguida de guión y 8 o 9 dígitos)." };
  }

  const supabase = createAdminClient();

  try {
    // 1. Check if cooperativa with same RIF already exists
    const { data: existingCoop, error: checkError } = await supabase
      .from("cooperativas")
      .select("id")
      .eq("rif", rif)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing cooperativa:", checkError);
      return { error: "Error al verificar el registro." };
    }

    if (existingCoop) {
      return { error: "Ya existe una cooperativa registrada con este RIF." };
    }

    // 2. Check if email is already in use
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(u => u.email === email);
    if (emailExists) {
      return { error: "Ya existe una cuenta con este correo electrónico." };
    }

    // 3. Create the cooperativa in PENDIENTE state
    const { data: cooperativa, error: insertError } = await supabase
      .from("cooperativas")
      .insert({
        nombre,
        rif,
        estado: "PENDIENTE",
        comision_porcentaje: 0.00,
        telefono,
        email,
        descripcion: `Representante: ${representante}`
      })
      .select()
      .single();

    if (insertError || !cooperativa) {
      console.error("Error inserting cooperativa:", insertError);
      return { error: "Error al registrar la cooperativa." };
    }

    // 4. Create auth user with email confirmation disabled
    const { data: authData, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email (skip verification)
      user_metadata: {
        nombre_completo: representante,
        telefono,
        cedula_rif: rif,
      },
    });

    if (createUserError || !authData.user) {
      console.error("Error creating auth user:", createUserError);
      // Rollback cooperativa
      await supabase.from("cooperativas").delete().eq("id", cooperativa.id);
      return { error: "Error al crear la cuenta: " + (createUserError?.message || "Error desconocido") };
    }

    const userId = authData.user.id;

    // 5. Update profile with admin_cooperativa role and link to cooperativa
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        role: "admin_cooperativa",
        cooperativa_id: cooperativa.id,
        nombre_completo: representante,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      // Profile might not exist yet (trigger delay), try inserting directly
      const { error: insertProfileError } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          role: "admin_cooperativa",
          cooperativa_id: cooperativa.id,
          nombre_completo: representante,
          telefono,
          cedula_rif: rif,
        });

      if (insertProfileError) {
        console.error("Error upserting profile:", insertProfileError);
      }
    }

    // 6. Auto-login the user
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
              // Ignore in server components
            }
          },
        },
      }
    );

    await supabaseSession.auth.signInWithPassword({
      email,
      password,
    });

    redirect("/cooperativas/dashboard");
  } catch (error) {
    // Re-throw redirect errors (Next.js uses them internally)
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    console.error("Exception in registrarCooperativa:", error);
    return { error: "Ocurrió un error inesperado al procesar el registro." };
  }
}
