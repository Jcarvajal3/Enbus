"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireSuperAdmin, esUuid } from "@/lib/data/admin-auth";

const NO_ENCONTRADA = "No encontramos la cooperativa. Actualiza la página e intenta de nuevo.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOMBRE = 120;
/** Extensión del logo según su tipo real (no el nombre del archivo, que lo elige quien lo sube). */
const EXT_LOGO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const ESTADOS_VALIDOS: EstadoCooperativa[] = ["PENDIENTE", "RECHAZADA", "ACTIVA", "SUSPENDIDA", "DESACTIVADA"];

/** Texto de un campo del formulario (un File u otro valor raro cuenta como vacío). */
function campo(formData: FormData, nombre: string): string {
  const v = formData.get(nombre);
  return typeof v === "string" ? v.trim() : "";
}

/** ¿Ese correo ya tiene una invitación vigente (sin usar, sin revocar y sin vencer)? */
async function tieneInvitacionVigente(adminSupabase: ReturnType<typeof createAdminClient>, email: string) {
  const { data, error } = await adminSupabase
    .from("invitaciones")
    .select("id")
    .eq("email", email)
    .eq("usado", false)
    .is("revocada_at", null)
    .gt("expira_at", new Date().toISOString())
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
import { revalidatePath } from "next/cache";
import { ESTADOS_CON_MOTIVO, type EstadoCooperativa } from "@/lib/types/admin-cooperativas";
import { normalizeRif, RIF_ERROR } from "@/lib/rif";
import { humanizeError } from "@/lib/errores";

export async function createCooperativa(formData: FormData) {
  try {
    const superAdmin = await requireSuperAdmin();
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const nombre = campo(formData, "nombre");
    const rifInput = campo(formData, "rif");
    const comisionStr = campo(formData, "comision_porcentaje");
    const emailAdmin = campo(formData, "email_admin").toLowerCase();
    const logo = formData.get("logo");
    const logoFile = logo instanceof File ? logo : null;

    if (!nombre || !rifInput || !comisionStr) {
      return { success: false, error: "Completa el nombre, el RIF y la comisión." };
    }
    if (nombre.length > MAX_NOMBRE) {
      return { success: false, error: `El nombre no puede pasar de ${MAX_NOMBRE} caracteres.` };
    }
    if (emailAdmin && !EMAIL_RE.test(emailAdmin)) {
      return { success: false, error: "El correo del administrador no es válido. Revisa que esté bien escrito." };
    }

    // Acepta el RIF con o sin guiones (J, G, V, E, P o C) y lo guarda normalizado ("J-12345678-9")
    const rif = normalizeRif(rifInput);
    if (!rif) {
      return { success: false, error: RIF_ERROR, campo: "rif" as const };
    }

    const comision = Number(comisionStr.replace(",", "."));
    if (!Number.isFinite(comision) || comision < 0 || comision > 100) {
      return { success: false, error: "La comisión debe ser un número entre 0 y 100." };
    }

    // Validar el logo antes de crear la cooperativa, para no dejarla creada si el logo se rechaza.
    // Mismo límite que muestra el diálogo (2 MB).
    let aviso: string | undefined;
    if (logoFile && logoFile.size > 0) {
      // Whitelist MIME types — reject anything that isn't a raster image
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedMimeTypes.includes(logoFile.type)) {
        return { success: false, error: "El logo debe ser una imagen (JPEG, PNG, WebP o GIF)." };
      }
      if (logoFile.size > 2 * 1024 * 1024) {
        return { success: false, error: "El logo no puede superar los 2 MB." };
      }
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
      return {
        success: false,
        error: humanizeError(insertError, "crear la cooperativa"),
        campo: insertError?.code === "23505" ? ("rif" as const) : undefined,
      };
    }

    let logo_url = null;
    if (logoFile && logoFile.size > 0) {
      const ext = EXT_LOGO[logoFile.type] ?? "png";
      const path = `${cooperativa.id}/logo.${ext}`;

      const { error: uploadError } = await adminSupabase.storage
        .from("logos-cooperativas")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });

      if (uploadError) {
        console.error("Error uploading logo:", uploadError);
        aviso = "Creamos la cooperativa, pero no pudimos subir el logo. Súbelo de nuevo desde Editar datos.";
      } else {
        const { data: publicUrlData } = adminSupabase.storage.from("logos-cooperativas").getPublicUrl(path);
        logo_url = `${publicUrlData.publicUrl}?t=${Date.now()}`;

        const { error: logoError } = await supabase
          .from("cooperativas")
          .update({ logo_url })
          .eq("id", cooperativa.id);
        if (logoError) {
          console.error("Error saving logo_url:", logoError);
          aviso = "Creamos la cooperativa, pero no pudimos guardar el logo. Súbelo de nuevo desde Editar datos.";
        }
      }
    }

    let invite_link = "";
    let invitacionVigente = false;
    if (emailAdmin) {
      try {
        invitacionVigente = await tieneInvitacionVigente(adminSupabase, emailAdmin);
      } catch (e) {
        console.error("Error checking invitations:", e);
      }
      if (invitacionVigente) {
        aviso = [aviso, "Ese correo ya tiene una invitación vigente: no creamos otra."].filter(Boolean).join(" ");
      }
    }
    if (emailAdmin && !invitacionVigente) {
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
        aviso = [aviso, "No pudimos crear la invitación del administrador. Créala desde el detalle de la cooperativa."]
          .filter(Boolean)
          .join(" ");
      } else if (invitacion) {
        invite_link = `/cooperativas/invite/${invitacion.token}`;
      }
    }

    revalidatePath("/admin/cooperativas");
    return { success: true, cooperativa_id: cooperativa.id, invite_link, aviso };
  } catch (error) {
    console.error("Error in createCooperativa server action:", error);
    return { success: false, error: humanizeError(error, "crear la cooperativa") };
  }
}

export async function inviteCooperativaAdmin(cooperativaId: string, email: string) {
  try {
    const superAdmin = await requireSuperAdmin();
    if (!esUuid(cooperativaId)) return { success: false, error: NO_ENCONTRADA };
    const adminSupabase = createAdminClient();

    email = String(email ?? "").trim().toLowerCase();
    if (!email) {
      return { success: false, error: "Escribe el correo del administrador." };
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return { success: false, error: "El correo no es válido. Revisa que esté bien escrito (por ejemplo, nombre@correo.com)." };
    }

    // La cooperativa tiene que existir y poder operar (no se invita a una desactivada).
    const { data: coop, error: coopError } = await adminSupabase
      .from("cooperativas")
      .select("id, estado")
      .eq("id", cooperativaId)
      .maybeSingle();
    if (coopError) {
      console.error("Error loading cooperativa for invitation:", coopError);
      return { success: false, error: humanizeError(coopError, "crear la invitación") };
    }
    if (!coop) return { success: false, error: NO_ENCONTRADA };
    if (coop.estado === "DESACTIVADA") {
      return { success: false, error: "Esta cooperativa está desactivada: no se le pueden invitar administradores." };
    }

    // Una invitación vigente por correo (las revocadas no cuentan).
    if (await tieneInvitacionVigente(adminSupabase, email)) {
      return { success: false, error: "Ese correo ya tiene una invitación vigente. Espera a que la use o a que venza (48 horas)." };
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
      return { success: false, error: humanizeError(inviteError, "crear la invitación") };
    }

    const invite_link = `/cooperativas/invite/${invitacion.token}`;

    revalidatePath(`/admin/cooperativas/${cooperativaId}`);
    return { success: true, invite_link };
  } catch (error) {
    console.error("Error in inviteCooperativaAdmin:", error);
    return { success: false, error: humanizeError(error, "crear la invitación") };
  }
}

export async function updateCooperativa(id: string, formData: FormData) {
  try {
    await requireSuperAdmin();
    if (!esUuid(id)) return { success: false, error: NO_ENCONTRADA };
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const nombre = campo(formData, "nombre");
    const rifInput = campo(formData, "rif");
    const comisionStr = campo(formData, "comision_porcentaje");
    const logo = formData.get("logo");
    const logoFile = logo instanceof File ? logo : null;

    if (!nombre || !rifInput || !comisionStr) {
      return { success: false, error: "Completa el nombre, el RIF y la comisión." };
    }
    if (nombre.length > MAX_NOMBRE) {
      return { success: false, error: `El nombre no puede pasar de ${MAX_NOMBRE} caracteres.` };
    }

    // Normaliza el RIF ("J-12345678-9"). Si no se puede normalizar pero es el mismo RIF que ya
    // estaba guardado (registros antiguos sin dígito verificador), se conserva para no bloquear la edición.
    let rif = normalizeRif(rifInput);
    if (!rif) {
      const { data: actual } = await supabase
        .from("cooperativas")
        .select("rif")
        .eq("id", id)
        .maybeSingle();
      if (actual?.rif && actual.rif === rifInput) {
        rif = rifInput;
      } else {
        return { success: false, error: RIF_ERROR };
      }
    }

    const comision = Number(comisionStr.replace(",", "."));
    if (!Number.isFinite(comision) || comision < 0 || comision > 100) {
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

    let aviso: string | undefined;
    if (logoFile && logoFile.size > 0) {
      // Whitelist MIME types — reject anything that isn't a raster image
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedMimeTypes.includes(logoFile.type)) {
        return { success: false, error: "El logo debe ser una imagen (JPEG, PNG, WebP o GIF)." };
      }
      if (logoFile.size > 2 * 1024 * 1024) {
        return { success: false, error: "El logo no puede superar los 2 MB. Usa una imagen más liviana." };
      }

      const ext = EXT_LOGO[logoFile.type] ?? "png";
      const path = `${id}/logo.${ext}`;

      const { error: uploadError } = await adminSupabase.storage
        .from("logos-cooperativas")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });

      if (uploadError) {
        console.error("Error uploading logo:", uploadError);
        aviso = "Guardamos los datos, pero no pudimos subir el logo. Intenta de nuevo con otra imagen.";
      } else {
        const { data: publicUrlData } = adminSupabase.storage.from("logos-cooperativas").getPublicUrl(path);
        updates.logo_url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      }
    }

    const { data: actualizadas, error: updateError } = await supabase
      .from("cooperativas")
      .update(updates)
      .eq("id", id)
      .select("id");

    if (!updateError && (!actualizadas || actualizadas.length === 0)) {
      return { success: false, error: NO_ENCONTRADA };
    }
    if (updateError) {
      console.error("Error updating cooperativa:", updateError);
      return { success: false, error: humanizeError(updateError, "guardar los cambios de la cooperativa") };
    }

    revalidatePath("/admin/cooperativas");
    revalidatePath(`/admin/cooperativas/${id}`);
    return { success: true, aviso };
  } catch (error) {
    console.error("Error in updateCooperativa:", error);
    return { success: false, error: humanizeError(error, "guardar los cambios de la cooperativa") };
  }
}

/**
 * Suspender, reactivar o desactivar con fn_cambiar_estado_cooperativa: valida la
 * transición en el servidor, exige motivo para SUSPENDIDA/DESACTIVADA (la
 * cooperativa lo ve en su panel) y registra quién y cuándo.
 */
export async function changeCooperativaEstado(id: string, nuevoEstado: EstadoCooperativa, motivo?: string) {
  try {
    await requireSuperAdmin();
    if (!esUuid(id)) return { success: false, error: NO_ENCONTRADA };
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      return { success: false, error: "Ese estado no existe. Actualiza la página e intenta de nuevo." };
    }
    const motivoLimpio = String(motivo ?? "").trim().slice(0, 500);
    if (ESTADOS_CON_MOTIVO.includes(nuevoEstado) && motivoLimpio.length < 5) {
      return { success: false, error: "Escribe el motivo (mínimo 5 caracteres): la cooperativa lo verá en su panel." };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_cambiar_estado_cooperativa", {
      p_cooperativa_id: id,
      p_estado: nuevoEstado,
      p_motivo: motivoLimpio || null,
    });

    if (error) {
      console.error("Error changing cooperativa state:", error);
      return { success: false, error: humanizeError(error, "cambiar el estado de la cooperativa") };
    }

    revalidatePath("/admin/cooperativas");
    revalidatePath(`/admin/cooperativas/${id}`);
    revalidatePath("/admin/solicitudes");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error in changeCooperativaEstado:", error);
    return { success: false, error: humanizeError(error, "cambiar el estado de la cooperativa") };
  }
}
