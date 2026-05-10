"use server";

import { createClient } from "@/lib/supabase/server";

export async function validarPin(encomiendaId: string, pinIngresado: string) {
  const supabase = await createClient();

  // 1. Obtener encomienda con PIN real
  const { data: enc, error } = await supabase
    .from("encomiendas")
    .select("pin_retiro, intentos_pin, pin_bloqueado")
    .eq("id", encomiendaId)
    .single();

  if (error || !enc) {
    return { success: false, bloqueado: false, mensaje: "Error al verificar la encomienda" };
  }

  // 2. Verificar bloqueo
  if (enc.pin_bloqueado) {
    return { success: false, bloqueado: true, mensaje: "PIN bloqueado. Contactar soporte." };
  }

  // 3. Comparar PIN
  if (enc.pin_retiro === pinIngresado) {
    return { success: true, bloqueado: false };
  }

  // 4. PIN incorrecto — incrementar intentos
  const nuevosIntentos = (enc.intentos_pin || 0) + 1;
  const nuevoBloqueado = nuevosIntentos >= 10;

  const { error: updateError } = await supabase
    .from("encomiendas")
    .update({
      intentos_pin: nuevosIntentos,
      pin_bloqueado: nuevoBloqueado,
    })
    .eq("id", encomiendaId);

  if (updateError) {
    console.error("Error al registrar intento de PIN:", updateError);
    return {
      success: false,
      bloqueado: false,
      mensaje: "Error al validar PIN. Intente nuevamente.",
    };
  }

  return {
    success: false,
    bloqueado: nuevoBloqueado,
    intentosRestantes: 10 - nuevosIntentos,
    mensaje: nuevoBloqueado
      ? "PIN bloqueado. El destinatario debe contactar a soporte."
      : `PIN incorrecto. Intentos restantes: ${10 - nuevosIntentos}`,
  };
}

export async function confirmarEntrega(encomiendaId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("encomiendas")
    .update({ estado: "ENTREGADA" })
    .eq("id", encomiendaId)
    .eq("estado", "EN_OFICINA_DESTINO"); // Safety check

  // No se envían notificaciones (spec lo indica explícitamente)

  return { success: !error, error: error?.message };
}
