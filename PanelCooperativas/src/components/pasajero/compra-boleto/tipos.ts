// ─── Compra de boletos en la web: tipos y reglas compartidas ─────────────────
// Los usan el servidor (server actions), la página y los pasos del flujo. Sin imports de servidor.
// Paridad con la app: EnBusApp/src/hooks/useCheckoutBoletos.ts y app/boletos/buscar.tsx.

import type { DetalleEB } from "@/lib/errores";

export const PASOS_COMPRA = ["asientos", "pasajeros", "pago", "listo"] as const;
export type PasoCompra = (typeof PASOS_COMPRA)[number];

export const TITULOS_PASO: Record<PasoCompra, string> = {
  asientos: "Elige tus asientos",
  pasajeros: "¿Quién viaja?",
  pago: "Paga tu boleto",
  listo: "Listo",
};

/** Pasos que se muestran en el indicador (el último, "listo", es la confirmación). */
export const PASOS_VISIBLES: readonly Exclude<PasoCompra, "listo">[] = ["asientos", "pasajeros", "pago"];

/** Máximo de asientos por compra (lo mismo que acepta el servidor). */
export const MAX_ASIENTOS = 10;

// ─── Respuestas de las server actions ────────────────────────────────────────

export type ResultadoAccion<T> =
  | { success: true; data: T }
  | { success: false; error: string; codigo?: string; detalle?: DetalleEB };

// ─── Lo que devuelven las RPC (`_resumen_compra` + extras), ya normalizado ───

export interface BoletoCompra {
  id: string;
  codigoBoleto: string;
  /** Número de asiento ("14"). */
  asiento: string;
  estado: string;
  precioUsd: number;
}

export interface PagoCompra {
  estado: string;
  montoUsd: number | null;
  montoBs: number | null;
  tasa: number | null;
  tasaFecha: string | null;
  moneda: string | null;
}

export interface ResumenCompra {
  compraId: string;
  /** Hora del servidor (ISO) al responder: sirve para medir el desfase del reloj. */
  serverNow: string | null;
  viajeId: string | null;
  boletos: BoletoCompra[];
  totalUsd: number | null;
  /** Vencimiento de la reserva (ISO), o null si ya hay pago o no hay reserva. */
  reservaExpiraAt: string | null;
  pago: PagoCompra | null;
  /** Solo en `fn_reservar_asientos`. */
  tasa: number | null;
  tasaFecha: string | null;
  totalBs: number | null;
  /** `fn_checkout_boletos` repetido con la misma clave: el pago ya estaba registrado. */
  repetido: boolean;
}

/** Pasajero que se sugiere de una compra anterior. */
export interface SugerenciaPasajero {
  nombre: string;
  cedula: string;
  telefono: string | null;
}

export type DatosPagoEnviar = {
  metodoPagoId: string;
  numeroReferencia: string;
  fechaTransaccion: string;
  bancoEmisor: string;
  montoDeclarado: number;
  comprobantePath: string | null;
};

/** Cómo terminó la compra: pago reportado (verificación) o asientos apartados para pagar en taquilla. */
export interface ResultadoCompra {
  modo: "verificacion" | "taquilla";
  /** null si el pago ya estaba registrado y no se pudo leer el detalle. */
  resumen: ResumenCompra | null;
  /** Desfase del reloj del servidor (ms) al terminar: para la cuenta regresiva de la reserva. */
  offsetMs?: number;
}

/** Nuevo uuid (uno por intento de compra) o clave de idempotencia. */
export function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

/** Asientos en orden numérico ("2", "10", "14"). */
export function ordenarAsientos(asientos: readonly string[]): string[] {
  return [...asientos].sort((a, b) => Number(a) - Number(b));
}

/** Asientos tomados que trae `details.asientos` de un error EB_*. */
export function asientosDelError(detalle?: DetalleEB | null): string[] {
  const lista = detalle?.asientos;
  return Array.isArray(lista) ? lista.filter((a): a is string => typeof a === "string") : [];
}

/** 1781 → "29:41" (minutos y segundos). */
export function formatCuentaAtras(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
