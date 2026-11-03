"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin, esUuid } from "@/lib/data/admin-auth";

const NO_ENCONTRADA = "No encontramos la incidencia. Actualiza la página e intenta de nuevo.";
/** Largo máximo de la resolución y de la descripción (evita guardar textos enormes). */
const MAX_TEXTO = 2000;
import { revalidatePath } from "next/cache";
import { formatUsd } from "@/lib/dinero";
import { humanizeError } from "@/lib/errores";

export async function tomarCaso(incidenciaId: string) {
  try {
    const admin = await requireSuperAdmin();
    if (!esUuid(incidenciaId)) return { success: false, error: NO_ENCONTRADA };
    const supabase = await createClient();

    // Check if the incident exists
    const { data: incidencia, error: fetchError } = await supabase
      .from("incidencias")
      .select("estado")
      .eq("id", incidenciaId)
      .single();

    if (fetchError || !incidencia) {
      return { success: false, error: humanizeError(fetchError ?? { code: "PGRST116" }, "cargar la incidencia") };
    }

    if (incidencia.estado !== "ABIERTA") {
      return { success: false, error: "Esta incidencia ya la tomó otra persona. Actualiza la página." };
    }

    // Solo si sigue ABIERTA: si otro admin la tomó entre la lectura y este update, no se pisa.
    const { data: tomadas, error: updateError } = await supabase
      .from("incidencias")
      .update({
        estado: "EN_PROCESO",
        resuelta_por: admin.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", incidenciaId)
      .eq("estado", "ABIERTA")
      .select("id");

    if (updateError) {
      console.error("Error taking case:", updateError);
      return { success: false, error: humanizeError(updateError, "tomar la incidencia") };
    }
    if (!tomadas || tomadas.length === 0) {
      return { success: false, error: "Esta incidencia ya la tomó otra persona. Actualiza la página." };
    }

    revalidatePath("/admin/incidencias");
    revalidatePath(`/admin/incidencias/${incidenciaId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error in tomarCaso action:", error);
    return { success: false, error: humanizeError(error, "tomar la incidencia") };
  }
}

export async function resolverIncidencia(incidenciaId: string, formData: FormData) {
  try {
    const admin = await requireSuperAdmin();
    if (!esUuid(incidenciaId)) return { success: false, error: NO_ENCONTRADA };
    const supabase = await createClient();

    const valor = formData.get("resolucion");
    const resolucion = typeof valor === "string" ? valor : "";
    if (!resolucion || resolucion.trim() === "") {
      return { success: false, error: "Cuenta cómo se resolvió la incidencia." };
    }
    if (resolucion.trim().length > MAX_TEXTO) {
      return { success: false, error: `La resolución no puede pasar de ${MAX_TEXTO} caracteres.` };
    }

    // Check current incident status
    const { data: incidencia, error: fetchError } = await supabase
      .from("incidencias")
      .select("estado")
      .eq("id", incidenciaId)
      .single();

    if (fetchError || !incidencia) {
      return { success: false, error: humanizeError(fetchError ?? { code: "PGRST116" }, "cargar la incidencia") };
    }

    if (incidencia.estado === "RESUELTA") {
      return { success: false, error: "Esta incidencia ya está resuelta. Actualiza la página." };
    }
    if (incidencia.estado !== "EN_PROCESO") {
      return { success: false, error: "Primero toma el caso; después podrás resolverlo." };
    }

    const { data: resueltas, error: updateError } = await supabase
      .from("incidencias")
      .update({
        estado: "RESUELTA",
        resolucion: resolucion.trim(),
        resuelta_por: admin.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", incidenciaId)
      .eq("estado", "EN_PROCESO")
      .select("id");

    if (!updateError && (!resueltas || resueltas.length === 0)) {
      return { success: false, error: "Esta incidencia ya está resuelta. Actualiza la página." };
    }

    if (updateError) {
      console.error("Error resolving incident:", updateError);
      return { success: false, error: humanizeError(updateError, "resolver la incidencia") };
    }

    revalidatePath("/admin/incidencias");
    revalidatePath(`/admin/incidencias/${incidenciaId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error in resolverIncidencia action:", error);
    return { success: false, error: humanizeError(error, "resolver la incidencia") };
  }
}

export async function crearIncidenciaPerdida(encomiendaId: string, descripcion: string) {
  try {
    const admin = await requireSuperAdmin();
    if (!esUuid(encomiendaId)) {
      return { success: false, error: "No encontramos la encomienda. Actualiza la página e intenta de nuevo." };
    }
    const supabase = await createClient();

    if (typeof descripcion !== "string" || descripcion.trim() === "") {
      return { success: false, error: "Describe qué pasó con la encomienda." };
    }
    if (descripcion.trim().length > MAX_TEXTO) {
      return { success: false, error: `La descripción no puede pasar de ${MAX_TEXTO} caracteres.` };
    }

    // Doble clic u otro admin: no se abre una segunda pérdida sobre la misma encomienda.
    const { data: abiertas, error: abiertasError } = await supabase
      .from("incidencias")
      .select("id")
      .eq("encomienda_id", encomiendaId)
      .eq("tipo", "PERDIDA")
      .neq("estado", "RESUELTA")
      .limit(1);
    if (abiertasError) {
      console.error("Error checking open lost incidents:", abiertasError);
      return { success: false, error: humanizeError(abiertasError, "crear la incidencia") };
    }
    if (abiertas && abiertas.length > 0) {
      return { success: false, error: "Esta encomienda ya tiene una incidencia de pérdida sin resolver." };
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
      return { success: false, error: humanizeError(insertError, "crear la incidencia") };
    }

    revalidatePath("/admin/incidencias");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error in crearIncidenciaPerdida action:", error);
    return { success: false, error: humanizeError(error, "crear la incidencia") };
  }
}

export async function activarSeguro(incidenciaId: string) {
  try {
    const admin = await requireSuperAdmin();
    if (!esUuid(incidenciaId)) return { success: false, error: NO_ENCONTRADA };
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
      return { success: false, error: humanizeError(fetchError ?? { code: "PGRST116" }, "cargar la incidencia") };
    }

    if (incidencia.tipo !== "PERDIDA") {
      return { success: false, error: "El seguro solo se activa para encomiendas perdidas." };
    }

    if (incidencia.estado === "RESUELTA") {
      return { success: false, error: "Esta incidencia ya está resuelta. Actualiza la página." };
    }

    // El embed llega como objeto (FK a uno) o como arreglo según los tipos generados.
    const embed = incidencia.encomiendas as
      | { valor_declarado?: number | string | null }
      | { valor_declarado?: number | string | null }[]
      | null;
    const encomienda = Array.isArray(embed) ? embed[0] : embed;
    const valorDeclarado = encomienda?.valor_declarado ? Number(encomienda.valor_declarado) : 0;
    // Spec: cobertura del seguro es 3× el valor declarado
    // Redondeado al centavo (3 × 10,10 = 30,299999… en float).
    const montoReembolso = Math.round(valorDeclarado * 3 * 100) / 100;
    if (incidencia.estado !== "EN_PROCESO") {
      return { success: false, error: "Primero toma el caso; después podrás activar el seguro." };
    }
    if (valorDeclarado <= 0) {
      return {
        success: false,
        error: "Esta encomienda no declaró valor: el seguro no aplica. Registra la compensación manualmente en la resolución.",
      };
    }

    const resolucionText = `[SEGURO ACTIVADO] Se aprobó el reembolso de seguro por ${formatUsd(montoReembolso)} (cobertura 3× el valor declarado de ${formatUsd(valorDeclarado)}). Gestionado por el equipo de EnBus.`;

    // Solo si no está resuelta: el seguro no se aprueba dos veces.
    const { data: actualizadas, error: updateError } = await supabase
      .from("incidencias")
      .update({
        estado: "RESUELTA",
        resolucion: resolucionText,
        resuelta_por: admin.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", incidenciaId)
      .eq("estado", "EN_PROCESO")
      .select("id");

    if (updateError) {
      console.error("Error activating insurance on incident:", updateError);
      return { success: false, error: humanizeError(updateError, "activar el seguro") };
    }
    if (!actualizadas || actualizadas.length === 0) {
      return { success: false, error: "Esta incidencia ya está resuelta. Actualiza la página." };
    }

    revalidatePath("/admin/incidencias");
    revalidatePath(`/admin/incidencias/${incidenciaId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error in activarSeguro action:", error);
    return { success: false, error: humanizeError(error, "activar el seguro") };
  }
}
