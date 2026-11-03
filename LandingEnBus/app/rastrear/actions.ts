"use server";

// Acciones públicas de la landing: rastreo por código y cotización de envíos.
// Ambas usan lib/consultas (service role, solo servidor) y nunca lanzan.

import { cotizar, rastrear, type Cotizacion, type ResultadoRastreo } from "@/lib/consultas";
import { normalizarCodigoSeguimiento } from "@/lib/estados";

// ─── Rastreo ─────────────────────────────────────────────────────────────────

export type EstadoRastreo =
  | ResultadoRastreo
  | { tipo: "vacio" }
  /** Falta la configuración de Supabase en el servidor. */
  | { tipo: "no_disponible" };

/** Busca una encomienda por su código de seguimiento (EB-AAMMDD-NNNNN). */
export async function rastrearEncomienda(codigoEntrada: string): Promise<EstadoRastreo> {
  const codigo = normalizarCodigoSeguimiento(codigoEntrada);
  if (!codigo) return { tipo: "vacio" };
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
  if (!/^\d+(\.\d{1,3})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export async function cotizarEnvio(
  _anterior: EstadoCalculadora,
  formData: FormData
): Promise<EstadoCalculadora> {
  // Acción pública: se recortan las entradas antes de llegar a la base.
  const valores = {
    origen: String(formData.get("origen") ?? "").trim().slice(0, 80),
    destino: String(formData.get("destino") ?? "").trim().slice(0, 80),
    peso: String(formData.get("peso") ?? "").trim().slice(0, 12),
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
