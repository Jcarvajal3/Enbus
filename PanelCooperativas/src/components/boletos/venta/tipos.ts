// ─── Venta de boletos en taquilla: tipos y reglas compartidas ────────────────
// Lo que usan los pasos de `/cooperativas/taquilla/boletos/vender` y la página de
// cobro de una reserva: forma de los viajes, pasos, validación de pasajeros,
// claves de idempotencia y textos.

import { CEDULA_ERROR, TELEFONO_ERROR, cedulaParaGuardar, cedulaValida, telefonoParaGuardar, telefonoValido } from "@/lib/ve";
import { humanizeError } from "@/lib/errores";
import { formatCiudad } from "@/lib/ciudades";
import { formatFechaHoraCortaVE } from "@/lib/fechas";
import { listaAsientos } from "../seat-selector";

export interface ViajeParaVenta {
  id: string;
  ruta_id: string;
  fecha_hora_salida: string;
  fecha_hora_llegada_est: string;
  asientos_totales: number;
  asientos_disponibles: number;
  estado: string;
  numero_unidad: string;
  nombre_chofer: string | null;
  ruta: {
    ciudad_origen: string;
    estado_origen: string;
    ciudad_destino: string;
    estado_destino: string;
    precio_pasaje: number;
  };
}

export type DatosPasajero = { nombre: string; cedula: string; telefono: string };

export const PASAJERO_VACIO: DatosPasajero = { nombre: "", cedula: "", telefono: "" };

// ─── Pasos ───────────────────────────────────────────────────────────────────

export const PASOS_VENTA = ["salida", "asientos", "pasajeros", "pago"] as const;
export type PasoVenta = (typeof PASOS_VENTA)[number];

/** Mismos títulos y orden que la app (`boletos/buscar`), en voz del operador. */
export const TITULOS_PASO: Record<PasoVenta, string> = {
  salida: "Elige la salida",
  asientos: "Elige los asientos",
  pasajeros: "¿Quién viaja?",
  pago: "¿Cómo pagó?",
};

/** Máximo de asientos por venta (lo mismo que acepta el servidor). */
export const MAX_ASIENTOS_VENTA = 10;

// ─── Reglas ──────────────────────────────────────────────────────────────────

export type ErroresPasajero = { nombre: string | null; cedula: string | null; telefono: string | null };

export function erroresPasajero(p: DatosPasajero | undefined): ErroresPasajero {
  const d = p ?? PASAJERO_VACIO;
  return {
    nombre: d.nombre.trim().length < 3 ? "Escribe el nombre y apellido de quien viaja." : null,
    cedula: cedulaValida(d.cedula) ? null : CEDULA_ERROR,
    telefono: d.telefono.trim() && !telefonoValido(d.telefono) ? TELEFONO_ERROR : null,
  };
}

export function pasajeroValido(p: DatosPasajero | undefined): boolean {
  const e = erroresPasajero(p);
  return !e.nombre && !e.cedula && !e.telefono;
}

/** Datos del pasajero como se guardan ("V-12345678", "0414-1234567"). */
export function pasajeroParaGuardar(asiento: string, p: DatosPasajero) {
  return {
    asiento,
    nombre: p.nombre.trim().replace(/\s+/g, " "),
    cedula: cedulaParaGuardar(p.cedula) ?? p.cedula.trim(),
    telefono: p.telefono.trim() ? (telefonoParaGuardar(p.telefono) ?? p.telefono.trim()) : null,
  };
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

export const MSG_SIN_CONEXION = "Esta operación requiere conexión a internet.";

/** Error inesperado (red, servidor) en texto para el usuario, nunca el mensaje técnico. */
export function mensajeExcepcion(err: unknown, accion: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MSG_SIN_CONEXION;
  return humanizeError(err, accion);
}

/** Clave de idempotencia de una operación (una por venta). */
export function nuevaClave() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** "04/11 · 8:00 a. m." en hora de Venezuela. */
export function formatSalidaVenta(iso: string) {
  return formatFechaHoraCortaVE(iso);
}

/** "Caracas → Valencia" */
export function etiquetaRuta(r: { ciudad_origen: string; ciudad_destino: string }) {
  return `${formatCiudad(r.ciudad_origen)} → ${formatCiudad(r.ciudad_destino)}`;
}

/** "Asiento 6" · "Asientos 6 y 7" */
export function etiquetaAsientos(asientos: string[]) {
  return `${asientos.length > 1 ? "Asientos" : "Asiento"} ${listaAsientos(asientos)}`;
}

/** "2 boletos · asientos 3 y 4" */
export function textoAsientos(asientos: string[]) {
  return `${asientos.length === 1 ? "1 boleto" : `${asientos.length} boletos`} · ${
    asientos.length === 1 ? "asiento" : "asientos"
  } ${listaAsientos(asientos)}`;
}

/** Aviso cuando otra persona tomó asientos que se habían elegido. */
export function mensajeAsientosTomados(tomados: string[]) {
  return tomados.length === 1
    ? `El asiento ${tomados[0]} acaba de ser tomado. Elige otro.`
    : `Los asientos ${listaAsientos(tomados)} acaban de ser tomados. Elige otros.`;
}

/** Destino de "Listo" y de la flecha de salida: Embarque (con su bus) o la lista de taquilla. */
export function destinoVolver(volver: string | null, viajeId?: string | null): string {
  if (volver === "embarque") {
    return viajeId ? `/cooperativas/embarque?viaje=${encodeURIComponent(viajeId)}` : "/cooperativas/embarque";
  }
  return "/cooperativas/taquilla/boletos";
}

export const RUTA_VENDER = "/cooperativas/taquilla/boletos/vender";

/** Enlace a la venta de boletos (desde Embarque, con el bus ya elegido). */
export function rutaVender(opciones?: { viajeId?: string | null; volver?: "embarque" }): string {
  const params = new URLSearchParams();
  if (opciones?.viajeId) params.set("viaje", opciones.viajeId);
  if (opciones?.volver) params.set("volver", opciones.volver);
  const q = params.toString();
  return q ? `${RUTA_VENDER}?${q}` : RUTA_VENDER;
}

/** Enlace al cobro de una reserva de la app. */
export function rutaCobrar(compraId: string, volver?: "embarque"): string {
  const base = `/cooperativas/taquilla/boletos/cobrar/${encodeURIComponent(compraId)}`;
  return volver ? `${base}?volver=${volver}` : base;
}
