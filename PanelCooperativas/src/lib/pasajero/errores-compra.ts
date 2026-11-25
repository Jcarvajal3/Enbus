// ─── Mensajes de los errores EB_* de la compra y el pago ─────────────────────
// Las RPC fallan con `message = 'EB_<CODIGO>'`, `hint` (texto para el usuario) y `details`.
// Las server actions devuelven el código y el detalle; aquí se convierten en texto.

import { humanizeError, type DetalleEB } from "@/lib/errores";

/** Campos del formulario de pago que el servidor puede señalar en `details.campo`. */
export type CampoErrorPago = "referencia" | "fecha" | "banco" | "monto" | "comprobante";

const TEXTOS: Record<string, string> = {
  EB_TASA_CAMBIO: "La tasa BCV se actualizó. Revisa el nuevo total antes de reportar el pago.",
  EB_ASIENTO_OCUPADO: "Alguien tomó uno de tus asientos. Vuelve al mapa y elige otros.",
  EB_DATOS_PASAJERO: "Falta el nombre o la cédula de algún pasajero. Complétalos para continuar.",
  EB_PAGO_YA_REGISTRADO: "Ya reportaste un pago para esta compra. La cooperativa lo está verificando.",
  EB_TASA_NO_DISPONIBLE: "Aún no tenemos la tasa BCV de hoy para calcular el monto en bolívares. Intenta en unos minutos o paga en la taquilla.",
  EB_REFERENCIA_REPETIDA: "Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.",
  EB_COMPROBANTE_REQUERIDO: "Adjunta el capture del Pago Móvil.",
  EB_METODO_INVALIDO: "Elige una forma de pago de la cooperativa. El efectivo se paga en la taquilla.",
  EB_COSTO_PENDIENTE: "El costo se calcula cuando la taquilla pesa el paquete.",
};

/**
 * Texto para mostrar al pasajero. Prioridad: texto propio del código → `detalle.hint`/texto que
 * mande el servidor (`hint`) → mensaje genérico. `detalle` es `details` ya leído.
 */
export function mensajeErrorCompra(
  codigo: string | null | undefined,
  detalle?: (DetalleEB & { hint?: string }) | null,
  hint?: string | null
): string {
  const texto = (hint ?? detalle?.hint)?.trim();
  if (codigo === "EB_DATOS_PASAJERO" && detalle?.asientos?.length) {
    return `Falta el nombre o la cédula del pasajero del asiento ${detalle.asientos.join(", ")}.`;
  }
  if (codigo && TEXTOS[codigo]) return TEXTOS[codigo];
  if (texto) return texto;
  return humanizeError(codigo ? { message: codigo } : null, "completar el pago");
}

/** Campo del formulario de pago que señala el error (`details.campo`), si es uno que conocemos. */
export function campoErrorPago(detalle?: DetalleEB | null): CampoErrorPago | null {
  const campo = detalle?.campo;
  return campo === "referencia" || campo === "fecha" || campo === "banco" || campo === "monto" || campo === "comprobante"
    ? campo
    : null;
}
