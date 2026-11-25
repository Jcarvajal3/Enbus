// ─── Compra en curso guardada en sessionStorage ──────────────────────────────
// Una entrada por viaje: sobrevive a recargar la pestaña (mismo `compra_id`, misma clave de
// idempotencia, asientos y pasajeros escritos) y se borra al terminar. Solo es una comodidad:
// todo se envuelve en try/catch (modo privado, almacenamiento bloqueado) y el flujo funciona sin él.

import type { DatosPasajero } from "@/components/boletos/venta/tipos";
import type { ResultadoCompra } from "./tipos";

const PREFIJO = "enbus:compra-boleto:v1:";
const PREFIJO_LISTO = "enbus:compra-boleto-listo:v1:";

export interface CompraGuardada {
  compraId: string;
  /** Clave de idempotencia del intento de pago actual. */
  clave: string;
  /** Asientos que se apartaron (vacío si todavía no se reservó). */
  asientos: string[];
  /** Datos escritos por asiento. */
  pasajeros: Record<string, DatosPasajero>;
  /** `fn_asignar_pasajeros` ya se guardó para estos asientos. */
  pasajerosGuardados: boolean;
}

const esTexto = (v: unknown): v is string => typeof v === "string";

function leerJson(clave: string): unknown {
  try {
    const crudo = window.sessionStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as unknown) : null;
  } catch {
    return null;
  }
}

function escribirJson(clave: string, valor: unknown) {
  try {
    window.sessionStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: el flujo sigue, solo no sobrevive a recargar */
  }
}

function borrar(clave: string) {
  try {
    window.sessionStorage.removeItem(clave);
  } catch {
    /* nada */
  }
}

export function leerCompra(viajeId: string): CompraGuardada | null {
  const v = leerJson(PREFIJO + viajeId);
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!esTexto(o.compraId) || !esTexto(o.clave)) return null;
  const asientos = Array.isArray(o.asientos) ? o.asientos.filter(esTexto) : [];
  const pasajeros: Record<string, DatosPasajero> = {};
  if (o.pasajeros && typeof o.pasajeros === "object") {
    for (const [asiento, d] of Object.entries(o.pasajeros as Record<string, unknown>)) {
      if (!d || typeof d !== "object") continue;
      const p = d as Record<string, unknown>;
      pasajeros[asiento] = {
        nombre: esTexto(p.nombre) ? p.nombre : "",
        cedula: esTexto(p.cedula) ? p.cedula : "",
        telefono: esTexto(p.telefono) ? p.telefono : "",
      };
    }
  }
  return { compraId: o.compraId, clave: o.clave, asientos, pasajeros, pasajerosGuardados: o.pasajerosGuardados === true };
}

export function guardarCompra(viajeId: string, compra: CompraGuardada) {
  escribirJson(PREFIJO + viajeId, compra);
}

export function borrarCompra(viajeId: string) {
  borrar(PREFIJO + viajeId);
}

/** Resultado de la compra terminada: permite recargar la pantalla "Listo" sin perder los códigos. */
export function leerListo(viajeId: string): ResultadoCompra | null {
  const v = leerJson(PREFIJO_LISTO + viajeId);
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<ResultadoCompra>;
  if (o.modo !== "verificacion" && o.modo !== "taquilla") return null;
  const offsetMs = typeof o.offsetMs === "number" && Number.isFinite(o.offsetMs) ? o.offsetMs : undefined;
  return { modo: o.modo, resumen: o.resumen ?? null, ...(offsetMs !== undefined ? { offsetMs } : {}) };
}

export function guardarListo(viajeId: string, resultado: ResultadoCompra) {
  escribirJson(PREFIJO_LISTO + viajeId, resultado);
}

export function borrarListo(viajeId: string) {
  borrar(PREFIJO_LISTO + viajeId);
}
