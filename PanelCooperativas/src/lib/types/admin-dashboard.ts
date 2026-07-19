export type DashboardKPIs = {
  encomiendas_hoy: number;
  boletos_hoy: number;
  ingresos_brutos_hoy: number;
  comisiones_estimadas_hoy: number;
  cooperativas_activas: number;
  alertas_amarillas_abiertas: number;
  solicitudes_pendientes: number;
};

export type DailyActivity = {
  fecha: string;       // YYYY-MM-DD
  encomiendas: number;
  boletos: number;
};

export type TopCooperativa = {
  cooperativa_id: string;
  nombre: string;
  total_transacciones: number;
};

export type RutaPopular = {
  ruta_nombre: string;
  total: number;
};

export type IncidenciaReciente = {
  id: string;
  tipo: string;
  encomienda_tracking_id: string | null;
  reportado_por_nombre: string | null;
  estado: string;
  created_at: string;
};

export type CooperativaBalance = {
  cooperativa_id: string;
  nombre: string;
  comision_porcentaje: number;
  monto_pendiente: number;
  ciclos_impagos: number;
};
