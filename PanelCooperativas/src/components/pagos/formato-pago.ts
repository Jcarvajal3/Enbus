// ─── Textos de un pago por verificar ────────────────────────────────────────
// Compartidos por el diálogo de verificación y su confirmación.

import { formatBs, formatUsd } from "@/lib/dinero";
import { METODO_PAGO } from "@/lib/estados";
import type { PagadorRol, PagoPorVerificar, TipoMetodoPago } from "@/lib/types/pagos";

export const ROL_PAGADOR: Record<PagadorRol, string> = {
  PASAJERO: "Pasajero",
  REMITENTE: "Remitente",
  DESTINATARIO: "Destinatario",
  OTRO: "Cliente",
};

export function formatEnMoneda(monto: number, moneda: "VES" | "USD") {
  return moneda === "USD" ? formatUsd(monto) : formatBs(monto);
}

/** "Pago Móvil", "Punto de venta"…; sin método conocido, "Pago digital". */
export function nombreMetodo(tipo: TipoMetodoPago | null | undefined): string {
  return tipo ? METODO_PAGO[tipo] : METODO_PAGO.DIGITAL;
}

/** "Pago Móvil a Banesco ••••4567 (Transportes C.A.)" / "Zelle a pagos@coop.com" */
export function cuentaDestino(p: PagoPorVerificar): string {
  const titular = p.cuenta_titular ? ` (${p.cuenta_titular})` : "";
  const final = p.cuenta_final ? ` ••••${p.cuenta_final}` : "";
  switch (p.metodo_tipo) {
    case "ZELLE":
      return `Zelle a ${p.cuenta_email_zelle ?? "la cuenta de la cooperativa"}${titular}`;
    case "PAGO_MOVIL":
      return `Pago Móvil a ${p.cuenta_banco ?? "la cooperativa"}${final}${titular}`;
    case "TRANSFERENCIA_BANCARIA":
      return `Transferencia a ${p.cuenta_banco ?? "la cooperativa"}${final}${titular}`;
    case "EFECTIVO":
      return "Efectivo en taquilla";
    case "PUNTO_DE_VENTA":
      return "Punto de venta en taquilla";
    default:
      return "Forma de pago no indicada";
  }
}

/** "asiento 14" / "asientos 14, 15" (vacío si no hay asientos). */
export function textoAsientos(asientos: string | null): string {
  if (!asientos) return "";
  return `${asientos.includes(",") ? "asientos" : "asiento"} ${asientos}`;
}
