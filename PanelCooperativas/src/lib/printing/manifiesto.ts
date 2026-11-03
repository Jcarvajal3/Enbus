// ─── Manifiesto del viaje (#52, PC-45) ───────────────────────────────────────
// Hoja imprimible (A4 o carta) para el chofer: pasajeros y encomiendas del bus.
// Se abre en una ventana del navegador en el mismo clic (si no, el navegador la
// bloquea). Devuelve false si la ventana se bloqueó: el llamador muestra
// MSG_VENTANA_BLOQUEADA.

import { escapeHtml } from "@/lib/printing/print-helpers";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { formatCiudad } from "@/lib/ciudades";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { formatFechaHoraVE } from "@/lib/fechas";
import { formatCedula, formatTelefono } from "@/lib/ve";

export { MSG_VENTANA_BLOQUEADA } from "@/lib/printing/print-helpers";

export type PasajeroManifiesto = {
  asiento: string;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  codigo_boleto?: string | null;
  /** Estado del boleto: solo se imprimen PAGADO, USADO y RESERVADO. */
  estado: string;
};

export type EncomiendaManifiesto = {
  tracking_id: string;
  receiver_nombre: string | null;
  receiver_telefono: string | null;
  modalidad_pago?: "ORIGEN" | "DESTINO" | string | null;
  /** USD de referencia. */
  costo_calculado?: number | string | null;
  estado?: string | null;
};

export type DatosManifiesto = {
  cooperativa: string | null | undefined;
  ciudadOrigen: string | null | undefined;
  ciudadDestino: string | null | undefined;
  /** ISO de la salida. */
  salida: string;
  numeroUnidad?: string | null;
  nombreChofer?: string | null;
  pasajeros: PasajeroManifiesto[];
  encomiendas: EncomiendaManifiesto[];
  /** Tasa BCV de hoy para "Cobrar al retirar: Bs …" (sin tasa, se imprime en USD). */
  tasa?: number | null;
};

const ESTADO_PASAJERO: Record<string, string> = {
  PAGADO: "Pagado",
  USADO: "Embarcado",
  RESERVADO: "Apartado",
};

const ENCOMIENDAS_FUERA = new Set(["CANCELADA", "DEVUELTA"]);

const ESTILOS = `
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:12px;color:#000;background:#fff;margin:0;padding:24px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:20px 0 6px}
  .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 24px;margin:8px 0 4px}
  .meta dt{font-weight:600;display:inline} .meta dd{display:inline;margin:0}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#eee} td.num{text-align:center;width:56px;font-weight:600}
  .mono{font-family:ui-monospace,monospace} .vacio{color:#444;font-style:italic}
  .pie{margin-top:32px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
  .firma{border-top:1px solid #000;min-width:240px;padding-top:4px;text-align:center}
  @page{margin:12mm}
`;

/** Orden natural de asientos: "2" antes que "10"; los no numéricos al final. */
function compararAsientos(a: string, b: string) {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

function cobro(e: EncomiendaManifiesto, tasa: number | null | undefined): string {
  if (e.modalidad_pago !== "DESTINO") return "Pagada";
  const usd = Number(e.costo_calculado ?? 0);
  if (!(usd > 0)) return "Cobrar al retirar";
  const monto = tasa && tasa > 0 ? `${formatBs(usdABs(usd, tasa))} (${formatUsd(usd)})` : formatUsd(usd);
  return `Cobrar al retirar: ${monto}`;
}

/** HTML ya escapado del manifiesto. */
export function htmlManifiesto(d: DatosManifiesto, impresoEn: Date = new Date()): string {
  const e = (v: string | null | undefined) => escapeHtml(v ?? "");
  const ruta = `${formatCiudad(d.ciudadOrigen)} → ${formatCiudad(d.ciudadDestino)}`;

  const pasajeros = d.pasajeros
    .filter((p) => p.estado in ESTADO_PASAJERO)
    .sort((a, b) => compararAsientos(a.asiento ?? "", b.asiento ?? ""));
  const encomiendas = d.encomiendas.filter((x) => !ENCOMIENDAS_FUERA.has(x.estado ?? ""));

  const filasPasajeros = pasajeros.length
    ? pasajeros
        .map(
          (p) =>
            `<tr><td class="num">${e(p.asiento)}</td><td>${e(p.pasajero_nombre || "Sin nombre")}</td>` +
            `<td>${e(p.pasajero_cedula ? formatCedula(p.pasajero_cedula) : "Sin cédula")}</td>` +
            `<td class="mono">${e(p.codigo_boleto ? formatCodigoBoleto(p.codigo_boleto) : "")}</td>` +
            `<td>${e(ESTADO_PASAJERO[p.estado])}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="vacio">Sin pasajeros.</td></tr>`;

  const filasEncomiendas = encomiendas.length
    ? encomiendas
        .map(
          (x) =>
            `<tr><td class="mono">${e(x.tracking_id)}</td><td>${e(x.receiver_nombre || "Sin nombre")}</td>` +
            `<td>${e(x.receiver_telefono ? formatTelefono(x.receiver_telefono) : "Sin teléfono")}</td>` +
            `<td>${e(cobro(x, d.tasa))}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="vacio">Sin encomiendas.</td></tr>`;

  return `
    <h1>Manifiesto · ${e(ruta)}</h1>
    <dl class="meta">
      <div><dt>Cooperativa:</dt> <dd>${e(d.cooperativa || "—")}</dd></div>
      <div><dt>Ruta:</dt> <dd>${e(ruta)}</dd></div>
      <div><dt>Salida:</dt> <dd>${e(formatFechaHoraVE(d.salida))}</dd></div>
      <div><dt>Unidad:</dt> <dd>${e(d.numeroUnidad || "Sin asignar")}</dd></div>
      <div><dt>Chofer:</dt> <dd>${e(d.nombreChofer || "Sin asignar")}</dd></div>
    </dl>
    <h2>Pasajeros (${pasajeros.length})</h2>
    <table>
      <thead><tr><th>Asiento</th><th>Nombre</th><th>Cédula</th><th>Boleto</th><th>Estado</th></tr></thead>
      <tbody>${filasPasajeros}</tbody>
    </table>
    <h2>Encomiendas (${encomiendas.length})</h2>
    <table>
      <thead><tr><th>Código</th><th>Destinatario</th><th>Teléfono</th><th>Cobro</th></tr></thead>
      <tbody>${filasEncomiendas}</tbody>
    </table>
    <div class="pie">
      <p>Impreso el ${e(formatFechaHoraVE(impresoEn))}</p>
      <p class="firma">Firma del chofer</p>
    </div>`;
}

/** Abre la ventana de impresión con el manifiesto. false si el navegador la bloqueó. */
export function imprimirManifiesto(d: DatosManifiesto): boolean {
  if (typeof window === "undefined") return false;
  const ventana = window.open("", "_blank", "width=900,height=700");
  if (!ventana) return false;
  const titulo = `Manifiesto ${formatCiudad(d.ciudadOrigen)} - ${formatCiudad(d.ciudadDestino)}`;
  ventana.document.write(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title>` +
      `<style>${ESTILOS}</style></head><body>${htmlManifiesto(d)}</body></html>`
  );
  ventana.document.close();
  ventana.addEventListener("afterprint", () => ventana.close());
  ventana.focus();
  ventana.print();
  return true;
}
