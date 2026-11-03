"use server";

// Acciones públicas de la landing: rastreo por código y cotización de envíos.
// Ambas usan lib/consultas (service role, solo servidor) y nunca lanzan.
// Son endpoints públicos (cualquiera puede llamarlas con un POST): los argumentos se
// tratan como datos sin tipo y cada una tiene un límite de frecuencia por IP.

import { cotizar, rastrear, type Cotizacion, type ResultadoRastreo } from "@/lib/consultas";
import { normalizarCodigoSeguimiento } from "@/lib/estados";
import { TRACKING_RE } from "@/lib/artefactos.generated";
import { consumirLimitePorIp, minutosTexto, textoEntrada } from "@/lib/limites";
import { obtenerSupabaseAdmin } from "@/lib/supabase";

// Rastreo: 30 consultas cada 10 minutos por IP (frena a quien prueba códigos al azar).
const LIMITE_RASTREO = { prefijo: "rastreo", maximo: 30, ventanaSegundos: 10 * 60 } as const;
// Calculadora: 40 cálculos cada 10 minutos por IP.
const LIMITE_COTIZAR = { prefijo: "cotizar", maximo: 40, ventanaSegundos: 10 * 60 } as const;

// ─── Rastreo ─────────────────────────────────────────────────────────────────

export type EstadoRastreo =
  | ResultadoRastreo
  | { tipo: "vacio" }
  /** Falta la configuración de Supabase en el servidor. */
  | { tipo: "no_disponible" }
  /** Demasiadas consultas seguidas desde la misma conexión. */
  | { tipo: "limite"; reintentarEnSegundos: number };

/** Busca una encomienda por su código de seguimiento (EB-AAMMDD-NNNNN). */
export async function rastrearEncomienda(codigoEntrada: unknown): Promise<EstadoRastreo> {
  const codigo = normalizarCodigoSeguimiento(textoEntrada(codigoEntrada, 60));
  if (!codigo) return { tipo: "vacio" };
  // Un texto sin la forma del código no puede existir (trigger generar_tracking_id): no se consulta.
  if (!TRACKING_RE.test(codigo)) return { tipo: "no_encontrada" };

  const supabase = obtenerSupabaseAdmin();
  if (!supabase) return { tipo: "no_disponible" };
  const limite = await consumirLimitePorIp(
    supabase,
    LIMITE_RASTREO.prefijo,
    LIMITE_RASTREO.maximo,
    LIMITE_RASTREO.ventanaSegundos
  );
  if (!limite.permitido) return { tipo: "limite", reintentarEnSegundos: limite.reintentarEnSegundos };

  const resultado = await rastrear(codigo);
  return resultado ?? { tipo: "no_disponible" };
}

// ─── Calculadora ─────────────────────────────────────────────────────────────

export type CampoCalculadora = "origen" | "destino" | "peso";

export interface EstadoCalculadora {
  /** Cotización con los datos que se usaron para pedirla. */
  resultado?: Cotizacion & { origen: string; destino: string; pesoKg: number };
  error?: string;
  campos?: Partial<Record<CampoCalculadora, string>>;
  valores?: Partial<Record<CampoCalculadora, string>>;
}

/** "2,5" o "2.5" -> 2.5; null si no es un número. */
function leerPeso(entrada: string): number | null {
  const limpio = entrada.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export async function cotizarEnvio(
  _anterior: EstadoCalculadora,
  formData: FormData
): Promise<EstadoCalculadora> {
  // Acción pública: se recortan las entradas antes de llegar a la base.
  const leer = (campo: string, maximo: number) =>
    textoEntrada(formData instanceof FormData ? formData.get(campo) : null, maximo);
  const valores = {
    origen: leer("origen", 80),
    destino: leer("destino", 80),
    peso: leer("peso", 12),
  };

  const campos: Partial<Record<CampoCalculadora, string>> = {};
  if (!valores.origen) campos.origen = "Elige la ciudad desde donde envías.";
  if (!valores.destino) campos.destino = "Elige la ciudad a donde va el paquete.";
  const peso = leerPeso(valores.peso);
  if (!valores.peso) campos.peso = "Escribe el peso aproximado en kilos.";
  else if (peso === null || peso <= 0) campos.peso = "Escribe el peso en kilos con números, por ejemplo 2,5.";

  if (Object.keys(campos).length > 0 || peso === null) {
    return { error: "Revisa los datos marcados para calcular el costo.", campos, valores };
  }

  const supabase = obtenerSupabaseAdmin();
  if (!supabase) {
    return { error: "La calculadora no está disponible en este momento. Intenta más tarde.", valores };
  }
  const limite = await consumirLimitePorIp(
    supabase,
    LIMITE_COTIZAR.prefijo,
    LIMITE_COTIZAR.maximo,
    LIMITE_COTIZAR.ventanaSegundos
  );
  if (!limite.permitido) {
    return {
      error: `Hiciste muchos cálculos seguidos. Intenta de nuevo en ${minutosTexto(limite.reintentarEnSegundos)}.`,
      valores,
    };
  }

  const respuesta = await cotizar(peso, valores.origen, valores.destino);
  if (!respuesta) {
    return { error: "La calculadora no está disponible en este momento. Intenta más tarde.", valores };
  }
  if (respuesta.tipo === "error") {
    const campo = respuesta.campo === "peso" ? "peso" : undefined;
    return {
      error: respuesta.mensaje,
      campos: campo ? { [campo]: respuesta.mensaje } : undefined,
      valores,
    };
  }

  return {
    resultado: { ...respuesta.cotizacion, origen: valores.origen, destino: valores.destino, pesoKg: peso },
    valores,
  };
}
