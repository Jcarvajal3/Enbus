// ─── Ayudas de presentación del área de cuenta (puras) ───────────────────────
// Solo combinan las utilidades existentes (`@/lib/ve`, `@/lib/dinero`, `@/lib/fechas`).

import { formatCiudad } from "@/lib/ciudades";
import type { RutaFila, SucursalFila } from "./tipos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function esUuid(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor);
}

/** Milisegundos actuales (función aparte para que los componentes no llamen `Date.now()` directo). */
export function ahoraMs(): number {
  return Date.now();
}

export function aMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function salidaYaOcurrio(iso: string | null | undefined): boolean {
  const t = aMs(iso);
  return t !== null && t <= ahoraMs();
}

/** "Valencia → Caracas" (o "Ruta por confirmar"). */
export function textoRuta(ruta: RutaFila | null | undefined): string {
  const o = formatCiudad(ruta?.ciudad_origen);
  const d = formatCiudad(ruta?.ciudad_destino);
  if (!o && !d) return "Ruta por confirmar";
  return `${o || "—"} → ${d || "—"}`;
}

/** Orden de asientos como el servidor: por largo y luego alfabético ("2" antes de "10"). */
export function ordenarAsientos(asientos: readonly (string | null)[]): string[] {
  return asientos
    .filter((a): a is string => !!a)
    .sort((a, b) => a.length - b.length || a.localeCompare(b, "es", { numeric: true }));
}

/** ["3","4","7"] → "3, 4 y 7". */
export function unirAsientos(asientos: readonly string[]): string {
  if (asientos.length <= 1) return asientos.join("");
  return `${asientos.slice(0, -1).join(", ")} y ${asientos[asientos.length - 1]}`;
}

/** Suma en centavos (12.1 + 12.2 no da 24.299999…). */
export function sumarUsd(valores: readonly (number | string | null | undefined)[]): number {
  return valores.reduce<number>((s, v) => s + Math.round((Number(v) || 0) * 100), 0) / 100;
}

export interface PuntoDescrito {
  nombre: string;
  completo: string;
  detalle: string | null;
  conocido: boolean;
}

/** Dónde entregar o retirar: la sucursal elegida, la única, o la taquilla en general. */
export function describirPunto(
  lista: SucursalFila[] | null,
  opciones: { preferidaId?: string | null; cooperativa?: string | null; ciudad?: string | null }
): PuntoDescrito {
  const generico = `la taquilla de ${opciones.cooperativa || "la cooperativa"}${
    opciones.ciudad ? ` en ${opciones.ciudad}` : ""
  }`;
  if (!lista || lista.length === 0) return { nombre: generico, completo: generico, detalle: null, conocido: false };
  const preferida = opciones.preferidaId ? lista.find((s) => s.id === opciones.preferidaId) : null;
  const una = preferida ?? (lista.length === 1 ? lista[0] : null);
  if (una) {
    const detalle = [una.horario, una.telefono ? `Tel. ${una.telefono}` : null].filter(Boolean).join(" · ");
    return {
      nombre: una.nombre,
      completo: [una.nombre, una.direccion].filter(Boolean).join(" · "),
      detalle: detalle || null,
      conocido: true,
    };
  }
  const nombres = lista.map((s) => s.nombre);
  const varias = `${nombres.slice(0, -1).join(", ")} o ${nombres[nombres.length - 1]}`;
  return { nombre: varias, completo: varias, detalle: null, conocido: true };
}

// ─── Línea de tiempo de la encomienda ────────────────────────────────────────

export type EtapaId = "CREADA" | "RECIBIDA" | "EN_TRANSITO" | "EN_DESTINO" | "ENTREGADA";

const ETAPAS: readonly { id: EtapaId; etiqueta: string }[] = [
  { id: "CREADA", etiqueta: "Envío creado" },
  { id: "RECIBIDA", etiqueta: "Recibida en taquilla" },
  { id: "EN_TRANSITO", etiqueta: "En camino" },
  { id: "EN_DESTINO", etiqueta: "Lista para retirar" },
  { id: "ENTREGADA", etiqueta: "Entregada" },
];

const ETAPA_DE: Record<string, EtapaId | null> = {
  PENDIENTE_DE_ESCANEO: "CREADA",
  EN_RECEPCION: "RECIBIDA",
  POR_PAGAR: "RECIBIDA",
  PAGADA: "RECIBIDA",
  EN_TRANSITO: "EN_TRANSITO",
  EN_OFICINA_DESTINO: "EN_DESTINO",
  ENTREGADA: "ENTREGADA",
  CANCELADA: null,
  DEVUELTA: null,
};

const CORTE: Record<string, string> = { CANCELADA: "Envío cancelado", DEVUELTA: "Devuelta al remitente" };

export interface PasoTimeline {
  clave: string;
  etiqueta: string;
  fecha: string | null;
  situacion: "completada" | "actual" | "pendiente" | "cortada";
}

/** Etapas del envío según el estado y el historial (port de `getEncomiendaTimeline` de la app). */
export function lineaDeTiempo(
  estado: string,
  historial: readonly { estado_nuevo: string; created_at: string }[],
  creadaAt: string | null
): PasoTimeline[] {
  const indice = (id: EtapaId) => ETAPAS.findIndex((e) => e.id === id);
  const fechas = new Map<EtapaId, string>();
  if (creadaAt) fechas.set("CREADA", creadaAt);
  for (const h of historial) {
    const etapa = ETAPA_DE[h.estado_nuevo];
    if (etapa && !fechas.has(etapa)) fechas.set(etapa, h.created_at);
  }
  let masLejana = 0;
  for (const h of historial) {
    const etapa = ETAPA_DE[h.estado_nuevo];
    if (etapa) masLejana = Math.max(masLejana, indice(etapa));
  }

  const etapaActual = ETAPA_DE[estado];
  if (etapaActual === null) {
    const corte = [...historial].reverse().find((h) => h.estado_nuevo === estado);
    return [
      ...ETAPAS.slice(0, masLejana + 1).map((e) => ({
        clave: e.id,
        etiqueta: e.etiqueta,
        fecha: fechas.get(e.id) ?? null,
        situacion: "completada" as const,
      })),
      { clave: "CORTE", etiqueta: CORTE[estado] ?? "Cerrada", fecha: corte?.created_at ?? null, situacion: "cortada" },
    ];
  }

  const actual = etapaActual ? indice(etapaActual) : masLejana;
  const entregada = estado === "ENTREGADA";
  return ETAPAS.map((e, i) => ({
    clave: e.id,
    etiqueta: e.etiqueta,
    fecha: i <= actual ? (fechas.get(e.id) ?? null) : null,
    situacion:
      i < actual || (entregada && i === actual) ? "completada" : i === actual ? "actual" : "pendiente",
  }));
}
