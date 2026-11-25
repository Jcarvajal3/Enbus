import "server-only";

// ─── Búsqueda pública de viajes (SOLO SERVIDOR) ──────────────────────────────
// `viajes` y `rutas` son solo para `authenticated`: se leen con el cliente de service role
// seleccionando únicamente columnas públicas (nunca chofer, placa ni datos de pasajeros).
// Mismos filtros que la app (EnBusApp/app/boletos/buscar.tsx): viaje PROGRAMADO con
// asientos, ruta activa con precio, cooperativa ACTIVA y salida futura. Ninguna función
// lanza: ante un error se registra y se devuelve [] / null. Resultados con caché corta.

import { unstable_cache } from "next/cache";

import type { TasaRef } from "@/lib/dinero.generated";
import { supabaseSitio, tasaBCV } from "@/lib/sitio/consultas";
import { fechaVE, normalizarCiudad, rangoDiaVE, sumarDiasVE } from "@/lib/ve.generated";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CooperativaViaje {
  id: string;
  nombre: string;
  logoUrl: string | null;
  /** 0 si aún no tiene calificaciones. */
  calificacion: number;
}

export interface ViajeResumen {
  id: string;
  /** ISO (UTC) de la salida. */
  salida: string;
  /** ISO de la llegada estimada, o null si no se conoce. */
  llegada: string | null;
  /** Días de calendario (hora de Venezuela) entre la salida y la llegada (0 = el mismo día). */
  diasLlegada: number;
  /** 0 si no se conoce. */
  duracionMin: number;
  /** Claves de ciudad ("puerto_la_cruz"); se muestran con `formatCiudad`. */
  origen: string;
  destino: string;
  terminalOrigen: string | null;
  terminalDestino: string | null;
  precioUsd: number;
  asientosDisponibles: number;
  asientosTotales: number;
  cooperativa: CooperativaViaje;
}

/** Detalle público de un viaje para el flujo de compra. */
export interface ViajePublico extends ViajeResumen {
  /** true si todavía se pueden apartar asientos (programado, con asientos, ruta y cooperativa activas, aún no sale). */
  vendible: boolean;
  estado: string;
}

export interface CiudadesConSalidas {
  /** Claves de ciudad con salidas, ordenadas por nombre. */
  origenes: string[];
  destinos: string[];
  /** origen → destinos que tienen salidas desde ese origen. */
  destinosPorOrigen: Record<string, string[]>;
}

export interface DiaConSalidas {
  /** 'YYYY-MM-DD' (America/Caracas). */
  fecha: string;
  salidas: number;
  /** Precio mínimo en USD de ese día. */
  precioMinUsd: number;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const CACHE_SEGUNDOS = 90;

type Fila = Record<string, unknown>;

function uno(v: unknown): Fila | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x && typeof x === "object" ? (x as Fila) : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function diasEntre(desdeIso: string, hastaIso: string): number {
  const a = Date.parse(`${fechaVE(desdeIso)}T00:00:00Z`);
  const b = Date.parse(`${fechaVE(hastaIso)}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, Math.round((b - a) / 86_400_000));
}

const COLUMNAS_RESUMEN = `id, fecha_hora_salida, fecha_hora_llegada_est, asientos_disponibles, asientos_totales,
  rutas!inner ( ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje, terminal_origen, terminal_destino ),
  cooperativas!inner ( id, nombre, calificacion_promedio, logo_url )`;

function aResumen(fila: Fila): ViajeResumen | null {
  const ruta = uno(fila.rutas);
  const coop = uno(fila.cooperativas);
  const id = txt(fila.id);
  const salida = txt(fila.fecha_hora_salida);
  const salidaMs = salida ? Date.parse(salida) : NaN;
  if (!ruta || !id || !salida || Number.isNaN(salidaMs)) return null;

  const minutosRuta = num(ruta.duracion_estimada_min);
  const llegadaDb = txt(fila.fecha_hora_llegada_est);
  // La fuente de verdad es `rutas.duracion_estimada_min`: la llegada es salida + esa duración.
  // Solo si la ruta no la tiene se usa la llegada estimada guardada en el viaje.
  const llegadaDbMs = llegadaDb ? Date.parse(llegadaDb) : NaN;
  const llegadaMs = minutosRuta > 0 ? salidaMs + minutosRuta * 60_000 : llegadaDbMs;
  const llegada = Number.isNaN(llegadaMs) ? null : new Date(llegadaMs).toISOString();
  const duracionMin =
    minutosRuta > 0 ? Math.round(minutosRuta) : llegada && llegadaMs > salidaMs ? Math.round((llegadaMs - salidaMs) / 60_000) : 0;

  return {
    id,
    salida,
    llegada,
    diasLlegada: llegada ? diasEntre(salida, llegada) : 0,
    duracionMin,
    origen: String(ruta.ciudad_origen ?? ""),
    destino: String(ruta.ciudad_destino ?? ""),
    terminalOrigen: txt(ruta.terminal_origen),
    terminalDestino: txt(ruta.terminal_destino),
    precioUsd: num(ruta.precio_pasaje),
    asientosDisponibles: num(fila.asientos_disponibles),
    asientosTotales: num(fila.asientos_totales),
    cooperativa: {
      id: String(coop?.id ?? ""),
      nombre: txt(coop?.nombre) ?? "Cooperativa",
      logoUrl: txt(coop?.logo_url),
      calificacion: num(coop?.calificacion_promedio),
    },
  };
}

function aResumenes(data: unknown): ViajeResumen[] {
  if (!Array.isArray(data)) return [];
  return (data as Fila[]).map(aResumen).filter((v): v is ViajeResumen => v !== null && v.precioUsd > 0);
}

// ─── Consultas (sin caché) ───────────────────────────────────────────────────

async function leerCiudadesConSalidas(): Promise<CiudadesConSalidas> {
  const vacio: CiudadesConSalidas = { origenes: [], destinos: [], destinosPorOrigen: {} };
  const supabase = supabaseSitio();
  if (!supabase) return vacio;
  try {
    const { data, error } = await supabase
      .from("viajes")
      .select("rutas!inner ( ciudad_origen, ciudad_destino ), cooperativas!inner ( estado )")
      .eq("estado", "PROGRAMADO")
      .gt("asientos_disponibles", 0)
      .eq("rutas.activa", true)
      .gt("rutas.precio_pasaje", 0)
      .eq("cooperativas.estado", "ACTIVA")
      .gt("fecha_hora_salida", new Date().toISOString())
      .limit(2000);
    if (error) {
      console.error("No se pudieron leer las ciudades con salidas:", error.message);
      return vacio;
    }
    const pares = new Map<string, Set<string>>();
    for (const fila of (data ?? []) as Fila[]) {
      const ruta = uno(fila.rutas);
      const o = normalizarCiudad(String(ruta?.ciudad_origen ?? ""));
      const d = normalizarCiudad(String(ruta?.ciudad_destino ?? ""));
      if (!o || !d || o === d) continue;
      if (!pares.has(o)) pares.set(o, new Set());
      pares.get(o)!.add(d);
    }
    const ordenar = (xs: Iterable<string>) => [...xs].sort((a, b) => a.localeCompare(b, "es"));
    const destinosPorOrigen: Record<string, string[]> = {};
    const todosDestinos = new Set<string>();
    for (const [o, ds] of pares) {
      destinosPorOrigen[o] = ordenar(ds);
      ds.forEach((d) => todosDestinos.add(d));
    }
    return { origenes: ordenar(pares.keys()), destinos: ordenar(todosDestinos), destinosPorOrigen };
  } catch (err) {
    console.error("No se pudieron leer las ciudades con salidas:", err);
    return vacio;
  }
}

async function leerViajes(origen: string, destino: string, fecha: string): Promise<ViajeResumen[]> {
  const supabase = supabaseSitio();
  if (!supabase) return [];
  try {
    const { desde, hasta } = rangoDiaVE(fecha);
    const ahora = new Date().toISOString();
    const { data, error } = await supabase
      .from("viajes")
      .select(COLUMNAS_RESUMEN)
      .eq("estado", "PROGRAMADO")
      .gt("asientos_disponibles", 0)
      .eq("rutas.ciudad_origen", origen)
      .eq("rutas.ciudad_destino", destino)
      .eq("rutas.activa", true)
      .gt("rutas.precio_pasaje", 0)
      .eq("cooperativas.estado", "ACTIVA")
      // Hoy: solo las que aún no salieron.
      .gt("fecha_hora_salida", desde > ahora ? desde : ahora)
      .lte("fecha_hora_salida", hasta)
      .order("fecha_hora_salida", { ascending: true })
      .limit(200);
    if (error) {
      console.error("No se pudieron buscar los viajes:", error.message);
      return [];
    }
    return aResumenes(data);
  } catch (err) {
    console.error("No se pudieron buscar los viajes:", err);
    return [];
  }
}

async function leerDias(origen: string, destino: string, desde: string, dias: number): Promise<DiaConSalidas[]> {
  const supabase = supabaseSitio();
  if (!supabase) return [];
  try {
    const inicio = rangoDiaVE(desde).desde;
    const fin = rangoDiaVE(sumarDiasVE(desde, Math.max(dias, 1) - 1)).hasta;
    const ahora = new Date().toISOString();
    const { data, error } = await supabase
      .from("viajes")
      .select("fecha_hora_salida, rutas!inner ( ciudad_origen, ciudad_destino, precio_pasaje ), cooperativas!inner ( estado )")
      .eq("estado", "PROGRAMADO")
      .gt("asientos_disponibles", 0)
      .eq("rutas.ciudad_origen", origen)
      .eq("rutas.ciudad_destino", destino)
      .eq("rutas.activa", true)
      .gt("rutas.precio_pasaje", 0)
      .eq("cooperativas.estado", "ACTIVA")
      .gt("fecha_hora_salida", inicio > ahora ? inicio : ahora)
      .lte("fecha_hora_salida", fin)
      .order("fecha_hora_salida", { ascending: true })
      .limit(1000);
    if (error) {
      console.error("No se pudieron leer los días con salidas:", error.message);
      return [];
    }
    const porDia = new Map<string, DiaConSalidas>();
    for (const fila of (data ?? []) as Fila[]) {
      const salida = txt(fila.fecha_hora_salida);
      const precio = num(uno(fila.rutas)?.precio_pasaje);
      if (!salida || precio <= 0) continue;
      const fecha = fechaVE(salida);
      const actual = porDia.get(fecha);
      if (actual) {
        actual.salidas += 1;
        actual.precioMinUsd = Math.min(actual.precioMinUsd, precio);
      } else {
        porDia.set(fecha, { fecha, salidas: 1, precioMinUsd: precio });
      }
    }
    return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  } catch (err) {
    console.error("No se pudieron leer los días con salidas:", err);
    return [];
  }
}

async function leerProximas(limite: number, origen: string): Promise<ViajeResumen[]> {
  const supabase = supabaseSitio();
  if (!supabase) return [];
  try {
    let consulta = supabase
      .from("viajes")
      .select(COLUMNAS_RESUMEN)
      .eq("estado", "PROGRAMADO")
      .gt("asientos_disponibles", 0)
      .eq("rutas.activa", true)
      .gt("rutas.precio_pasaje", 0)
      .eq("cooperativas.estado", "ACTIVA")
      .gt("fecha_hora_salida", new Date().toISOString());
    if (origen) consulta = consulta.eq("rutas.ciudad_origen", origen);
    const { data, error } = await consulta.order("fecha_hora_salida", { ascending: true }).limit(limite);
    if (error) {
      console.error("No se pudieron leer las próximas salidas:", error.message);
      return [];
    }
    return aResumenes(data);
  } catch (err) {
    console.error("No se pudieron leer las próximas salidas:", err);
    return [];
  }
}

async function leerViaje(id: string): Promise<ViajePublico | null> {
  const supabase = supabaseSitio();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("viajes")
      .select(
        `estado, id, fecha_hora_salida, fecha_hora_llegada_est, asientos_disponibles, asientos_totales,
         rutas!inner ( activa, ciudad_origen, ciudad_destino, duracion_estimada_min, precio_pasaje, terminal_origen, terminal_destino ),
         cooperativas!inner ( id, estado, nombre, calificacion_promedio, logo_url )`
      )
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("No se pudo leer el viaje:", error.message);
      return null;
    }
    if (!data) return null;
    const fila = data as unknown as Fila;
    const resumen = aResumen(fila);
    if (!resumen) return null;
    const ruta = uno(fila.rutas);
    const coop = uno(fila.cooperativas);
    const estado = String(fila.estado ?? "");
    const vendible =
      estado === "PROGRAMADO" &&
      resumen.asientosDisponibles > 0 &&
      ruta?.activa === true &&
      coop?.estado === "ACTIVA" &&
      Date.parse(resumen.salida) > Date.now();
    return { ...resumen, estado, vendible };
  } catch (err) {
    console.error("No se pudo leer el viaje:", err);
    return null;
  }
}

// ─── API pública (con caché corta) ───────────────────────────────────────────

const cacheCiudades = unstable_cache(leerCiudadesConSalidas, ["pasajero:ciudades"], { revalidate: 120 });
const cacheViajes = unstable_cache(leerViajes, ["pasajero:viajes"], { revalidate: CACHE_SEGUNDOS });
const cacheDias = unstable_cache(leerDias, ["pasajero:dias"], { revalidate: 120 });
const cacheProximas = unstable_cache(leerProximas, ["pasajero:proximas"], { revalidate: CACHE_SEGUNDOS });
const cacheTasa = unstable_cache(async () => tasaBCV(), ["pasajero:tasa"], { revalidate: 120 });
const cacheViaje = unstable_cache(leerViaje, ["pasajero:viaje"], { revalidate: 60 });

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function clave(v: string | null | undefined): string {
  return normalizarCiudad(v);
}

/** Ciudades con salidas vigentes (para el autocompletado) y a qué destinos se llega desde cada una. */
export async function ciudadesConSalidas(): Promise<CiudadesConSalidas> {
  try {
    return await cacheCiudades();
  } catch (err) {
    console.error("No se pudieron leer las ciudades con salidas:", err);
    return { origenes: [], destinos: [], destinosPorOrigen: {} };
  }
}

/** Salidas de un día (America/Caracas, 'YYYY-MM-DD') entre dos ciudades, de la más temprana a la más tarde. */
export async function buscarViajes(p: { origen: string; destino: string; fecha: string }): Promise<ViajeResumen[]> {
  const origen = clave(p.origen);
  const destino = clave(p.destino);
  if (!origen || !destino || origen === destino || !FECHA_RE.test(p.fecha)) return [];
  try {
    return await cacheViajes(origen, destino, p.fecha);
  } catch (err) {
    console.error("No se pudieron buscar los viajes:", err);
    return [];
  }
}

/** Por día, desde `desde` y durante `dias` días: nº de salidas y precio mínimo (solo días con salidas). */
export async function diasConSalidas(p: {
  origen: string;
  destino: string;
  desde: string;
  dias: number;
}): Promise<DiaConSalidas[]> {
  const origen = clave(p.origen);
  const destino = clave(p.destino);
  if (!origen || !destino || origen === destino || !FECHA_RE.test(p.desde)) return [];
  const dias = Math.min(Math.max(Math.floor(p.dias) || 1, 1), 60);
  try {
    return await cacheDias(origen, destino, p.desde, dias);
  } catch (err) {
    console.error("No se pudieron leer los días con salidas:", err);
    return [];
  }
}

/**
 * Las salidas más cercanas de cualquier ruta (o solo desde `origen`), con variedad: primero la
 * próxima salida de cada ruta distinta (origen → destino + cooperativa), por hora; solo después
 * se repiten rutas para completar el límite.
 */
export async function proximasSalidas(p: { limite?: number; origen?: string | null } = {}): Promise<ViajeResumen[]> {
  const limite = Math.min(Math.max(Math.floor(p.limite ?? 12) || 12, 1), 60);
  try {
    // Se lee de más: una sola ruta frecuente podría llenar el límite con días seguidos.
    const filas = await cacheProximas(Math.min(limite * 15, 300), clave(p.origen));
    const vistas = new Set<string>();
    const primeras: ViajeResumen[] = [];
    const repetidas: ViajeResumen[] = [];
    for (const v of filas) {
      const ruta = `${normalizarCiudad(v.origen)}>${normalizarCiudad(v.destino)}|${v.cooperativa.id}`;
      if (vistas.has(ruta)) repetidas.push(v);
      else {
        vistas.add(ruta);
        primeras.push(v);
      }
    }
    // `filas` ya viene por hora: cada grupo conserva ese orden y las repetidas van al final.
    return [...primeras, ...repetidas].slice(0, limite);
  } catch (err) {
    console.error("No se pudieron leer las próximas salidas:", err);
    return [];
  }
}

/** Detalle público de un viaje (null si no existe o no hay configuración). Revisa `vendible` antes de ofrecer asientos. */
export async function viajePublico(id: string): Promise<ViajePublico | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  try {
    return await cacheViaje(id);
  } catch (err) {
    console.error("No se pudo leer el viaje:", err);
    return null;
  }
}

/** Tasa BCV vigente con caché corta (para mostrar Bs en las listas); null si no hay. */
export async function tasaVigente(): Promise<TasaRef | null> {
  try {
    return await cacheTasa();
  } catch (err) {
    console.error("No se pudo leer la tasa BCV:", err);
    return null;
  }
}
