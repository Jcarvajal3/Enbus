export type EstadoBoleto = "RESERVADO" | "PAGADO" | "USADO" | "CANCELADO" | "EXPIRADO";

export interface Boleto {
  id: string;
  codigo_boleto: string;
  comprador_id: string | null; // NULL si venta presencial sin cuenta
  viaje_id: string;
  cooperativa_id: string;
  asiento: string;
  precio: number;
  estado: EstadoBoleto;
  qr_embarque_data: string | null;
  created_at: string;
  // Joined
  viaje?: {
    id: string;
    fecha_hora_salida: string;
    ruta: {
      ciudad_origen: string;
      estado_origen: string;
      ciudad_destino: string;
      estado_destino: string;
    };
  };
  // Datos manuales (pasajero sin cuenta) — almacenados en metadata o columnas extra
  pasajero_nombre?: string;
  pasajero_cedula?: string;
  pasajero_telefono?: string;
}
