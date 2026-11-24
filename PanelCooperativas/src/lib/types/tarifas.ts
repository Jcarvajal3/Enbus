import { fechaTasaCorta } from "@/lib/dinero";
import { fechaVE, formatHoraVE } from "@/lib/fechas";

/** Glosario: "Vigente" (la que se cobra), "Programada" (entra en vigor en su fecha), "Anterior" (historial). */
export type EstadoTarifa = "VIGENTE" | "PROGRAMADA" | "ANTERIOR";

export const ETIQUETA_ESTADO_TARIFA: Record<EstadoTarifa, string> = {
  VIGENTE: "Vigente",
  PROGRAMADA: "Programada",
  ANTERIOR: "Anterior",
};

export interface Tarifa {
  id: string;
  cooperativa_id?: string | null;
  tarifa_por_kg: number;
  factor_distancia_por_min: number;
  dimensiones_max_cm: number;
  peso_max_kg: number;
  vigente_desde: string; // ISO string
  activa: boolean;
  creada_por: string;
  created_at: string;
  creador_nombre?: string | null; // Nombre completo obtenido del perfil del creador
  /** Cuándo se publicó con fn_publicar_tarifa (programadas y vigentes nuevas). */
  publicada_at?: string | null;
  /** Cuándo dejó de estar vigente o se canceló su programación. */
  reemplazada_at?: string | null;
  nota?: string | null;
  estado: EstadoTarifa;
}

/** Fila cruda de `public.tarifas` (con join opcional al perfil del creador). */
export type FilaTarifa = Record<string, unknown> & {
  id: string;
  cooperativa_id?: string | null;
  tarifa_por_kg: number | string;
  factor_distancia_por_min: number | string;
  dimensiones_max_cm: number;
  peso_max_kg: number | string;
  vigente_desde: string;
  activa: boolean;
  creada_por: string;
  created_at: string;
  publicada_at?: string | null;
  reemplazada_at?: string | null;
  nota?: string | null;
  profiles?: { nombre_completo?: string | null } | null;
};

/** Estado de una fila de `tarifas` (columnas de 20260721000002). */
export function estadoDeTarifa(t: {
  activa: boolean;
  publicada_at?: string | null;
  reemplazada_at?: string | null;
}): EstadoTarifa {
  if (t.activa) return "VIGENTE";
  if (t.publicada_at && !t.reemplazada_at) return "PROGRAMADA";
  return "ANTERIOR";
}

/** Convierte una fila de Supabase en el tipo `Tarifa` usado por UI y páginas. */
export function aTarifa(row: FilaTarifa): Tarifa {
  return {
    id: row.id,
    cooperativa_id: row.cooperativa_id ?? null,
    tarifa_por_kg: Number(row.tarifa_por_kg),
    factor_distancia_por_min: Number(row.factor_distancia_por_min),
    dimensiones_max_cm: row.dimensiones_max_cm,
    peso_max_kg: Number(row.peso_max_kg),
    vigente_desde: row.vigente_desde,
    activa: row.activa,
    creada_por: row.creada_por,
    created_at: row.created_at,
    creador_nombre: row.profiles?.nombre_completo || null,
    publicada_at: row.publicada_at ?? null,
    reemplazada_at: row.reemplazada_at ?? null,
    nota: row.nota ?? null,
    estado: estadoDeTarifa(row),
  };
}

/** Límites de fn_publicar_tarifa (el servidor vuelve a validarlos). */
export const LIMITES_TARIFA = {
  tarifa_por_kg: { min: 0.01, max: 1000 },
  factor_distancia_por_min: { min: 0, max: 1 },
  dimensiones_max_cm: { min: 10, max: 300 },
  peso_max_kg: { min: 1, max: 100 },
} as const;

/** Valores que se publican (fn_publicar_tarifa). */
export interface ParametrosTarifa {
  tarifa_por_kg: number;
  factor_distancia_por_min: number;
  dimensiones_max_cm: number;
  peso_max_kg: number;
}

export interface CreateTarifaInput extends ParametrosTarifa {
  /** null = ahora. Si no, fecha y hora de Venezuela ('YYYY-MM-DD' y 'HH:mm'). */
  programar?: { fecha: string; hora: string } | null;
  nota?: string | null;
}

export type ResultadoPublicarTarifa = {
  success: boolean;
  error?: string;
  /** Campo a marcar en el formulario (detalle `campo` del error). */
  campo?: string;
  data?: { id: string; estado: "VIGENTE" | "PROGRAMADA"; vigente_desde: string };
};

export interface RouteOption {
  id: string;
  estado_origen: string;
  ciudad_origen: string;
  estado_destino: string;
  ciudad_destino: string;
  duracion_estimada_min: number;
  cooperativa_nombre?: string;
}

export interface SimuladorInput {
  peso_kg: number;
  ruta_id: string;
}

export interface SimuladorResult {
  costo_base: number;
  costo_distancia: number;
  costo_total: number;
  formula: string;
  tarifa_por_kg: number;
  factor_distancia_por_min: number;
  duracion_estimada_min: number;
  peso_kg: number;
}

/** Decimales con que se guardan el precio por kilo, el peso (2) y el recargo por minuto (4). */
export const DECIMALES_TARIFA = { dinero: 2, peso: 2, factor: 4 } as const;

/** Hasta cuántos días en el futuro se puede programar una tarifa (lo valida también fn_publicar_tarifa). */
export const DIAS_MAX_PROGRAMACION = 365;

/** `valor` como entero escalado (2,5 con 2 decimales → 250), o null si tiene más decimales que `decimales`. */
function escalar(valor: number, decimales: number): bigint | null {
  const escalado = valor * 10 ** decimales;
  const entero = Math.round(escalado);
  return Number.isFinite(escalado) && Math.abs(escalado - entero) < 1e-6 ? BigInt(entero) : null;
}

/**
 * Costo de una encomienda en USD de referencia: la misma fórmula que
 * `_costo_encomienda` (SQL) y `fn_cotizar_envio_publico`:
 *   round(peso × precio por kilo × (1 + recargo por minuto × duración), 2)
 *
 * Con valores de los decimales que guarda la base se calcula con enteros (sin errores de
 * coma flotante, redondeando como `round(numeric, 2)`); si no, cae a coma flotante.
 */
export function costoEncomiendaUsd(
  pesoKg: number,
  tarifa: Pick<ParametrosTarifa, "tarifa_por_kg" | "factor_distancia_por_min">,
  duracionMin: number
): number {
  const peso = escalar(pesoKg, DECIMALES_TARIFA.peso);
  const precio = escalar(tarifa.tarifa_por_kg, DECIMALES_TARIFA.dinero);
  const factor = escalar(tarifa.factor_distancia_por_min, DECIMALES_TARIFA.factor);
  if (peso !== null && precio !== null && factor !== null && Number.isInteger(duracionMin)) {
    // peso/100 × precio/100 × (1 + factor/10⁴ × min) en centavos = peso × precio × (10⁴ + factor × min) / 10⁶
    const divisor = BigInt(1_000_000);
    const numerador = peso * precio * (BigInt(10_000) + factor * BigInt(duracionMin));
    return Number((numerador + divisor / BigInt(2)) / divisor) / 100;
  }
  const bruto = pesoKg * tarifa.tarifa_por_kg * (1 + tarifa.factor_distancia_por_min * duracionMin);
  return Math.round((bruto + Number.EPSILON) * 100) / 100;
}

/** Recargo por distancia como porcentaje del costo base: 0,001 × 480 min → 48. */
export function recargoPorcentaje(factorPorMin: number, duracionMin: number): number {
  return factorPorMin * duracionMin * 100;
}

/** "05/10 a las 6:00 a. m." (hora de Venezuela). */
export function formatFechaProgramada(iso: string): string {
  const hora = formatHoraVE(iso);
  if (!hora) return "";
  return `${fechaTasaCorta(fechaVE(iso))} a las ${hora}`;
}
