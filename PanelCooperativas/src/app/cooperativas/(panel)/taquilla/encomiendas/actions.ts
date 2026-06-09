"use server";

import { createClient } from "@/lib/supabase/server";

export async function confirmarRecepcion(encomiendaId: string, peso: number, costo: number) {
  const supabase = await createClient();

  // Step 1: PENDIENTE_DE_ESCANEO → EN_RECEPCION
  // Activa el trigger de DB que genera el PIN de retiro.
  // Safety check en .eq garantiza idempotencia.
  const { error: errorStep1, data: step1Data } = await supabase
    .from("encomiendas")
    .update({ estado: "EN_RECEPCION" })
    .eq("id", encomiendaId)
    .eq("estado", "PENDIENTE_DE_ESCANEO")
    .select("id");

  if (errorStep1) {
    console.error("Error en transición a EN_RECEPCION:", errorStep1);
    return { success: false, error: errorStep1.message };
  }

  const step1Count = step1Data?.length ?? 0;
  // Si afectó 0 filas, la encomienda ya no estaba en PENDIENTE_DE_ESCANEO
  if (step1Count === 0) {
    return { success: false, error: "La encomienda ya fue procesada o no existe." };
  }

  // Step 2: EN_RECEPCION → POR_PAGAR (con peso y costo)
  const { error: errorStep2 } = await supabase
    .from("encomiendas")
    .update({
      peso_kg: peso,
      costo_calculado: costo,
      estado: "POR_PAGAR",
    })
    .eq("id", encomiendaId)
    .eq("estado", "EN_RECEPCION");

  if (errorStep2) {
    console.error("Error en transición a POR_PAGAR:", errorStep2);
    return { success: false, error: errorStep2.message };
  }

  // Step 3: Edge Function generar-guia-pdf
  let pdfUrl: string | null = null;
  try {
    const { data: pdfData } = await supabase.functions.invoke("generar-guia-pdf", {
      body: { encomienda_id: encomiendaId },
    });
    pdfUrl = pdfData?.pdf_url || null;
  } catch (pdfError) {
    console.error("Error al generar PDF de guía:", pdfError);
  }

  return { success: true, pdfUrl };
}


export async function procesarPago(
  encomiendaId: string,
  tipoPago: "DIGITAL" | "EFECTIVO",
  costo: number,
  cooperativaId: string,
  pagoExistenteId?: string
) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  
  if (!authData.user) {
    return { success: false, error: "Usuario no autenticado" };
  }
  
  const userId = authData.user.id;

  try {
    // 1. Si DIGITAL y hay pago existente -> marcar como verificado
    if (tipoPago === "DIGITAL" && pagoExistenteId) {
      await supabase.from("pagos")
        .update({ 
          verificado: true, 
          verificado_por: userId, 
          verificado_at: new Date().toISOString() 
        })
        .eq("id", pagoExistenteId);
    }

    // 2. Si EFECTIVO -> insertar nuevo pago
    if (tipoPago === "EFECTIVO") {
      await supabase.from("pagos").insert({
        encomienda_id: encomiendaId,
        pagador_id: userId, // el taquillero registra
        cooperativa_id: cooperativaId,
        monto: costo,
        tipo_pago: "EFECTIVO",
        verificado: true,
        verificado_por: userId,
        verificado_at: new Date().toISOString(),
      });
    }

    // 3. Cambiar estado encomienda -> PAGADA
    await supabase.from("encomiendas")
      .update({ estado: "PAGADA" })
      .eq("id", encomiendaId);

    // 4. Retornar señal de requiere foto
    return { success: true, requiresPhoto: true };
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Error al procesar pago:", error);
    return { success: false, error: err.message || "Error al procesar el pago" };
  }
}

export async function obtenerPdfGuia(encomiendaId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("generar-guia-pdf", {
    body: { encomienda_id: encomiendaId },
  });
  if (error) {
    console.error("Error al obtener PDF de guía:", error);
    return { success: false, error: error.message };
  }
  return { success: true, pdfUrl: data?.pdf_url || null };
}

