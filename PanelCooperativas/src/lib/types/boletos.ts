import type { EstadoUiBoleto, PagoResumen } from "@/lib/types/pagos";

export type EstadoBoleto = "RESERVADO" | "PAGADO" | "USADO" | "CANCELADO" | "EXPIRADO";
export type { EstadoUiBoleto };

export interface Boleto {
  id: string;
  codigo_boleto: string;
  comprador_id: string | null; // NULL si venta presencial sin cuenta
  viaje_id: string;
  cooperativa_id: string;
  /** Número de asiento "1".."N" (mismo formato en app y panel). */
  asiento: string;
  /** USD de referencia (rutas.precio_pasaje al reservar). */
  precio: number;
  estado: EstadoBoleto;
  qr_embarque_data: string | null;
  created_at: string;
  updated_at?: string;
  /** Agrupa los asientos comprados juntos. */
  compra_id?: string;
  /** Pago que cubre la compra (embed `pago:pagos!boletos_pago_id_fkey`). */
  pago_id?: string | null;
  /** Vence la reserva sin pagar; null con pago en verificación. */
  reserva_expira_at?: string | null;
  motivo_cancelacion?: string | null;
  /** USD de referencia; se paga en Bs a la tasa del día del reembolso. */
  monto_reembolso?: number | null;
  embarcado_at?: string | null;
  embarcado_por?: string | null;
  /** La cooperativa ya devolvió el dinero (fase 3: `fn_registrar_reembolso`). */
  reembolso_procesado?: boolean;
  reembolso_procesado_at?: string | null;
  /** Medio de la devolución: PAGO_MOVIL, TRANSFERENCIA_BANCARIA, ZELLE o EFECTIVO. */
  reembolso_metodo?: string | null;
  reembolso_referencia?: string | null;
  reembolso_nota?: string | null;
  // Joined
  viaje?: {
    id: string;
    fecha_hora_salida: string;
    numero_unidad?: string | null;
    ruta: {
      ciudad_origen: string;
      estado_origen: string;
      ciudad_destino: string;
      estado_destino: string;
    };
  };
  pago?: PagoResumen | null;
  /** Estado visible (ver getEstadoUiBoleto en lib/types/pagos). */
  estado_ui?: EstadoUiBoleto;
  // Datos del pasajero (copiados al boleto; el personal no lee perfiles de clientes)
  pasajero_nombre?: string | null;
  pasajero_cedula?: string | null;
  pasajero_telefono?: string | null;
}
