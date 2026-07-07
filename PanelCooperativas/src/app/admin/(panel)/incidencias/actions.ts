"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { revalidatePath } from "next/cache";

export async function tomarCaso(incidenciaId: string) {
  try {
    const admin = await requireSuperAdmin();
    const supabase = await createClient();

    // Check if the incident exists
    const { data: incidencia, error: fetchError } = await supabase
      .from("incidencias")
      .select("estado")
      .eq("id", incidenciaId)
      .single();

    if (fetchError || !incidencia) {
      return { success: false, error: "Incidencia no encontrada." };
    }

    if (incidencia.estado !== "ABIERTA") {
      return { success: false, error: "Solo se pueden tomar incidencias en estado ABIERTA." };
    }

    const { error: updateError } = await supabase
      .from("incidencias")
      .update({
        estado: "EN_PROCESO",
        resuelta_por: admin.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", incidenciaId);

    if (updateError) {
      console.error("Error taking case:", updateError);
      return { success: false, error: updateError.message };
    }

    revalidatePath("/admin/incidencias");
    revalidatePath(`/admin/incidencias/${incidenciaId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error in tomarCaso action:", error);
    return { success: false, error: error.message || "Error interno." };
  }
}

export async function resolverIncidencia(incidenciaId: string, formData: FormData) {
  try {
    const admin = await requireSuperAdmin();
    const supabase = await createClient();

    const resolucion = formData.get("resolucion") as string;
    if (!resolucion || resolucion.trim() === "") {
      return { success: false, error: "La resolución es requerida." };
    }

    // Check current incident status
    const { data: incidencia, error: fetchError } = await supabase
      .from("incidencias")
      .select("estado")
      .eq("id", incidenciaId)
      .single();

    if (fetchError || !incidencia) {
      return { success: false, error: "Incidencia no encontrada." };
    }

    if (incidencia.estado !== "EN_PROCESO") {
      return { success: false, error: "Para resolver la incidencia, primero debe estar EN_PROCESO." };
    }

    const { error: updateError } = await supabase
      .from("incidencias")
      .update({
        estado: "RESUELTA",
        resolucion: resolucion.trim(),
        resuelta_por: admin.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", incidenciaId);

    if (updateError) {
      console.error("Error resolving incident:", updateError);
      return { success: false, error: updateError.message };
    }

    revalidatePath("/admin/incidencias");
    revalidatePath(`/admin/incidencias/${incidenciaId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error in resolverIncidencia action:", error);
    return { success: false, error: error.message || "Error interno." };
  }
}

export async function crearIncidenciaPerdida(encomiendaId: string, descripcion: string) {
  try {
    const admin = await requireSuperAdmin();
    const supabase = await createClient();

    if (!descripcion || descripcion.trim() === "") {
      return { success: false, error: "La descripción de la incidencia es requerida." };
    }

    const { error: insertError } = await supabase
      .from("incidencias")
      .insert({
        encomienda_id: encomiendaId,
        reportado_por: admin.id,
        tipo: "PERDIDA",
        descripcion: descripcion.trim(),
        estado: "ABIERTA"
      });

    if (insertError) {
      console.error("Error creating lost incident:", insertError);
      return { success: false, error: insertError.message };
    }

    revalidatePath("/admin/incidencias");
    return { success: true };
  } catch (error: any) {
    console.error("Error in crearIncidenciaPerdida action:", error);
    return { success: false, error: error.message || "Error interno." };
  }
}

export async function activarSeguro(incidenciaId: string) {
  try {
    const admin = await requireSuperAdmin();
    const supabase = await createClient();

    // Fetch the incident along with its associated encomienda
    const { data: incidencia, error: fetchError } = await supabase
      .from("incidencias")
      .select(`
        id,
        tipo,
        estado,
        encomienda_id,
        encomiendas(tracking_id, valor_declarado)
      `)
      .eq("id", incidenciaId)
      .single();

    if (fetchError || !incidencia) {
      return { success: false, error: "Incidencia no encontrada." };
    }

    if (incidencia.tipo !== "PERDIDA") {
      return { success: false, error: "El seguro solo se puede activar para encomiendas pérdidas." };
    }

    if (incidencia.estado === "RESUELTA") {
      return { success: false, error: "La incidencia ya está resuelta." };
    }

    const encomienda: any = incidencia.encomiendas;
    const valorDeclarado = encomienda?.valor_declarado ? Number(encomienda.valor_declarado) : 0;
    // Spec: cobertura del seguro es 3× el valor declarado
    const montoReembolso = valorDeclarado * 3;

    const resolucionText = `[SEGURO ACTIVADO] Se aprobó el reembolso de seguro por $${montoReembolso.toFixed(2)} (cobertura 3× el valor declarado de $${valorDeclarado.toFixed(2)}). Proceso gestionado por el Super Administrador.`;

    const { error: updateError } = await supabase
      .from("incidencias")
      .update({
        estado: "RESUELTA",
        resolucion: resolucionText,
        resuelta_por: admin.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", incidenciaId);

    if (updateError) {
      console.error("Error activating insurance on incident:", updateError);
      return { success: false, error: updateError.message };
    }

    revalidatePath("/admin/incidencias");
    revalidatePath(`/admin/incidencias/${incidenciaId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error in activarSeguro action:", error);
    return { success: false, error: error.message || "Error interno." };
  }
}
