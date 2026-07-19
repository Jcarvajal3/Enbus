export type EstadoCooperativa = "PENDIENTE" | "ACTIVA" | "SUSPENDIDA" | "DESACTIVADA";

export interface Cooperativa {
  id: string;
  nombre: string;
  rif: string;
  logo_url: string | null;
  comision_porcentaje: number;
  estado: EstadoCooperativa;
  calificacion_promedio: number;
  total_calificaciones: number;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  descripcion?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sucursal {
  id: string;
  cooperativa_id: string;
  nombre: string;
  estado_geografico: string;
  ciudad: string;
  direccion: string;
  telefono: string | null;
  activa: boolean;
  created_at: string;
}

export interface MetodoPago {
  id: string;
  cooperativa_id: string;
  tipo: "TRANSFERENCIA_BANCARIA" | "PAGO_MOVIL" | "ZELLE" | "EFECTIVO";
  banco: string | null;
  titular: string;
  numero_cuenta: string | null;
  cedula_rif: string | null;
  email_zelle: string | null;
  instrucciones: string | null;
  activo: boolean;
  created_at: string;
}

export interface Ruta {
  id: string;
  cooperativa_id: string;
  estado_origen: string;
  ciudad_origen: string;
  estado_destino: string;
  ciudad_destino: string;
  duracion_estimada_min: number;
  precio_pasaje: number | null;
  activa: boolean;
  created_at: string;
}

export interface Empleado {
  id: string;
  nombre_completo: string;
  role: "taquillero" | "admin_cooperativa" | "super_admin";
  cooperativa_id: string | null;
  telefono: string;
  cedula_rif: string;
  email?: string;
  isBanned?: boolean;
  created_at: string;
}

export interface Calificacion {
  id: string;
  boleto_id: string;
  usuario_id: string;
  cooperativa_id: string;
  estrellas: number;
  comentario: string | null;
  created_at: string;
  usuario_nombre?: string;
}

export interface CooperativaDetalle extends Cooperativa {
  sucursales: Sucursal[];
  metodos_pago: MetodoPago[];
  rutas: Ruta[];
  empleados: Empleado[];
  calificaciones: Calificacion[];
  comisiones_pendientes: number;
}

export interface CreateCooperativaInput {
  nombre: string;
  rif: string;
  comision_porcentaje: number;
}
