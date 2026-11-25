"use server";

// Acción pública del sitio: rastreo de encomiendas por código. Es un endpoint público
// (cualquiera puede llamarlo con un POST): el argumento se trata como dato sin tipo y
// tiene un límite de frecuencia por IP.

import { normalizarTracking, TRACKING_RE } from "@/lib/artefactos.generated";
import { normalizarCiudad } from "@/lib/ve.generated";
import { rastrear, supabaseSitio, type ResultadoRastreo } from "@/lib/sitio/consultas";
import { consumirLimitePorIp, minutosTexto, textoEntrada } from "@/lib/sitio/limites";

// 30 consultas cada 10 minutos por IP (frena a quien prueba códigos al azar).
const LIMITE_RASTREO = { prefijo: "rastreo", maximo: 30, ventanaSegundos: 10 * 60 } as const;

/** Resultado de la búsqueda, con lo que se escribió (para reponerlo en el campo). */
export type EstadoRastreo = (
  | ResultadoRastreo
  | { tipo: "inicial" }
  | { tipo: "vacio" }
  | { tipo: "formato"; codigo: string }
  /** Falta la configuración de Supabase en el servidor. */
  | { tipo: "no_disponible" }
  /** Demasiadas consultas seguidas desde la misma conexión. */
  | { tipo: "limite"; espera: string }
) & { entrada?: string };

/** Busca una encomienda por su código de seguimiento (EB-AAMMDD-NNNNN). Firma de `useActionState`. */
export async function rastrearEncomienda(_anterior: EstadoRastreo, formData: FormData): Promise<EstadoRastreo> {
  const texto = textoEntrada(formData instanceof FormData ? formData.get("codigo") : null, 60);
  return { ...(await buscar(texto)), entrada: texto.slice(0, 40) };
}

async function buscar(entrada: string): Promise<EstadoRastreo> {
  const codigo = normalizarTracking(entrada).slice(0, 40);
  if (!codigo) return { tipo: "vacio" };
  // Un texto sin la forma del código no puede existir (trigger generar_tracking_id): no se consulta.
  if (!TRACKING_RE.test(codigo)) return { tipo: "formato", codigo };

  const supabase = supabaseSitio();
  if (!supabase) return { tipo: "no_disponible" };
  const limite = await consumirLimitePorIp(
    supabase,
    LIMITE_RASTREO.prefijo,
    LIMITE_RASTREO.maximo,
    LIMITE_RASTREO.ventanaSegundos
  );
  if (!limite.permitido) return { tipo: "limite", espera: minutosTexto(limite.reintentarEnSegundos) };

  return (await rastrear(codigo)) ?? { tipo: "no_disponible" };
}

// ─── Cotizador de encomiendas (público) ──────────────────────────────────────

/** Una cooperativa que cubre la ruta, con el costo estimado del envío. */
export interface OpcionEnvio {
  cooperativaId: string;
  cooperativa: string;
  calificacion: number | null;
  duracionMin: number | null;
  costoUsd: number;
  /** null si no hay tasa BCV vigente. */
  costoBs: number | null;
}

export type EstadoCotizacion =
  | { tipo: "ok"; opciones: OpcionEnvio[]; tasa: number | null; tasaFecha: string | null; pesoKg: number }
  /** Ninguna cooperativa cubre la ruta. */
  | { tipo: "sin_opciones" }
  /** Datos inválidos (ciudades o peso); `mensaje` ya está en español. */
  | { tipo: "invalido"; campo: "origen" | "destino" | "peso"; mensaje: string }
  | { tipo: "no_disponible" }
  | { tipo: "limite"; espera: string }
  | { tipo: "error" };

// 20 cotizaciones cada 10 minutos por IP.
const LIMITE_COTIZACION = { prefijo: "cotizar-envio", maximo: 20, ventanaSegundos: 10 * 60 } as const;

function numeroONull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Cotiza un envío (`fn_cotizar_envio_publico`). Endpoint público: los argumentos se tratan como
 * datos sin tipo y hay un límite de frecuencia por IP. Nunca lanza.
 */
export async function cotizarEnvio(origen: unknown, destino: unknown, peso: unknown): Promise<EstadoCotizacion> {
  const o = normalizarCiudad(textoEntrada(origen, 60));
  const d = normalizarCiudad(textoEntrada(destino, 60));
  if (!o) return { tipo: "invalido", campo: "origen", mensaje: "Elige la ciudad de origen." };
  if (!d || d === o) return { tipo: "invalido", campo: "destino", mensaje: "Elige un destino distinto del origen." };
  const pesoKg = Number(textoEntrada(typeof peso === "number" ? String(peso) : peso, 12).replace(",", "."));
  if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
    return { tipo: "invalido", campo: "peso", mensaje: "Escribe el peso del paquete en kilos." };
  }
  const pesoRedondeado = Math.round(pesoKg * 100) / 100;

  const supabase = supabaseSitio();
  if (!supabase) return { tipo: "no_disponible" };
  try {
    const limite = await consumirLimitePorIp(
      supabase,
      LIMITE_COTIZACION.prefijo,
      LIMITE_COTIZACION.maximo,
      LIMITE_COTIZACION.ventanaSegundos
    );
    if (!limite.permitido) return { tipo: "limite", espera: minutosTexto(limite.reintentarEnSegundos) };

    const { data, error } = await supabase.rpc("fn_cotizar_envio_publico", {
      p_peso_kg: pesoRedondeado,
      p_ciudad_origen: o,
      p_ciudad_destino: d,
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
    const opciones = crudas
      .map((x) => ({
        cooperativaId: String(x.cooperativa_id ?? ""),
        cooperativa: String(x.cooperativa ?? "Cooperativa"),
        calificacion: numeroONull(x.calificacion),
        duracionMin: numeroONull(x.duracion_min),
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
      pesoKg: pesoRedondeado,
    };
  } catch (err) {
    console.error("No se pudo cotizar el envío:", err);
    return { tipo: "error" };
  }
}
