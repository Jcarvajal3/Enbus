export interface Tarifa {
  id: string;
  tarifa_por_kg: number;
  factor_distancia_por_min: number;
  dimensiones_max_cm: number;
  peso_max_kg: number;
  vigente_desde: string; // ISO string
  activa: boolean;
  creada_por: string;
  created_at: string;
  creador_nombre?: string | null; // Nombre completo obtenido del perfil del creador
}

export interface CreateTarifaInput {
  tarifa_por_kg: number;
  factor_distancia_por_min: number;
  dimensiones_max_cm: number;
  peso_max_kg: number;
  vigente_desde: string; // ISO string
}

export interface RouteOption {
  id: string;
  estado_origen: string;
  ciudad_origen: string;
  estado_destino: string;
  ciudad_destino: string;
  duracion_estimada_min: number;
  cooperativa_nombre: string;
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
