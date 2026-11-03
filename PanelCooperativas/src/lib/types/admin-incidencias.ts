export interface Incidencia {
  id: string;
  encomienda_id: string | null;
  /** Boleto relacionado (reportes de usuario, fase 3). */
  boleto_id?: string | null;
  reportado_por: string | null;
  /** PERDIDA, DANADA, DEMORA, ALERTA_AMARILLA, REPORTE_USUARIO… (etiquetas en lib/estados). */
  tipo: string;
  /** Categoría del reporte de usuario: PAGO, BOLETO, ENCOMIENDA, CUENTA, OTRO (CATEGORIA_REPORTE). */
  categoria?: string | null;
  descripcion: string;
  estado: "ABIERTA" | "EN_PROCESO" | "RESUELTA";
  resolucion: string | null;
  resuelta_por: string | null;
  created_at: string;
  updated_at: string;

  // Joined relations
  encomienda?: {
    tracking_id: string;
    valor_declarado: number | null;
    descripcion_contenido: string;
    estado: string;
  } | null;
  boleto?: {
    codigo_boleto: string;
    estado: string;
    asiento: string | null;
  } | null;
  reportado_por_profile?: {
    nombre_completo: string;
    telefono?: string | null;
    /** Correo de la cuenta (solo en el detalle; viene de auth). */
    email?: string | null;
  } | null;
  resuelta_por_profile?: {
    nombre_completo: string;
  } | null;
}

/** "pendientes" = ABIERTA y EN_PROCESO (vista por defecto); "todas" sin filtro. */
export type FiltroEstadoIncidencia = "pendientes" | "todas" | "ABIERTA" | "EN_PROCESO" | "RESUELTA";

export const FILTROS_ESTADO_INCIDENCIA: readonly FiltroEstadoIncidencia[] = [
  "pendientes",
  "ABIERTA",
  "EN_PROCESO",
  "RESUELTA",
  "todas",
];

export interface FetchIncidenciasFilters {
  tipo?: string;
  estado?: FiltroEstadoIncidencia | string;
}

export type PrioridadIncidencia = "alta" | "media" | "baja";

export const ETIQUETA_PRIORIDAD: Record<PrioridadIncidencia, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

/**
 * Prioridad de atención (AD-19): pérdida o daño → alta; reporte de un pago o más de
 * 72 h en tránsito → media; el resto → baja.
 */
export function prioridadIncidencia(i: Pick<Incidencia, "tipo" | "categoria">): PrioridadIncidencia {
  if (i.tipo === "PERDIDA" || i.tipo === "DANADA") return "alta";
  if (i.tipo === "ALERTA_AMARILLA" || (i.tipo === "REPORTE_USUARIO" && i.categoria === "PAGO")) return "media";
  return "baja";
}

const PESO_PRIORIDAD: Record<PrioridadIncidencia, number> = { alta: 0, media: 1, baja: 2 };

/** Primero la prioridad más alta; dentro de cada una, la más antigua primero. */
export function ordenarPorPrioridad<T extends Pick<Incidencia, "tipo" | "categoria" | "created_at">>(lista: T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      PESO_PRIORIDAD[prioridadIncidencia(a)] - PESO_PRIORIDAD[prioridadIncidencia(b)] ||
      a.created_at.localeCompare(b.created_at)
  );
}
