// ─── Rutas del área del pasajero (sitio público) ─────────────────────────────
// Única fuente de las URL del pasajero: portada, búsqueda, compra, encomiendas y cuenta.
// Plan: Specs/05_Web_Landing_Page/Compra_Web_Pasajero.md

export const RUTAS_PASAJERO = {
  inicio: "/",
  viajes: "/viajes",
  enviar: "/enviar",
  ingresar: "/ingresar",
  crearCuenta: "/crear-cuenta",
  recuperarClave: "/recuperar-clave",
  restablecerClave: "/restablecer-clave",
  authCallback: "/auth/callback",
  cuenta: "/cuenta",
  misBoletos: "/cuenta/boletos",
  misEncomiendas: "/cuenta/encomiendas",
  configuracion: "/cuenta/configuracion",
} as const;

/** Prefijos que exigen sesión de pasajero (el proxy redirige a /ingresar?next=…). */
export const PREFIJOS_CON_SESION = ["/cuenta", "/comprar"] as const;

function conQuery(base: string, params: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== null && valor !== undefined && valor !== "") q.set(clave, String(valor));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** `/viajes?origen=&destino=&fecha=` (fecha `YYYY-MM-DD` en America/Caracas). */
export function urlViajes(p: { origen?: string | null; destino?: string | null; fecha?: string | null }) {
  return conQuery(RUTAS_PASAJERO.viajes, { origen: p.origen, destino: p.destino, fecha: p.fecha });
}

/** Compra de boletos de un viaje, opcionalmente en un paso. */
export function urlComprarBoleto(viajeId: string, paso?: "asientos" | "pasajeros" | "pago" | "listo") {
  return conQuery(`/comprar/boleto/${encodeURIComponent(viajeId)}`, { paso });
}

/** `/enviar?origen=&destino=&peso=` */
export function urlEnviar(p: { origen?: string | null; destino?: string | null; peso?: number | string | null } = {}) {
  return conQuery(RUTAS_PASAJERO.enviar, { origen: p.origen, destino: p.destino, peso: p.peso });
}

export function urlBoleto(id: string) {
  return `${RUTAS_PASAJERO.misBoletos}/${encodeURIComponent(id)}`;
}

export function urlEncomienda(id: string) {
  return `${RUTAS_PASAJERO.misEncomiendas}/${encodeURIComponent(id)}`;
}

/**
 * true si `next` es una ruta interna segura del sitio del pasajero: relativa, sin
 * protocolo ni `//`, y fuera del panel (/cooperativas/…) y del admin.
 */
export function nextSeguro(next: string | null | undefined): string | null {
  if (!next || next.length > 2048 || !next.startsWith("/") || next.startsWith("//")) return null;
  // Tab, salto de línea y otros controles los quita el parser de URL ("/\t/evil.com" → "//evil.com").
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;
  try {
    if (new URL(next, "http://enbus.local").origin !== "http://enbus.local") return null;
  } catch {
    return null;
  }
  const ruta = next.split(/[?#]/)[0];
  if (ruta.startsWith("/admin") || (ruta.startsWith("/cooperativas/") && ruta !== "/cooperativas/")) return null;
  return next;
}

/** `/ingresar?next=…` (o `/ingresar` si `next` no es seguro). */
export function urlIngresar(next?: string | null) {
  return conQuery(RUTAS_PASAJERO.ingresar, { next: nextSeguro(next) });
}

export function urlCrearCuenta(next?: string | null) {
  return conQuery(RUTAS_PASAJERO.crearCuenta, { next: nextSeguro(next) });
}
