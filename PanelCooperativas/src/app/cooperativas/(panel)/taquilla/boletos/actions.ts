"use server";

// ─── Taquilla de boletos: venta y cobro de reservas ─────────────────────────
// Todo pasa por RPC SECURITY DEFINER (fase 2). El servidor decide el precio,
// la tasa BCV, el código del boleto (BOL-XXXXXXXX) y el QR (PASS-<código>);
// la venta y el pago se guardan en una sola transacción e idempotente
// (`idemKey`): reintentar con la misma clave no duplica la venta.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { codigoEB, humanizeError, parseDetalleEB, type DetalleEB } from "@/lib/errores";
import type {
  BoletoImpresion,
  CobroTaquilla,
  MonedaPago,
  ResumenCompra,
  TipoMetodoPago,
  VentaTaquilla,
} from "@/lib/types/pagos";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type ResultadoTaquilla<T> =
  | { success: true; data: T; error?: undefined; codigo?: undefined; detalle?: undefined }
  | {
      success: false;
      data?: undefined;
      error: string;
      /** Código EB_* si lo hubo. */
      codigo?: string;
      /** `details` del error EB_* (asientos ocupados, monto esperado, campo…). */
      detalle?: DetalleEB;
    };

/** Datos del cobro en taquilla (venta nueva o reserva de la app). */
export type DatosPagoTaquilla = {
  metodoTipo: TipoMetodoPago;
  /** Cuenta de la cooperativa que recibió el pago (Pago Móvil, transferencia, Zelle; no en punto de venta). */
  metodoPagoId?: string | null;
  /** Solo efectivo: moneda en que pagó el pasajero. */
  moneda?: MonedaPago | null;
  /** Solo efectivo: lo que entregó el pasajero (para el vuelto). */
  montoRecibido?: number | null;
  referencia?: string | null;
  /** 'YYYY-MM-DD' */
  fecha?: string | null;
  banco?: string | null;
};

export type PasajeroVenta = {
  asiento: string;
  nombre: string;
  cedula: string;
  telefono?: string | null;
};

/** Venta o cobro listo para imprimir: siempre trae `impresion`, `salida` y `cobro`. */
export type OperacionTaquilla = VentaTaquilla;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MSG_CLAVE = "Falta la clave de la operación. Cierra el formulario y vuelve a abrirlo.";

function fallo(error: unknown, accion: string): { success: false; error: string; codigo?: string; detalle?: DetalleEB } {
  const codigo = codigoEB(error) ?? undefined;
  return {
    success: false,
    error: humanizeError(error, accion),
    codigo,
    detalle: codigo ? parseDetalleEB(error) : undefined,
  };
}

function texto(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Parámetros de pago comunes a `fn_vender_boletos_taquilla` y `fn_cobrar_reserva_taquilla`. */
function parametrosPago(p: DatosPagoTaquilla) {
  const efectivo = p.metodoTipo === "EFECTIVO";
  // Punto de venta: solo referencia del comprobante y fecha (sin cuenta ni banco).
  const puntoVenta = p.metodoTipo === "PUNTO_DE_VENTA";
  const fecha = texto(p.fecha);
  return {
    p_metodo_tipo: p.metodoTipo,
    p_metodo_pago_id: !efectivo && !puntoVenta && p.metodoPagoId && UUID_RE.test(p.metodoPagoId) ? p.metodoPagoId : null,
    p_moneda: efectivo ? (p.moneda === "USD" ? "USD" : "VES") : null,
    p_monto_recibido:
      efectivo && typeof p.montoRecibido === "number" && Number.isFinite(p.montoRecibido) ? p.montoRecibido : null,
    p_numero_referencia: efectivo ? null : texto(p.referencia),
    p_fecha_transaccion: efectivo ? null : fecha && FECHA_RE.test(fecha) ? fecha : null,
    p_banco_emisor: efectivo || puntoVenta || p.metodoTipo === "ZELLE" ? null : texto(p.banco),
  };
}

function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Completa la respuesta para imprimir. La venta nueva ya trae `impresion`, `salida`
 * y `cobro`; una respuesta repetida (misma `idemKey`) y el cobro de una reserva
 * no traen todo, así que se leen los boletos de la compra (RLS del personal).
 */
async function completarParaImprimir(
  supabase: SupabaseServer,
  resumen: ResumenCompra & Partial<Pick<VentaTaquilla, "impresion" | "salida" | "cobro">>
): Promise<OperacionTaquilla> {
  let impresion: BoletoImpresion[] | undefined = resumen.impresion;
  let salida: string | undefined = resumen.salida;

  if (!impresion || !salida) {
    const { data } = await supabase
      .from("boletos")
      .select("codigo_boleto, qr_embarque_data, asiento, pasajero_nombre, pasajero_cedula, viaje:viajes!viaje_id(fecha_hora_salida)")
      .eq("compra_id", resumen.compra_id)
      .in("estado", ["PAGADO", "USADO"]);
    const filas = (data ?? []) as unknown as {
      codigo_boleto: string;
      qr_embarque_data: string | null;
      asiento: string;
      pasajero_nombre: string | null;
      pasajero_cedula: string | null;
      viaje: { fecha_hora_salida: string } | { fecha_hora_salida: string }[] | null;
    }[];
    filas.sort((a, b) => Number(a.asiento) - Number(b.asiento));
    impresion ??= filas.map((f) => ({
      codigo_boleto: f.codigo_boleto,
      qr: f.qr_embarque_data,
      asiento: f.asiento,
      pasajero: f.pasajero_nombre,
      cedula: f.pasajero_cedula,
    }));
    const viaje = filas[0]?.viaje;
    salida ??= (Array.isArray(viaje) ? viaje[0]?.fecha_hora_salida : viaje?.fecha_hora_salida) ?? "";
  }

  // `cobro` completo (totales y tasa) a partir del pago guardado si la RPC no los trajo.
  const pago = resumen.pago;
  const base = resumen.cobro;
  const moneda: MonedaPago = base?.moneda ?? pago?.moneda ?? "VES";
  const totalUsd = aNumero(base?.total_usd) ?? aNumero(pago?.monto_usd) ?? aNumero(resumen.total_usd) ?? 0;
  const totalBs = aNumero(base?.total_bs) ?? aNumero(pago?.monto_bs);
  const esperado = aNumero(base?.esperado) ?? (moneda === "USD" ? totalUsd : totalBs ?? 0);
  const recibido = aNumero(base?.recibido) ?? aNumero(pago?.monto_declarado) ?? esperado;
  const cobro: CobroTaquilla = {
    moneda,
    esperado,
    recibido,
    vuelto: aNumero(base?.vuelto) ?? Math.max(Math.round((recibido - esperado) * 100) / 100, 0),
    total_usd: totalUsd,
    total_bs: totalBs ?? undefined,
    tasa: aNumero(base?.tasa) ?? aNumero(pago?.tasa_bcv) ?? undefined,
    tasa_fecha: base?.tasa_fecha ?? pago?.tasa_bcv_fecha ?? undefined,
  };

  return { ...resumen, impresion: impresion ?? [], salida: salida ?? "", cobro };
}

/** Vende 1..10 asientos de un viaje con su pago (APROBADO) en una sola operación. */
export async function venderBoletos(
  data: {
    viajeId: string;
    pasajeros: PasajeroVenta[];
    idemKey: string;
  } & DatosPagoTaquilla
): Promise<ResultadoTaquilla<OperacionTaquilla>> {
  if (!UUID_RE.test(data.viajeId ?? "")) {
    return { success: false, error: "Elige el viaje de nuevo: no lo encontramos." };
  }
  if ((data.idemKey ?? "").length < 8) return { success: false, error: MSG_CLAVE };
  if (!Array.isArray(data.pasajeros) || data.pasajeros.length < 1 || data.pasajeros.length > 10) {
    return { success: false, error: "Agrega entre 1 y 10 pasajeros." };
  }
  try {
    const supabase = await createClient();
    const pasajeros = data.pasajeros.map((p) => ({
      asiento: String(p.asiento).trim(),
      nombre: p.nombre.trim(),
      cedula: p.cedula.trim(),
      telefono: texto(p.telefono),
    }));
    const { data: res, error } = await supabase.rpc("fn_vender_boletos_taquilla", {
      p_viaje_id: data.viajeId,
      p_pasajeros: pasajeros,
      ...parametrosPago(data),
      p_idempotency_key: data.idemKey,
    });
    if (error) {
      console.error("Error vendiendo boletos en taquilla:", error);
      return fallo(error, "vender los boletos");
    }
    const venta = await completarParaImprimir(supabase, res as VentaTaquilla);
    revalidatePath("/cooperativas/taquilla/boletos");
    return { success: true, data: venta };
  } catch (err) {
    console.error(err);
    return fallo(err, "vender los boletos");
  }
}

/** Cobra en taquilla una reserva de la app (sin pagar o con el pago rechazado). Activa toda la compra. */
export async function cobrarReserva(
  data: { boletoId: string; idemKey: string } & DatosPagoTaquilla
): Promise<ResultadoTaquilla<OperacionTaquilla>> {
  if (!UUID_RE.test(data.boletoId ?? "")) {
    return { success: false, error: "No encontramos ese boleto. Actualiza la lista." };
  }
  if ((data.idemKey ?? "").length < 8) return { success: false, error: MSG_CLAVE };
  try {
    const supabase = await createClient();
    const { data: res, error } = await supabase.rpc("fn_cobrar_reserva_taquilla", {
      p_boleto_id: data.boletoId,
      ...parametrosPago(data),
      p_idempotency_key: data.idemKey,
    });
    if (error) {
      console.error("Error cobrando reserva en taquilla:", error);
      return fallo(error, "cobrar la reserva");
    }
    const cobro = await completarParaImprimir(supabase, res as ResumenCompra & { cobro?: CobroTaquilla });
    revalidatePath("/cooperativas/taquilla/boletos");
    return { success: true, data: cobro };
  } catch (err) {
    console.error(err);
    return fallo(err, "cobrar la reserva");
  }
}
