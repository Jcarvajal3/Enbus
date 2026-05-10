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
export type TipoPago = "DIGITAL" | "EFECTIVO";

export interface Encomienda {
  id: string;
  tracking_id: string;
  sender_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  receiver_cedula_rif: string;
  cooperativa_id: string | null;
  estado_origen: string;
  ciudad_origen: string;
  estado_destino: string;
  ciudad_destino: string;
  descripcion_contenido: string;
  peso_kg: number | null;
  costo_calculado: number | null;
  modalidad_pago: ModalidadPago;
  estado: EstadoEncomienda;
  foto_evidencia_url: string | null;
  qr_data: string | null;
  created_at: string;
  // Joined
  sender?: { nombre_completo: string };
}

export interface Pago {
  id: string;
  encomienda_id: string | null;
  monto: number;
  tipo_pago: TipoPago;
  numero_referencia: string | null;
  fecha_transaccion: string | null;
  banco_emisor: string | null;
  verificado: boolean;
}
