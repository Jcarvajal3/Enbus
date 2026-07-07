"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { revalidatePath } from "next/cache";
import type { EstadoCooperativa } from "@/lib/types/admin-cooperativas";

export async function createCooperativa(formData: FormData) {
  try {
    const superAdmin = await requireSuperAdmin();
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const nombre = formData.get("nombre") as string;
    const rif = formData.get("rif") as string;
    const comisionStr = formData.get("comision_porcentaje") as string;
    const emailAdmin = formData.get("email_admin") as string;
    const logoFile = formData.get("logo") as File | null;

    if (!nombre || !rif || !comisionStr) {
      return { success: false, error: "Nombre, RIF y Comisión son requeridos." };
    }

    // RIF validation (e.g. J-12345678-9 or J-XXXXXXXX)
    const rifRegex = /^J-\d{8,9}$/;
    if (!rifRegex.test(rif)) {
      return { success: false, error: "El RIF debe tener el formato J-XXXXXXXX (letra J seguida de guión y 8 o 9 dígitos)." };
    }

    const comision = parseFloat(comisionStr);
    if (isNaN(comision) || comision < 0 || comision > 100) {
      return { success: false, error: "La comisión debe ser un número entre 0 y 100." };
    }

    // Insert cooperativa
    const { data: cooperativa, error: insertError } = await supabase
      .from("cooperativas")
      .insert({
        nombre,
        rif,
        comision_porcentaje: comision,
        estado: "ACTIVA"
      })
      .select()
      .single();

    if (insertError || !cooperativa) {
      console.error("Error inserting cooperativa:", insertError);
      return { success: false, error: insertError?.message || "Error al crear la cooperativa." };
    }

    let logo_url = null;
    if (logoFile && logoFile.size > 0) {
      // Whitelist MIME types — reject anything that isn't a raster image
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedMimeTypes.includes(logoFile.type)) {
        return { success: false, error: "El logo debe ser una imagen (JPEG, PNG, WebP o GIF)." };
      }
      if (logoFile.size > 5 * 1024 * 1024) {
        return { success: false, error: "El logo no puede superar los 5 MB." };
      }

      const ext = logoFile.name.split(".").pop() ?? "png";
      const path = `${cooperativa.id}/logo.${ext}`;

      const { error: uploadError } = await adminSupabase.storage
        .from("logos-cooperativas")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });

      if (uploadError) {
        console.error("Error uploading logo:", uploadError);
      } else {
        const { data: publicUrlData } = adminSupabase.storage.from("logos-cooperativas").getPublicUrl(path);
        logo_url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
        
        await supabase
          .from("cooperativas")
          .update({ logo_url })
          .eq("id", cooperativa.id);
      }
    }

    let invite_link = "";
    if (emailAdmin) {
      // Create invitation in the invitaciones table to match EnBus onboarding structure
      const { data: invitacion, error: inviteError } = await adminSupabase
        .from("invitaciones")
        .insert({
          email: emailAdmin,
          role: "admin_cooperativa",
          cooperativa_id: cooperativa.id,
          creado_por: superAdmin.id,
          expira_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        })
        .select("token")
        .single();

      if (inviteError) {
        console.error("Error creating invitation:", inviteError);
      } else if (invitacion) {
        invite_link = `/cooperativas/invite/${invitacion.token}`;
      }
    }

    revalidatePath("/admin/cooperativas");
    return { success: true, cooperativa_id: cooperativa.id, invite_link };
  } catch (error) {
    console.error("Error in createCooperativa server action:", error);
    const message = error instanceof Error ? error.message : "Error interno del servidor.";
    return { success: false, error: message };
  }
}

export async function inviteCooperativaAdmin(cooperativaId: string, email: string) {
  try {
    const superAdmin = await requireSuperAdmin();
    const adminSupabase = createAdminClient();

    if (!email) {
      return { success: false, error: "El correo electrónico es requerido." };
    }

    // Check if there is an active invitation
    const { data: activa } = await adminSupabase
      .from("invitaciones")
      .select("id")
      .eq("email", email)
      .eq("usado", false)
      .gt("expira_at", new Date().toISOString());

    if (activa && activa.length > 0) {
      return { success: false, error: "Ya hay una invitación activa para este correo electrónico." };
    }

    const { data: invitacion, error: inviteError } = await adminSupabase
      .from("invitaciones")
      .insert({
        email,
        role: "admin_cooperativa",
        cooperativa_id: cooperativaId,
        creado_por: superAdmin.id,
        expira_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select("token")
      .single();

    if (inviteError) {
      console.error("Error creating invitation:", inviteError);
      return { success: false, error: "Error al crear la invitación." };
    }

    const invite_link = `/cooperativas/invite/${invitacion.token}`;

    revalidatePath(`/admin/cooperativas/${cooperativaId}`);
    return { success: true, invite_link };
  } catch (error) {
    console.error("Error in inviteCooperativaAdmin:", error);
    const message = error instanceof Error ? error.message : "Error interno.";
    return { success: false, error: message };
  }
}

export async function updateCooperativa(id: string, formData: FormData) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const nombre = formData.get("nombre") as string;
    const rif = formData.get("rif") as string;
    const comisionStr = formData.get("comision_porcentaje") as string;
    const logoFile = formData.get("logo") as File | null;

    if (!nombre || !rif || !comisionStr) {
      return { success: false, error: "Nombre, RIF y Comisión son requeridos." };
    }

    const rifRegex = /^J-\d{8,9}$/;
    if (!rifRegex.test(rif)) {
      return { success: false, error: "El RIF debe tener el formato J-XXXXXXXX." };
    }

    const comision = parseFloat(comisionStr);
    if (isNaN(comision) || comision < 0 || comision > 100) {
      return { success: false, error: "La comisión debe ser un número entre 0 y 100." };
    }

    const updates: {
      nombre: string;
      rif: string;
      comision_porcentaje: number;
      updated_at: string;
      logo_url?: string;
    } = {
      nombre,
      rif,
      comision_porcentaje: comision,
      updated_at: new Date().toISOString()
    };

    if (logoFile && logoFile.size > 0) {
      // Whitelist MIME types — reject anything that isn't a raster image
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedMimeTypes.includes(logoFile.type)) {
        return { success: false, error: "El logo debe ser una imagen (JPEG, PNG, WebP o GIF)." };
      }
      if (logoFile.size > 5 * 1024 * 1024) {
        return { success: false, error: "El logo no puede superar los 5 MB." };
      }

      const ext = logoFile.name.split(".").pop() ?? "png";
      const path = `${id}/logo.${ext}`;

      const { error: uploadError } = await adminSupabase.storage
        .from("logos-cooperativas")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });

      if (uploadError) {
        console.error("Error uploading logo:", uploadError);
      } else {
        const { data: publicUrlData } = adminSupabase.storage.from("logos-cooperativas").getPublicUrl(path);
        updates.logo_url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      }
    }

    const { error: updateError } = await supabase
      .from("cooperativas")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      console.error("Error updating cooperativa:", updateError);
      return { success: false, error: updateError.message };
    }

    revalidatePath("/admin/cooperativas");
    revalidatePath(`/admin/cooperativas/${id}`);
    return { success: true };
  } catch (error) {
    console.error("Error in updateCooperativa:", error);
    const message = error instanceof Error ? error.message : "Error interno.";
    return { success: false, error: message };
  }
}

export async function changeCooperativaEstado(id: string, nuevoEstado: EstadoCooperativa) {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    // Check current state
    const { data: currentCoop, error: getError } = await supabase
      .from("cooperativas")
      .select("estado")
      .eq("id", id)
      .single();

    if (getError || !currentCoop) {
      return { success: false, error: "Cooperativa no encontrada." };
    }

    const estadoActual = currentCoop.estado;

    if (estadoActual === nuevoEstado) {
      return { success: true };
    }

    // Explicit allowlist of valid state transitions
    const transicionesPermitidas: Record<string, EstadoCooperativa[]> = {
      ACTIVA: ["SUSPENDIDA", "DESACTIVADA"],
      SUSPENDIDA: ["ACTIVA", "DESACTIVADA"],
      DESACTIVADA: [], // terminal state — no transitions allowed
    };
    const permitidas = transicionesPermitidas[estadoActual] ?? [];
    if (!permitidas.includes(nuevoEstado)) {
      return {
        success: false,
        error: `Transición de estado ${estadoActual} → ${nuevoEstado} no está permitida.`,
      };
    }

    const { error: updateError } = await supabase
      .from("cooperativas")
      .update({
        estado: nuevoEstado,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error changing cooperativa state:", updateError);
      return { success: false, error: updateError.message };
    }

    revalidatePath("/admin/cooperativas");
    revalidatePath(`/admin/cooperativas/${id}`);
    return { success: true };
  } catch (error) {
    console.error("Error in changeCooperativaEstado:", error);
    const message = error instanceof Error ? error.message : "Error interno.";
    return { success: false, error: message };
  }
}
