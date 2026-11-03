/** RECHAZADA es reversible (vuelve a PENDIENTE); DESACTIVADA es terminal. */
export type EstadoCooperativa = "PENDIENTE" | "RECHAZADA" | "ACTIVA" | "SUSPENDIDA" | "DESACTIVADA";

/** Transiciones que acepta fn_cambiar_estado_cooperativa (mismo orden que el SQL). */
export const TRANSICIONES_COOPERATIVA: Record<EstadoCooperativa, EstadoCooperativa[]> = {
  PENDIENTE: ["ACTIVA", "RECHAZADA", "DESACTIVADA"],
  RECHAZADA: ["PENDIENTE", "DESACTIVADA"],
  ACTIVA: ["SUSPENDIDA", "DESACTIVADA"],
  SUSPENDIDA: ["ACTIVA", "DESACTIVADA"],
  DESACTIVADA: [],
};

/** Estados que exigen motivo (la cooperativa lo ve en su panel). */
export const ESTADOS_CON_MOTIVO: EstadoCooperativa[] = ["RECHAZADA", "SUSPENDIDA", "DESACTIVADA"];

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
  /** Representante legal (registro; antes iba dentro de `descripcion`). */
  representante?: string | null;
  /** Mensaje o rutas de interés que dejó la cooperativa al registrarse. */
  mensaje_registro?: string | null;
  /** Motivo del último rechazo, suspensión o desactivación (lo ve la cooperativa). */
  motivo_estado?: string | null;
  estado_cambiado_at?: string | null;
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
  /** Ciclos de comisiones sin pagar (impacto al desactivar). */
  ciclos_sin_pagar: number;
  /** Encomiendas que no han terminado (ni entregadas, ni canceladas, ni devueltas). */
  encomiendas_en_curso: number;
}

export interface CreateCooperativaInput {
  nombre: string;
  rif: string;
  comision_porcentaje: number;
}
