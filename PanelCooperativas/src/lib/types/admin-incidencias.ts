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

export interface FetchIncidenciasFilters {
  tipo?: string;
  estado?: string;
}
