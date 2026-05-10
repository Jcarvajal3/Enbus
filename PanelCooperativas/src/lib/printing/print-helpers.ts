import { printer } from "./bluetooth";
import { buildTicket } from "./escpos";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { Boleto } from "@/lib/types/boletos";

export async function printGuiaEncomienda(encomienda: Encomienda) {
  const ticket = buildTicket({
    title: "GUÍA DE ENVÍO",
    lines: [
      { label: "Tracking", value: encomienda.tracking_id },
      { label: "Remitente", value: encomienda.sender?.nombre_completo || "" },
      { label: "Destinatario", value: encomienda.receiver_nombre },
      { label: "Ruta", value: `${encomienda.ciudad_origen} → ${encomienda.ciudad_destino}` },
      { label: "Peso", value: `${encomienda.peso_kg} kg` },
      { label: "Costo", value: `$${encomienda.costo_calculado}` },
    ],
    qrData: encomienda.tracking_id,
    footer: "EnBus — Envíos rápidos y seguros",
  });
  await printer.write(ticket);
}

export async function printBoleto(boleto: Boleto) {
  const ticket = buildTicket({
    title: "BOLETO DE VIAJE",
    lines: [
      { label: "Código", value: boleto.codigo_boleto },
      { label: "Pasajero", value: boleto.pasajero_nombre || "" },
      { label: "Asiento", value: boleto.asiento },
      { label: "Precio", value: `$${boleto.precio}` },
    ],
    qrData: boleto.qr_embarque_data || undefined,
    footer: "Presente este boleto al abordar",
  });
  await printer.write(ticket);
}

/** Escape HTML to prevent XSS when printing arbitrary content via document.write */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function printFallback(content: string) {
  if (typeof window === "undefined") return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <html><head><style>
      body { font-family: monospace; font-size: 12px; width: 280px; }
    </style></head><body>${escapeHtml(content)}</body></html>
  `);
  printWindow.document.close();
  printWindow.print();
  printWindow.close();
}
