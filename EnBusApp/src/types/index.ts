/**
 * REF-03: Shared TypeScript types for common database record shapes.
 *
 * These types match the actual Supabase schema used by the app queries.
 * Fields come from the real SELECT queries in the screens, not assumptions.
 */

// ─── Auth / Profiles ──────────────────────────────────────────────────────────

export interface PerfilUsuario {
  id: string;
  email?: string;
  /** Full name stored in profiles table */
  nombre_completo?: string;
  /** Auth metadata alias — may differ from profiles.nombre_completo */
  nombre?: string;
  apellido?: string;
  cedula_rif?: string;
  telefono?: string;
  avatar_url?: string;
  created_at: string;
}

// ─── Encomiendas ──────────────────────────────────────────────────────────────

export type EstadoEncomienda =
  | 'PENDIENTE_DE_ESCANEO'
  | 'EN_RECEPCION'
  | 'POR_PAGAR'
  /** Comprobante enviado, esperando validación de la cooperativa */
  | 'PENDIENTE_VERIFICACION'
  | 'PAGADA'
  | 'EN_TRANSITO'
  | 'EN_OFICINA_DESTINO'
  | 'ENTREGADA'
  | 'CANCELADA'
  | 'DEVUELTA';

export type ModalidadPago = 'ORIGEN' | 'DESTINO';

export interface Encomienda {
  id: string;
  tracking_id?: string;
  sender_id: string;
  receiver_user_id?: string;
  receiver_nombre?: string;
  receiver_cedula_rif?: string;
  receiver_telefono?: string;
  /** Column name in Supabase is `descripcion_contenido` */
  descripcion_contenido?: string;
  peso_kg?: number;
  valor_declarado?: number;
  costo_calculado?: number;
  modalidad_pago?: ModalidadPago;
  pin_retiro?: string;
  /** Storage path — resolve to a signed URL before rendering */
  foto_evidencia_url?: string;
  estado_origen?: string;
  ciudad_origen?: string;
  estado_destino?: string;
  ciudad_destino?: string;
  estado: EstadoEncomienda;
  cooperativa_id?: string;
  created_at: string;
  updated_at?: string;
  /** Joined when the query asks for `profiles:sender_id(*)` */
  profiles?: PerfilUsuario;
}

export interface HistorialEncomienda {
  id: string;
  encomienda_id: string;
  estado: EstadoEncomienda;
  descripcion?: string;
  created_at: string;
}

// ─── Boletos ──────────────────────────────────────────────────────────────────

export type EstadoBoleto =
  | 'RESERVADO'
  | 'PAGADO'
  | 'USADO'
  | 'CANCELADO'
  | 'EXPIRADO';

export interface Ruta {
  ciudad_origen: string;
  ciudad_destino: string;
  duracion_estimada_min?: number;
  precio_pasaje?: number;
}

export interface Cooperativa {
  id?: string;
  nombre: string;
  calificacion_promedio?: number;
}

/**
 * Viaje as returned by the detail screen query (viajes/[id].tsx).
 * Includes joined relations.
 */
export interface Viaje {
  id: string;
  fecha_hora_salida: string;
  asientos_totales?: number;
  asientos_disponibles?: number;
  numero_unidad?: string;
  nombre_chofer?: string;
  estado?: 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO';
  rutas?: Ruta;
  cooperativas?: Cooperativa;
}

export interface Boleto {
  id: string;
  codigo_boleto?: string;
  comprador_id: string;
  viaje_id?: string;
  cooperativa_id?: string;
  asiento?: string;
  asientos?: string[];
  precio?: number;
  monto_total?: number;
  estado: EstadoBoleto;
  reserva_expira_at?: string;
  motivo_cancelacion?: string;
  monto_reembolso?: number;
  created_at: string;
  viajes?: {
    fecha_hora_salida: string;
    numero_unidad?: string;
    nombre_chofer?: string;
    rutas?: Ruta;
  };
  cooperativas?: { nombre: string };
  profiles?: { nombre_completo?: string; cedula_rif?: string };
}

// ─── Notificaciones ───────────────────────────────────────────────────────────

export type RecursoTipo = 'boleto' | 'encomienda';

export interface Notificacion {
  id: string;
  usuario_id: string;
  titulo: string;
  mensaje?: string;
  leida: boolean;
  recurso_tipo?: RecursoTipo;
  recurso_id?: string;
  created_at: string;
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

export type TipoPago = 'TRANSFERENCIA' | 'PAGO_MOVIL' | 'EFECTIVO' | 'ZELLE';

export interface MetodoPago {
  id: string;
  cooperativa_id: string;
  tipo: TipoPago;
  banco?: string;
  numero_cuenta?: string;
  numero_telefono?: string;
  cedula_rif?: string;
  nombre_titular?: string;
  activo: boolean;
}

export interface Pago {
  id: string;
  encomienda_id?: string;
  boleto_id?: string;
  metodo_pago_id: string;
  referencia?: string;
  banco_emisor?: string;
  fecha_pago?: string;
  monto: number;
  estado: 'PENDIENTE' | 'VERIFICADO' | 'RECHAZADO';
  created_at: string;
}
