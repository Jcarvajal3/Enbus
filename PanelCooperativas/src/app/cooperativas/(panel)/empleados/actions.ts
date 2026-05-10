"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function invitarEmpleado(formData: FormData) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase.from("profiles").select("cooperativa_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa") {
    throw new Error("No autorizado");
  }

  const email = formData.get("email") as string;
  const sucursalId = formData.get("sucursalId") as string;

  if (!email || !sucursalId) {
    return { error: "Email y sucursal son requeridos" };
  }

  // 1. Verificar si hay invitación activa
  const { data: activa } = await adminSupabase
    .from("invitaciones")
    .select("id")
    .eq("email", email)
    .eq("usado", false)
    .gt("expira_at", new Date().toISOString());

  if (activa && activa.length > 0) {
    return { error: "Ya hay una invitación activa para este email" };
  }

  // 2. Insertar
  const { data: invitacion, error: insertError } = await adminSupabase
    .from("invitaciones")
    .insert({
      email,
      role: "taquillero",
      cooperativa_id: profile.cooperativa_id,
      sucursal_id: sucursalId,
      creado_por: user.id,
      expira_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Error insertando invitación:", insertError);
    return { error: "Error al crear la invitación" };
  }

  revalidatePath("/cooperativas/empleados");
  return { success: true, token: invitacion.id };
}

export async function toggleEmpleado(targetId: string, action: "desactivar" | "reactivar") {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase.from("profiles").select("role, cooperativa_id").eq("id", user.id).single();
  if (!profile || profile.role !== "admin_cooperativa") {
    throw new Error("No autorizado");
  }

  if (user.id === targetId) {
    return { error: "No puedes modificar tu propia cuenta" };
  }

  // Verificar que el empleado pertenece a la misma cooperativa
  const { data: targetProfile } = await supabase.from("profiles").select("cooperativa_id").eq("id", targetId).single();
  if (!targetProfile || targetProfile.cooperativa_id !== profile.cooperativa_id) {
    return { error: "Empleado no encontrado en tu cooperativa" };
  }

  const { error } = await adminSupabase.auth.admin.updateUserById(targetId, {
    ban_duration: action === "desactivar" ? "876000h" : "none",
  });

  if (error) {
    console.error(`Error al ${action} empleado:`, error);
    return { error: `Error al ${action} el empleado` };
  }

  revalidatePath("/cooperativas/empleados");
  return { success: true };
}
