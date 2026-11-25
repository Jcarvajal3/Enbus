// ─── Utilidades puras de la búsqueda de pasajes (servidor y cliente) ─────────
// Parseo de los parámetros de /viajes, franjas horarias, orden y filtros. Sin acceso a
// datos: los tipos vienen de `lib/pasajero/viajes.ts` (solo como tipo).

import { hoyVE, normalizarCiudad, sumarDiasVE, ZONA_VE } from "@/lib/ve.generated";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import type { ViajeResumen } from "@/lib/pasajero/viajes";

/** Cuántos días hacia adelante se puede buscar. */
export const DIAS_MAXIMOS = 90;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Orden = "hora" | "precio" | "duracion";
export type Franja = "madrugada" | "manana" | "tarde" | "noche";

export const ORDENES: { id: Orden; etiqueta: string }[] = [
  { id: "hora", etiqueta: "Más temprano" },
  { id: "precio", etiqueta: "Más barato" },
  { id: "duracion", etiqueta: "Más rápido" },
];

export const FRANJAS: { id: Franja; etiqueta: string; rango: string }[] = [
  { id: "madrugada", etiqueta: "Madrugada", rango: "12:00 a. m. a 5:59 a. m." },
  { id: "manana", etiqueta: "Mañana", rango: "6:00 a. m. a 11:59 a. m." },
  { id: "tarde", etiqueta: "Tarde", rango: "12:00 p. m. a 5:59 p. m." },
  { id: "noche", etiqueta: "Noche", rango: "6:00 p. m. a 11:59 p. m." },
];

export interface ParametrosBusqueda {
  origen: string;
  destino: string;
  /** 'YYYY-MM-DD' dentro de [hoy, hoy + DIAS_MAXIMOS]. */
  fecha: string;
  /** true si la URL traía una fecha válida (si no, se usó hoy). */
  fechaExplicita: boolean;
  orden: Orden;
  cooperativas: string[];
  franjas: Franja[];
}

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function lista(v: string | string[] | undefined): string[] {
  const crudo = Array.isArray(v) ? v : [v ?? ""];
  return crudo
    .flatMap((x) => x.split(","))
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Lee `origen`, `destino`, `fecha`, `orden`, `coop` y `franja` de la URL; nunca lanza. */
export function leerParametros(sp: Record<string, string | string[] | undefined>): ParametrosBusqueda {
  const hoy = hoyVE();
  const tope = sumarDiasVE(hoy, DIAS_MAXIMOS);
  const f = primero(sp.fecha).trim();
  const fechaValida = FECHA_RE.test(f) && f >= hoy && f <= tope && sumarDiasVE(f, 0) === f;
  const orden = primero(sp.orden);
  const franjasValidas = new Set<string>(FRANJAS.map((x) => x.id));
  return {
    origen: normalizarCiudad(primero(sp.origen)),
    destino: normalizarCiudad(primero(sp.destino)),
    fecha: fechaValida ? f : hoy,
    fechaExplicita: fechaValida,
    orden: orden === "precio" || orden === "duracion" ? orden : "hora",
    cooperativas: lista(sp.coop),
    franjas: lista(sp.franja).filter((x): x is Franja => franjasValidas.has(x)),
  };
}

/** Hora (0-23) de la salida en America/Caracas. */
function horaVE(iso: string): number {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_VE, hour: "2-digit", hourCycle: "h23" }).format(
    new Date(iso)
  );
  return Number(partes) % 24;
}

export function franjaDe(iso: string): Franja {
  const h = horaVE(iso);
  return h < 6 ? "madrugada" : h < 12 ? "manana" : h < 18 ? "tarde" : "noche";
}

export function aplicarFiltros(
  viajes: readonly ViajeResumen[],
  filtros: { cooperativas: readonly string[]; franjas: readonly Franja[] }
): ViajeResumen[] {
  return viajes.filter(
    (v) =>
      (filtros.cooperativas.length === 0 || filtros.cooperativas.includes(v.cooperativa.id)) &&
      (filtros.franjas.length === 0 || filtros.franjas.includes(franjaDe(v.salida)))
  );
}

export function ordenarViajes(viajes: readonly ViajeResumen[], orden: Orden): ViajeResumen[] {
  const porHora = (a: ViajeResumen, b: ViajeResumen) => a.salida.localeCompare(b.salida);
  const copia = [...viajes];
  if (orden === "precio") return copia.sort((a, b) => a.precioUsd - b.precioUsd || porHora(a, b));
  if (orden === "duracion") {
    // Sin duración conocida, al final.
    const d = (v: ViajeResumen) => (v.duracionMin > 0 ? v.duracionMin : Number.MAX_SAFE_INTEGER);
    return copia.sort((a, b) => d(a) - d(b) || porHora(a, b));
  }
  return copia.sort(porHora);
}

/** "1 salida" / "8 salidas". */
export function textoSalidas(n: number): string {
  return n === 1 ? "1 salida" : `${n} salidas`;
}

/** Con 5 o menos asientos libres se avisa "Quedan N" (igual que la app). */
export const POCOS_ASIENTOS = 5;

/** `/viajes?…` con la búsqueda actual y los cambios que se pidan (omite lo que está por defecto). */
export function urlBusqueda(base: Partial<Omit<ParametrosBusqueda, "fechaExplicita">>): string {
  const q = new URLSearchParams();
  if (base.origen) q.set("origen", base.origen);
  if (base.destino) q.set("destino", base.destino);
  if (base.fecha) q.set("fecha", base.fecha);
  if (base.orden && base.orden !== "hora") q.set("orden", base.orden);
  if (base.cooperativas?.length) q.set("coop", base.cooperativas.join(","));
  if (base.franjas?.length) q.set("franja", base.franjas.join(","));
  const texto = q.toString();
  return texto ? `${RUTAS_PASAJERO.viajes}?${texto}` : RUTAS_PASAJERO.viajes;
}
