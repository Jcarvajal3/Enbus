"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function generarCodigoBoleto() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const str = Array.from({ length: 5 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD
  return `BL-${dateStr}-${str}`;
}

export async function venderBoleto(data: {
  viajeId: string;
  asiento: string;
  pasajeroNombre: string;
  pasajeroCedula: string;
  pasajeroTelefono?: string;
  tipoPago: "EFECTIVO" | "DIGITAL";
  referenciaData?: { numero: string; fecha: string; banco: string };
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "No autorizado" };

    const { data: profile } = await supabase.from("profiles").select("cooperativa_id").eq("id", user.id).single();
    const cooperativa_id = profile?.cooperativa_id;

    if (!cooperativa_id) return { success: false, error: "Usuario sin cooperativa" };

    const codigo = generarCodigoBoleto();
    const qrData = crypto.randomUUID();

    const { data: viaje, error: viajeError } = await supabase
      .from("viajes")
      .select("ruta:rutas(precio_pasaje)")
      .eq("id", data.viajeId)
      .single();

    if (viajeError || !viaje) return { success: false, error: "Viaje no encontrado" };
    // @ts-expect-error - PostgREST response typing sometimes hides nested array/object
    const precio = (Array.isArray(viaje.ruta) ? viaje.ruta[0].precio_pasaje : viaje.ruta?.precio_pasaje) || 0;

    const { data: boleto, error: boletoError } = await supabase.from("boletos").insert({
      codigo_boleto: codigo,
      comprador_id: null,
      viaje_id: data.viajeId,
      cooperativa_id,
      asiento: data.asiento,
      precio,
      estado: "PAGADO",
      qr_embarque_data: qrData,
      pasajero_nombre: data.pasajeroNombre,
      pasajero_cedula: data.pasajeroCedula,
      pasajero_telefono: data.pasajeroTelefono,
    }).select().single();

    if (boletoError) return { success: false, error: boletoError.message };

    const { error: pagoError } = await supabase.from("pagos").insert({
      boleto_id: boleto.id,
      pagador_id: user.id, // el taquillero
      cooperativa_id,
      monto: precio,
      tipo_pago: data.tipoPago,
      numero_referencia: data.referenciaData?.numero,
      fecha_transaccion: data.referenciaData?.fecha || new Date().toISOString(),
      banco_emisor: data.referenciaData?.banco,
      verificado: true,
      verificado_por: user.id,
      verificado_at: new Date().toISOString(),
    });

    if (pagoError) return { success: false, error: pagoError.message };

    revalidatePath("/cooperativas/taquilla/boletos");
    
    return { success: true, boleto, qrData };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error interno en el servidor" };
  }
}

export async function confirmarEmbarque(boletoId: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("boletos")
      .update({ estado: "USADO" })
      .eq("id", boletoId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/cooperativas/taquilla/boletos");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Error interno en el servidor" };
  }
}
