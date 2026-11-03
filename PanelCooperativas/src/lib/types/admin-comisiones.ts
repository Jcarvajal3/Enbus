/** Métodos con que una cooperativa paga su comisión (chk_comisiones_pago_metodo). */
export const METODOS_PAGO_COMISION = ["PAGO_MOVIL", "TRANSFERENCIA_BANCARIA", "ZELLE", "EFECTIVO"] as const;
export type MetodoPagoComision = (typeof METODOS_PAGO_COMISION)[number];

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
  /** Referencia del pago de la cooperativa (null en efectivo). */
  pago_referencia?: string | null;
  /** Cómo pagó la cooperativa (20260721000002). Null en ciclos pagados antes de la fase 4. */
  pago_metodo?: MetodoPagoComision | null;
  /** Super admin que registró el pago. */
  pago_registrado_por?: string | null;
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
