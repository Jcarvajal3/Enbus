import "server-only";

// ─── Rutas y cotización de envíos (SOLO SERVIDOR) ────────────────────────────
// `rutas` es solo para `authenticated`: se lee con el cliente de service role, solo columnas
// públicas. La cotización es `fn_cotizar_envio_publico` (pública), con límite por IP.

import { unstable_cache } from "next/cache";

import { rutasEnLimpio } from "./rutas-envio";
import { supabaseSitio } from "@/lib/sitio/consultas";
import { consumirLimitePorIp, minutosTexto } from "@/lib/sitio/limites";
import { normalizarCiudad } from "@/lib/ve.generated";
import type { CiudadConRuta, Cotizacion, OpcionEnvio, RutasEnvio } from "@/components/pasajero/encomienda/tipos";

// 20 cotizaciones cada 10 minutos por IP.
const LIMITE_COTIZACION = { prefijo: "cotizar-envio", maximo: 20, ventanaSegundos: 10 * 60 } as const;

const VACIAS: RutasEnvio = { origenes: [], destinosPorOrigen: {} };

async function leerRutas(): Promise<RutasEnvio> {
  const supabase = supabaseSitio();
  if (!supabase) return VACIAS;
  try {
    const { data, error } = await supabase
      .from("rutas")
      .select("ciudad_origen, estado_origen, ciudad_destino, estado_destino, cooperativas!inner ( estado )")
      .eq("activa", true)
      .eq("cooperativas.estado", "ACTIVA")
      .limit(5000);
    if (error) {
      console.error("No se pudieron leer las rutas de envío:", error.message);
      return VACIAS;
    }
    return rutasEnLimpio((data ?? []) as unknown as Record<string, unknown>[]);
  } catch (err) {
    console.error("No se pudieron leer las rutas de envío:", err);
    return VACIAS;
  }
}

const rutasCache = unstable_cache(leerRutas, ["enviar:rutas"], { revalidate: 120 });

/** Ciudades con ruta activa (para los selectores). Nunca lanza. */
export async function rutasConEnvio(): Promise<RutasEnvio> {
  try {
    return await rutasCache();
  } catch (err) {
    console.error("No se pudieron leer las rutas de envío:", err);
    return VACIAS;
  }
}

/** La ruta origen → destino si existe (con sus estados), o null. */
export function buscarRuta(
  rutas: RutasEnvio,
  origen: string,
  destino: string
): { origen: CiudadConRuta; destino: CiudadConRuta } | null {
  const o = rutas.origenes.find((c) => c.ciudad === normalizarCiudad(origen));
  const d = o ? rutas.destinosPorOrigen[o.ciudad]?.find((c) => c.ciudad === normalizarCiudad(destino)) : undefined;
  return o && d ? { origen: o, destino: d } : null;
}

function numeroONull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function cotizar(
  origenCrudo: string,
  destinoCrudo: string,
  pesoKg: number | null,
  limitar: boolean
): Promise<Cotizacion> {
  const origen = normalizarCiudad(origenCrudo);
  const destino = normalizarCiudad(destinoCrudo);
  if (!origen) return { tipo: "invalido", campo: "origen", mensaje: "Elige la ciudad de origen." };
  if (!destino || destino === origen) {
    return { tipo: "invalido", campo: "destino", mensaje: "Elige un destino distinto del origen." };
  }
  const referencia = pesoKg === null;
  const peso = Math.round((pesoKg ?? 1) * 100) / 100;
  if (!Number.isFinite(peso) || peso <= 0) {
    return { tipo: "invalido", campo: "peso", mensaje: "Escribe el peso del paquete en kilos." };
  }

  const supabase = supabaseSitio();
  if (!supabase) return { tipo: "no_disponible" };
  try {
    if (limitar) {
      const limite = await consumirLimitePorIp(
        supabase,
        LIMITE_COTIZACION.prefijo,
        LIMITE_COTIZACION.maximo,
        LIMITE_COTIZACION.ventanaSegundos
      );
      if (!limite.permitido) return { tipo: "limite", espera: minutosTexto(limite.reintentarEnSegundos) };
    }

    const { data, error } = await supabase.rpc("fn_cotizar_envio_publico", {
      p_peso_kg: peso,
      p_ciudad_origen: origen,
      p_ciudad_destino: destino,
    });
    if (error) {
      // `_fallar` manda el código en `message` y el texto para la persona en `hint`.
      if (error.message === "EB_PESO_INVALIDO") {
        return {
          tipo: "invalido",
          campo: "peso",
          mensaje: error.hint?.trim() || "Ese peso no es válido para esta ruta.",
        };
      }
      console.error("No se pudo cotizar el envío:", error.message);
      return { tipo: "error" };
    }
    const r = (data ?? {}) as Record<string, unknown>;
    const crudas = Array.isArray(r.opciones) ? (r.opciones as Record<string, unknown>[]) : [];
    const opciones: OpcionEnvio[] = crudas
      .map((x) => ({
        cooperativaId: String(x.cooperativa_id ?? ""),
        cooperativa: String(x.cooperativa ?? "Cooperativa"),
        calificacion: numeroONull(x.calificacion),
        duracionMin: numeroONull(x.duracion_min),
        pesoMaxKg: numeroONull(x.peso_max_kg),
        dimensionesMaxCm: numeroONull(x.dimensiones_max_cm),
        costoUsd: numeroONull(x.costo_usd) ?? NaN,
        costoBs: numeroONull(x.costo_bs),
      }))
      .filter((x) => x.cooperativaId && Number.isFinite(x.costoUsd) && x.costoUsd > 0);
    if (opciones.length === 0) return { tipo: "sin_opciones" };
    return {
      tipo: "ok",
      opciones,
      tasa: numeroONull(r.tasa_bcv),
      tasaFecha: typeof r.tasa_bcv_fecha === "string" ? r.tasa_bcv_fecha.slice(0, 10) : null,
      pesoKg: peso,
      referencia,
    };
  } catch (err) {
    console.error("No se pudo cotizar el envío:", err);
    return { tipo: "error" };
  }
}

/**
 * Cotiza el envío origen → destino para una acción del usuario: CONSUME el límite por IP.
 * Sin peso (`null`) cotiza 1 kg de referencia ("desde"). Nunca lanza.
 */
export function cotizarEnvioWeb(origen: string, destino: string, pesoKg: number | null): Promise<Cotizacion> {
  return cotizar(origen, destino, pesoKg, true);
}

// Solo se guardan los resultados definitivos: un fallo transitorio lanza para no quedar en caché.
const cotizacionInicialCache = unstable_cache(
  async (origen: string, destino: string, pesoKg: number | null): Promise<Cotizacion> => {
    const r = await cotizar(origen, destino, pesoKg, false);
    if (r.tipo === "error" || r.tipo === "no_disponible") throw new Error(r.tipo);
    return r;
  },
  ["enviar:cotizacion"],
  { revalidate: 60 }
);

/**
 * Cotización del render del servidor (carga o recarga de /enviar): SIN límite por IP, porque no
 * la dispara el usuario con cada clic, y cacheada por (origen, destino, peso). Nunca lanza.
 */
export async function cotizarEnvioInicial(origen: string, destino: string, pesoKg: number | null): Promise<Cotizacion> {
  try {
    return await cotizacionInicialCache(normalizarCiudad(origen), normalizarCiudad(destino), pesoKg);
  } catch {
    return { tipo: "error" };
  }
}
