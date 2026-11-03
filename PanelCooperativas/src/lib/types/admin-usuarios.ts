/** Filas por lista en el detalle de un usuario (las más recientes). */
export const MAX_FILAS_DETALLE_USUARIO = 100;

export interface Usuario {
  id: string;
  role: "user" | "taquillero" | "admin_cooperativa" | "super_admin";
  nombre_completo: string;
  telefono: string;
  cedula_rif: string;
  cooperativa_id: string | null;
  cooperativa_nombre?: string | null;
  email?: string;
  is_banned: boolean;
  created_at: string;
  // Notification preferences from profiles table
  notif_encomiendas: boolean;
  notif_boletos: boolean;
  notif_recordatorios: boolean;
  // Expo push token (masked for display — never expose the raw token to the UI)
  has_push_token: boolean;
  /** La persona eliminó su cuenta desde la app (perfil anonimizado). */
  eliminada_at: string | null;
  /** Solicitud de baja (bajas_cuenta). `auth_eliminada_at` null = falta borrar su acceso. */
  baja: BajaCuenta | null;
}

export interface BajaCuenta {
  email: string | null;
  motivo: string | null;
  solicitada_at: string;
  auth_eliminada_at: string | null;
}

/** true si la cuenta se eliminó desde la app pero su acceso (Auth) sigue sin borrar. */
export function bajaPorCompletar(u: Pick<Usuario, "eliminada_at" | "baja">): boolean {
  return Boolean(u.eliminada_at && u.baja && !u.baja.auth_eliminada_at);
}

export type VistaUsuarios = "todas" | "bajas";

export interface FiltrosUsuarios {
  q?: string;
  rol?: string;
  cooperativa?: string;
  pagina?: number;
  vista?: VistaUsuarios;
}

export interface PaginaUsuarios {
  usuarios: Usuario[];
  total: number;
  pagina: number;
  porPagina: number;
  /** Cuentas eliminadas desde la app con el acceso sin borrar (filtro "Bajas por completar"). */
  bajasPendientes: number;
}

export interface EncomiendaUsuario {
  id: string;
  tracking_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  receiver_cedula_rif: string;
  sender_nombre?: string;
  sender_telefono?: string;
  estado: string;
  peso_kg: number | null;
  costo_calculado: number;
  /** Si ya tiene PIN de retiro. El PIN en sí no viaja al navegador (se reenvía desde el servidor). */
  tiene_pin: boolean;
  pin_bloqueado: boolean;
  intentos_pin: number;
  cooperativa_nombre: string;
  created_at: string;
}

export interface BoletoUsuario {
  id: string;
  codigo_boleto: string;
  asiento: string;
  precio: number;
  estado: string;
  cooperativa_nombre: string;
  viaje_info: string;
  created_at: string;
}

export interface PagoUsuario {
  id: string;
  encomienda_tracking_id: string | null;
  boleto_codigo: string | null;
  /** Precio de referencia en USD. */
  monto: number;
  /** Bs esperados (monto × tasa del pago). Null en pagos anteriores a la fase 2. */
  monto_bs: number | null;
  /** Moneda en la que pagó el cliente (Zelle / efectivo USD → "USD"). */
  moneda: "VES" | "USD";
  /** Tasa BCV usada en el pago, si se registró con ella. */
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
  tipo_pago: string;
  /** Tipo del método de la cooperativa (PAGO_MOVIL, TRANSFERENCIA_BANCARIA, ZELLE, EFECTIVO); null en efectivo de taquilla. */
  metodo_tipo: string | null;
  verificado: boolean;
  estado_verificacion: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  motivo_rechazo: string | null;
  /** Matches DB column name: numero_referencia */
  numero_referencia: string | null;
  created_at: string;
}

export interface NotificacionUsuario {
  id: string;
  titulo: string;
  contenido: string;
  canal: string;
  estado_envio: string;
  created_at: string;
}

export interface UsuarioDetalle extends Usuario {
  encomiendas_enviadas: EncomiendaUsuario[];
  encomiendas_recibidas: EncomiendaUsuario[];
  boletos: BoletoUsuario[];
  pagos: PagoUsuario[];
  notificaciones: NotificacionUsuario[];
  /**
   * Total real de cada lista: el detalle carga solo las más recientes
   * (MAX_FILAS_DETALLE_USUARIO), para que una cuenta con miles de movimientos no
   * traiga todo de una vez.
   */
  totales: {
    encomiendas_enviadas: number;
    encomiendas_recibidas: number;
    boletos: number;
    pagos: number;
    notificaciones: number;
  };
}
