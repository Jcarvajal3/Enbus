import { printer } from "./bluetooth";
import { buildTicket } from "./escpos";
import { fechaTasaCorta, formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { formatFechaVE } from "@/lib/fechas";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { formatCedula, formatTelefono } from "@/lib/ve";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { Boleto } from "@/lib/types/boletos";
import type { MonedaPago } from "@/lib/types/pagos";
import { formatCiudad } from "@/lib/ciudades";

// En el ticket ESC/POS no se usan "≈", "→" ni "$" (muchas impresoras térmicas no
// los imprimen): "Total: Bs 1.250,00" / "Ref.: USD 12,40 BCV 02/10". Las tildes
// y la ñ las translitera escpos.ts.

/** Toast cuando el navegador no deja abrir la ventana de impresión. */
export const MSG_VENTANA_BLOQUEADA =
  "Tu navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio e intenta de nuevo.";

/** Datos del cobro para el ticket (de `respuesta.cobro` o del pago del boleto). */
export type CobroBoleto = {
  monto_bs?: number | null;
  monto_usd: number;
  tasa?: number | null;
  tasa_fecha?: string | null;
  moneda?: MonedaPago;
};

/** Viaje del boleto para el ticket. `origen`/`destino` ya legibles ("Caracas"). */
export type ViajeTicket = {
  cooperativa: string;
  origen: string;
  destino: string;
  /** ISO de la salida. */
  salida: string;
  unidad?: string | null;
};

function referenciaUsd(usd: number, tasaFecha?: string | null) {
  return tasaFecha ? `${formatUsd(usd)} BCV ${fechaTasaCorta(tasaFecha)}` : formatUsd(usd);
}

/** "04/10 08:30 a. m." en hora de Venezuela. */
export function salidaTicket(iso: string): string {
  const fecha = formatFechaVE(iso, { day: "2-digit", month: "2-digit" });
  const hora = formatFechaVE(iso, { hour: "2-digit", minute: "2-digit", hour12: true });
  return [fecha, hora].filter(Boolean).join(" ");
}

/** Remitente real: en el alta presencial `sender` es el empleado que la registró. */
function remitenteGuia(e: Encomienda): { nombre: string; cedula: string | null; telefono: string | null } {
  if (e.origen_registro === "TAQUILLA") {
    return {
      nombre: e.remitente_nombre || "",
      cedula: e.remitente_cedula ? formatCedula(e.remitente_cedula) : null,
      telefono: e.remitente_telefono ? formatTelefono(e.remitente_telefono) : null,
    };
  }
  return { nombre: e.sender?.nombre_completo || "", cedula: null, telefono: null };
}

/** Datos extra de la guía: el PIN solo se imprime en la copia para quien envía. */
export type ExtrasGuia = { pin?: string | null; cooperativa?: string | null };

function lineasGuia(encomienda: Encomienda, extras?: ExtrasGuia) {
  const remitente = remitenteGuia(encomienda);
  const lineas: { label: string; value: string }[] = [
    ...(extras?.cooperativa ? [{ label: "Cooperativa", value: extras.cooperativa }] : []),
    { label: "Seguimiento", value: encomienda.tracking_id },
    { label: "Remitente", value: remitente.nombre },
    ...(remitente.cedula ? [{ label: "C.I. remitente", value: remitente.cedula }] : []),
    ...(remitente.telefono ? [{ label: "Tel. remitente", value: remitente.telefono }] : []),
    { label: "Destinatario", value: encomienda.receiver_nombre },
    ...(encomienda.receiver_cedula_rif
      ? [{ label: "C.I. destinatario", value: formatCedula(encomienda.receiver_cedula_rif) }]
      : []),
    { label: "Ruta", value: `${formatCiudad(encomienda.ciudad_origen)} - ${formatCiudad(encomienda.ciudad_destino)}` },
    { label: "Peso", value: encomienda.peso_kg != null ? `${encomienda.peso_kg} kg` : "Por pesar" },
    {
      label: "Costo",
      value: encomienda.costo_calculado != null ? formatUsd(encomienda.costo_calculado) : "Por calcular",
    },
    { label: "Pago", value: MODALIDAD_PAGO[encomienda.modalidad_pago]?.corto ?? "" },
  ];
  if (extras?.pin) lineas.push({ label: "PIN de retiro", value: extras.pin });
  return lineas;
}

const PIE_PIN = "El PIN es para quien recibe: no lo pegues en el paquete.";

/** Guía en la impresora térmica Bluetooth. */
export async function printGuiaEncomienda(encomienda: Encomienda, extras?: ExtrasGuia) {
  const ticket = buildTicket({
    title: "GUÍA DE ENVÍO",
    lines: lineasGuia(encomienda, extras),
    qrData: encomienda.tracking_id,
    footer: extras?.pin ? PIE_PIN : "EnBus - Envíos rápidos y seguros",
  });
  await printer.write(ticket);
}

/**
 * Ticket de boleto. Con `viaje`: Cooperativa, Ruta, Sale y Unidad antes de los
 * datos del pasajero. Con `cobro`: "Total: Bs …" + "Ref.: USD … BCV dd/mm"
 * (pagado en USD: "Total: USD …" + "Ref.: Bs … BCV dd/mm"). Sin cobro: "Precio: USD …".
 * En una venta de varios asientos pasa el monto de ese boleto
 * (`monto_usd: boleto.precio`, `monto_bs: null`, `tasa`, `tasa_fecha`) para que
 * cada ticket muestre su propio precio.
 */
export async function printBoleto(boleto: Boleto, cobro?: CobroBoleto, viaje?: ViajeTicket) {
  const lineas: { label: string; value: string }[] = [];
  if (viaje) {
    if (viaje.cooperativa) lineas.push({ label: "Cooperativa", value: viaje.cooperativa });
    lineas.push({ label: "Ruta", value: `${viaje.origen} - ${viaje.destino}` });
    const sale = salidaTicket(viaje.salida);
    if (sale) lineas.push({ label: "Sale", value: sale });
    if (viaje.unidad) lineas.push({ label: "Unidad", value: viaje.unidad });
  }
  lineas.push(
    { label: "Código", value: boleto.codigo_boleto },
    { label: "Pasajero", value: boleto.pasajero_nombre || "" },
    ...(boleto.pasajero_cedula ? [{ label: "Cédula", value: boleto.pasajero_cedula }] : []),
    { label: "Asiento", value: boleto.asiento }
  );

  if (cobro) {
    const bs =
      cobro.monto_bs ?? (cobro.tasa && cobro.tasa > 0 ? usdABs(cobro.monto_usd, cobro.tasa) : null);
    if (cobro.moneda === "USD") {
      lineas.push({ label: "Total", value: formatUsd(cobro.monto_usd) });
      if (bs != null) {
        lineas.push({
          label: "Ref.",
          value: cobro.tasa_fecha ? `${formatBs(bs)} BCV ${fechaTasaCorta(cobro.tasa_fecha)}` : formatBs(bs),
        });
      }
    } else if (bs != null) {
      lineas.push({ label: "Total", value: formatBs(bs) });
      lineas.push({ label: "Ref.", value: referenciaUsd(cobro.monto_usd, cobro.tasa_fecha) });
    } else {
      lineas.push({ label: "Precio", value: formatUsd(cobro.monto_usd) });
    }
  } else {
    lineas.push({ label: "Precio", value: formatUsd(boleto.precio) });
  }

  const ticket = buildTicket({
    title: "BOLETO DE VIAJE",
    lines: lineas,
    qrData: boleto.qr_embarque_data || undefined,
    footer: "Llega 30 minutos antes con tu cédula",
  });
  await printer.write(ticket);
}

/** Escape HTML to prevent XSS when printing arbitrary content via document.write */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ESTILOS_TICKET = `
  body{font-family:ui-monospace,monospace;font-size:12px;margin:0;padding:8px;color:#000;background:#fff}
  article{width:280px;margin:0 auto 16px;page-break-after:always;border-bottom:1px dashed #999;padding-bottom:12px}
  h1{font-size:14px;text-align:center;margin:0 0 6px}
  dl{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:8px 0} dt{font-weight:bold}
  svg{display:block;margin:8px auto} p{margin:2px 0}
  .pre{white-space:pre-wrap}
`;

/**
 * Abre una ventana solo con `cuerpoHtml` (ya escapado) y la imprime.
 * Devuelve false si el navegador bloqueó la ventana: el llamador muestra
 * `MSG_VENTANA_BLOQUEADA` (nunca se imprime la página entera).
 */
export function imprimirHtml(titulo: string, cuerpoHtml: string): boolean {
  if (typeof window === "undefined") return false;
  const ventana = window.open("", "_blank", "width=420,height=640");
  if (!ventana) return false;
  ventana.document.write(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title><style>${ESTILOS_TICKET}</style></head><body>${cuerpoHtml}</body></html>`
  );
  ventana.document.close();
  // En algunos navegadores print() no bloquea: cerrar solo cuando termina la impresión.
  ventana.addEventListener("afterprint", () => ventana.close());
  ventana.focus();
  ventana.print();
  return true;
}

/**
 * Abre en una ventana nueva una URL que se obtiene de forma asíncrona (p. ej. la
 * guía en PDF). La ventana se abre en el mismo clic y luego se navega: si se
 * abriera después del `await`, Safari y Chrome (tras unos segundos) la bloquean.
 * - "abierta": se abrió la URL.
 * - "bloqueada": el navegador no dejó abrir la ventana (mostrar MSG_VENTANA_BLOQUEADA).
 * - "sin-url": `obtener` no devolvió URL (la ventana provisional se cierra).
 * Si `obtener` lanza, se cierra la ventana provisional y se relanza el error.
 */
export async function abrirUrlAsincrona(
  obtener: () => Promise<string | null>
): Promise<"abierta" | "bloqueada" | "sin-url"> {
  const ventana = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (ventana) {
    try {
      ventana.opener = null;
      ventana.document.title = "Preparando…";
      ventana.document.body.textContent = "Preparando el documento…";
    } catch {
      // Sin acceso al documento: no importa, solo es el texto de espera.
    }
  }
  let url: string | null;
  try {
    url = await obtener();
  } catch (err) {
    ventana?.close();
    throw err;
  }
  if (!url) {
    ventana?.close();
    return "sin-url";
  }
  if (ventana && !ventana.closed) {
    ventana.location.href = url;
    return "abierta";
  }
  return window.open(url, "_blank") ? "abierta" : "bloqueada";
}

/** Guía en una ventana del navegador (sin impresora térmica). false si se bloqueó la ventana. */
export function imprimirGuiaNavegador(encomienda: Encomienda, extras?: ExtrasGuia): boolean {
  const filas = lineasGuia(encomienda, extras)
    .map((l) => `<dt>${escapeHtml(l.label)}</dt><dd>${escapeHtml(l.value)}</dd>`)
    .join("");
  const pie = extras?.pin ? `<p>${escapeHtml(PIE_PIN)}</p>` : "";
  return imprimirHtml(
    `Guía ${encomienda.tracking_id}`,
    `<article><h1>Guía de envío</h1><dl>${filas}</dl>${pie}</article>`
  );
}

/** Texto plano en una ventana de impresión. false si se bloqueó la ventana. */
export function printFallback(content: string): boolean {
  return imprimirHtml("Impresión", `<article class="pre">${escapeHtml(content)}</article>`);
}
