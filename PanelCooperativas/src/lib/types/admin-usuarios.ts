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
  pin_retiro: string | null;
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
  monto: number;
  tipo_pago: string;
  verificado: boolean;
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
}
