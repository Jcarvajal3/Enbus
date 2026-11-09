import type { Pago, TipoPago } from "@/lib/types/pagos";

// `Pago` vive en lib/types/pagos; se re-exporta aquí por compatibilidad.
export type { Pago, TipoPago };

export type EstadoEncomienda =
  | "PENDIENTE_DE_ESCANEO"
  | "EN_RECEPCION"
  | "POR_PAGAR"
  | "PAGADA"
  | "EN_TRANSITO"
  | "EN_OFICINA_DESTINO"
  | "ENTREGADA"
  | "CANCELADA"
  | "DEVUELTA";

export type ModalidadPago = "ORIGEN" | "DESTINO";

export interface Encomienda {
  id: string;
  tracking_id: string;
  sender_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  receiver_cedula_rif: string;
  receiver_user_id?: string | null;
  cooperativa_id: string | null;
  estado_origen: string;
  ciudad_origen: string;
  estado_destino: string;
  ciudad_destino: string;
  sucursal_origen_id?: string | null;
  sucursal_destino_id?: string | null;
  viaje_id?: string | null;
  descripcion_contenido: string;
  peso_kg: number | null;
  /** USD de referencia (tarifas en USD). Se cobra en Bs a la tasa BCV. */
  costo_calculado: number | null;
  modalidad_pago: ModalidadPago;
  estado: EstadoEncomienda;
  /** Foto de la taquilla: ruta en el bucket privado (filas antiguas: URL). Ver lib/fotos. */
  foto_evidencia_url: string | null;
  qr_data: string | null;
  created_at: string;
  updated_at?: string;
  valor_declarado?: number | null;
  pin_retiro?: string | null;
  intentos_pin?: number;
  pin_bloqueado?: boolean;
  // ── Fase 3 ──
  /** 'APP' (la registró el cliente) o 'TAQUILLA' (alta presencial: `sender_id` es el empleado). */
  origen_registro?: OrigenRegistro;
  /**
   * Nombre de quien envía. TAQUILLA: el remitente real (`sender_id` es el empleado).
   * APP: copia del nombre del perfil del cliente al registrarla (el personal no
   * puede leer `profiles` del cliente). Cédula y teléfono solo en las de TAQUILLA.
   */
  remitente_nombre?: string | null;
  remitente_cedula?: string | null;
  remitente_telefono?: string | null;
  /** Foto que subió el remitente desde la app (ruta en el bucket). */
  foto_cliente_path?: string | null;
  /** Motivo por el que la taquilla omitió la foto. */
  foto_omitida_motivo?: string | null;
  entregada_at?: string | null;
  retiro_tercero?: boolean;
  retiro_nombre?: string | null;
  retiro_cedula?: string | null;
  entrega_sin_pin_motivo?: string | null;
  // Joined
  sender?: { nombre_completo: string };
}

export type OrigenRegistro = "APP" | "TAQUILLA";

/** Nombre, cédula y teléfono de quien envía o recibe (alta presencial). */
export type PersonaEncomienda = {
  nombre: string;
  cedula: string;
  telefono: string;
};

// ─── Resultados de las RPC de encomiendas (fase 3, Audits/fase3_spec.md §3.2) ─

/** `fn_registrar_encomienda_taquilla` */
export type RegistroEncomiendaTaquilla = {
  encomienda_id: string;
  tracking_id: string;
  estado: EstadoEncomienda;
  costo_usd: number | null;
  costo_bs?: number | null;
  tasa_bcv?: number | null;
  tasa_bcv_fecha?: string | null;
  peso_max_kg?: number;
  modalidad_pago: ModalidadPago;
  pin_retiro: string | null;
  /** Ya se había registrado con la misma clave de idempotencia. */
  repetido?: boolean;
};

/** `fn_rechazar_encomienda_origen` */
export type ResultadoRechazoEncomienda = {
  estado: "CANCELADA";
  ya_procesado?: boolean;
};

/** `fn_validar_pin_retiro` (no lanza error con un PIN incorrecto: cuenta el intento). */
export type ValidacionPinRetiro = {
  valido: boolean;
  bloqueado: boolean;
  intentos_restantes: number;
};

/** `fn_entregar_encomienda` */
export type ResultadoEntrega = {
  estado: "ENTREGADA";
  entregada_at: string;
  retiro_nombre?: string | null;
  retiro_cedula?: string | null;
  sin_pin?: boolean;
  ya_procesado?: boolean;
};

/** `fn_desbloquear_pin` */
export type ResultadoDesbloqueoPin = {
  ok: boolean;
  intentos_previos: number;
};

/** Fila de `fn_sucursales_en_ciudad(p_cooperativa_id, p_ciudad)`. */
export type SucursalPunto = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  horario: string | null;
  ciudad: string;
  estado_geografico: string;
};
