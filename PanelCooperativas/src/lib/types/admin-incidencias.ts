export interface Incidencia {
  id: string;
  encomienda_id: string | null;
  reportado_por: string | null;
  tipo: string;
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
  reportado_por_profile?: {
    nombre_completo: string;
  } | null;
  resuelta_por_profile?: {
    nombre_completo: string;
  } | null;
}

export interface FetchIncidenciasFilters {
  tipo?: string;
  estado?: string;
}
