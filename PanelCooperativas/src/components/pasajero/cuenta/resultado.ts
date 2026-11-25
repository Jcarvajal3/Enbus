// ─── Resultado común de las server actions del área de cuenta ────────────────
// `{ success: true, data } | { success: false, error, codigo? }` (plan maestro). Va fuera de los
// archivos "use server" porque estos solo pueden exportar funciones asíncronas.

import { codigoEB, humanizeError, parseDetalleEB, type DetalleEB } from "@/lib/errores";
import { mensajeErrorCompra } from "@/lib/pasajero/errores-compra";

export type ResultadoAccion<T = null> =
  | { success: true; data: T }
  | { success: false; error: string; codigo?: string; detalle?: DetalleEB };

export function exito<T>(data: T): ResultadoAccion<T> {
  return { success: true, data };
}

export function falla(error: string, codigo?: string, detalle?: DetalleEB): ResultadoAccion<never> {
  return { success: false, error, ...(codigo ? { codigo } : {}), ...(detalle ? { detalle } : {}) };
}

/** Error de Supabase o de red → resultado con texto para el pasajero. */
export function fallaDe(err: unknown, accion: string): ResultadoAccion<never> {
  const codigo = codigoEB(err) ?? undefined;
  const detalle = parseDetalleEB(err);
  return falla(humanizeError(err, accion), codigo, Object.keys(detalle).length ? detalle : undefined);
}

/** Igual, pero con los textos propios de la compra y el pago (`EB_TASA_CAMBIO`, `EB_ASIENTO_OCUPADO`…). */
export function fallaDePago(err: unknown): ResultadoAccion<never> {
  const codigo = codigoEB(err) ?? undefined;
  const detalle = parseDetalleEB(err);
  const hint = err && typeof err === "object" && typeof (err as { hint?: unknown }).hint === "string"
    ? ((err as { hint: string }).hint)
    : null;
  const texto = codigo ? mensajeErrorCompra(codigo, detalle, hint) : humanizeError(err, "registrar tu pago");
  return falla(texto, codigo, Object.keys(detalle).length ? detalle : undefined);
}

export const SESION_VENCIDA = "Tu sesión venció. Vuelve a ingresar para continuar.";
