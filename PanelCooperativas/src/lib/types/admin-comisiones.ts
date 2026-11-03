export interface ComisionCiclo {
  id: string;
  cooperativa_id: string;
  periodo_inicio: string; // DATE format YYYY-MM-DD
  periodo_fin: string;    // DATE format YYYY-MM-DD
  total_encomiendas: number;
  total_boletos: number;
  comision_porcentaje: number;
  monto_comision: number;
  pagado: boolean;
  pagado_at: string | null;
  /** Referencia del pago de la cooperativa (columna pendiente de migración: puede no venir). */
  pago_referencia?: string | null;
  created_at: string;

  // Joined properties
  cooperativas?: {
    nombre: string;
  } | null;
  cooperativa_nombre?: string; // Flattened for easier usage in tables
}

export interface GenerarCicloInput {
  periodo_inicio: string; // YYYY-MM-DD
  periodo_fin: string;    // YYYY-MM-DD
  cooperativa_id: string; // 'all' (Todas) or specific cooperativa UUID
}

export interface CicloPreview {
  cooperativa_id: string;
  cooperativa_nombre: string;
  total_encomiendas: number;
  total_boletos: number;
  comision_porcentaje: number;
  monto_comision: number;
  periodo_inicio: string;
  periodo_fin: string;
  se_solapa: boolean;
}
