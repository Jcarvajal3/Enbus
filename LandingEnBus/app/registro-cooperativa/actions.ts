"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { sendInvitationEmail } from "@/lib/email";

interface ActionState {
  error?: string | null;
  success?: boolean;
}

export async function registrarCooperativa(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const nombre = formData.get("nombre") as string;
  const rif = formData.get("rif") as string;
  const email = formData.get("email") as string;
  const telefono = formData.get("telefono") as string;
  const representante = formData.get("representante") as string;
  const mensaje = formData.get("mensaje") as string;

  if (!nombre || !rif || !email || !telefono || !representante) {
    return { error: "Todos los campos obligatorios son requeridos." };
  }

  // Validate RIF format (J-XXXXXXXX)
  const rifRegex = /^J-\d{8,9}$/;
  if (!rifRegex.test(rif)) {
    return { error: "El RIF debe tener el formato J-XXXXXXXX (letra J seguida de guión y 8 o 9 dígitos)." };
  }

  try {
    // 1. Check if cooperativa with same RIF already exists
    const { data: existingCoop, error: checkError } = await supabaseAdmin
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

    // 2. Query a super_admin from profiles to set as creado_por (since it is NOT NULL in schema)
    const { data: superAdmin, error: superAdminError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();

    if (superAdminError || !superAdmin) {
      console.error("Error finding super admin for invitation:", superAdminError);
      return { error: "Error al procesar la solicitud (no se encontró administrador en el sistema)." };
    }

    // 3. Create the cooperativa in PENDIENTE state and comision_porcentaje = 0
    const { data: cooperativa, error: insertError } = await supabaseAdmin
      .from("cooperativas")
      .insert({
        nombre,
        rif,
        estado: "PENDIENTE",
        comision_porcentaje: 0.00,
        telefono,
        email,
        descripcion: mensaje ? `Representante: ${representante}. Mensaje: ${mensaje}` : `Representante: ${representante}`
      })
      .select()
      .single();

    if (insertError || !cooperativa) {
      console.error("Error inserting cooperativa:", insertError);
      return { error: "Error al registrar la cooperativa." };
    }

    // 4. Create the invitation in invitaciones table
    const { data: invitacion, error: inviteError } = await supabaseAdmin
      .from("invitaciones")
      .insert({
        email,
        role: "admin_cooperativa",
        cooperativa_id: cooperativa.id,
        creado_por: superAdmin.id,
        expira_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days expiration
      })
      .select("token")
      .single();

    if (inviteError || !invitacion) {
      console.error("Error creating invitation:", inviteError);
      // Clean up the created cooperativa since invitation failed
      await supabaseAdmin.from("cooperativas").delete().eq("id", cooperativa.id);
      return { error: "Error al crear la invitación para el panel." };
    }

    // 5. Send invitation email
    const cooperativasUrl = process.env.NEXT_PUBLIC_COOPERATIVAS_URL || "http://localhost:3001";
    const inviteLink = `${cooperativasUrl}/cooperativas/invite/${invitacion.token}`;
    
    const emailResult = await sendInvitationEmail({
      email,
      cooperativaNombre: nombre,
      inviteLink,
    });

    if (!emailResult.success) {
      console.warn("Email was not sent successfully but record was created:", emailResult.error);
    }

    return { success: true };
  } catch (error) {
    console.error("Exception in registrarCooperativa server action:", error);
    return { error: "Ocurrió un error inesperado al procesar el registro." };
  }
}
