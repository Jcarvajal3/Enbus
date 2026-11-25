// ─── Tipos y consultas del área de cuenta del pasajero ───────────────────────
// Mismos select que la app (EnBusApp: SELECT_BOLETOS, SELECT_BOLETO, PAGO_ENCOMIENDA_COLUMNAS).
// Sin servidor ni cliente: sirven en páginas y en componentes "use client".

import type { PagoMinimo } from "@/lib/pasajero/estados";

/** PostgREST devuelve un embed muchos-a-uno como objeto, pero a veces como arreglo de uno. */
export function uno<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

type Uno<T> = T | T[] | null;

// ─── Boletos ─────────────────────────────────────────────────────────────────

export interface PagoBoletoFila extends PagoMinimo {
  id: string;
  tipo_pago?: string | null;
  numero_referencia?: string | null;
  banco_emisor?: string | null;
  monto?: number | string | null;
  monto_bs?: number | string | null;
  moneda?: string | null;
  monto_declarado?: number | string | null;
  tasa_bcv?: number | string | null;
  tasa_bcv_fecha?: string | null;
}

export interface RutaFila {
  ciudad_origen: string | null;
  ciudad_destino: string | null;
  duracion_estimada_min?: number | null;
}

export interface CooperativaFila {
  nombre: string | null;
  logo_url?: string | null;
}

export interface BoletoLista {
  id: string;
  codigo_boleto: string;
  asiento: string | null;
  estado: string;
  created_at: string;
  compra_id: string | null;
  reserva_expira_at: string | null;
  monto_reembolso: number | string | null;
  reembolso_procesado: boolean | null;
  pasajero_nombre: string | null;
  viajes: Uno<{ fecha_hora_salida: string | null; rutas: Uno<RutaFila> }>;
  cooperativas: Uno<CooperativaFila>;
  pago: Uno<PagoBoletoFila>;
}

export const SELECT_BOLETOS_LISTA = `id, codigo_boleto, asiento, estado, created_at, compra_id, reserva_expira_at,
  monto_reembolso, reembolso_procesado, pasajero_nombre,
  viajes ( fecha_hora_salida, rutas ( ciudad_origen, ciudad_destino ) ),
  cooperativas ( nombre, logo_url ),
  pago:pagos!boletos_pago_id_fkey ( id, estado_verificacion, tipo_pago, motivo_rechazo, created_at )`;

export interface BoletoDetalle {
  id: string;
  codigo_boleto: string;
  asiento: string | null;
  precio: number | string | null;
  estado: string;
  reserva_expira_at: string | null;
  cooperativa_id: string | null;
  comprador_id: string;
  compra_id: string | null;
  viaje_id: string | null;
  pago_id: string | null;
  motivo_cancelacion: string | null;
  monto_reembolso: number | string | null;
  reembolso_procesado: boolean | null;
  reembolso_procesado_at: string | null;
  reembolso_metodo: string | null;
  reembolso_referencia: string | null;
  qr_embarque_data: string | null;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  pasajero_telefono: string | null;
  created_at: string;
  viajes: Uno<{
    fecha_hora_salida: string | null;
    numero_unidad: string | null;
    nombre_chofer: string | null;
    rutas: Uno<RutaFila>;
  }>;
  cooperativas: Uno<CooperativaFila>;
  profiles: Uno<{ nombre_completo: string | null; cedula_rif: string | null }>;
  pago: Uno<PagoBoletoFila>;
}

export const SELECT_BOLETO = `id, codigo_boleto, asiento, precio, estado, reserva_expira_at, cooperativa_id,
  comprador_id, compra_id, viaje_id, pago_id, motivo_cancelacion, monto_reembolso,
  reembolso_procesado, reembolso_procesado_at, reembolso_metodo, reembolso_referencia,
  qr_embarque_data, pasajero_nombre, pasajero_cedula, pasajero_telefono, created_at,
  viajes ( fecha_hora_salida, numero_unidad, nombre_chofer,
           rutas ( ciudad_origen, ciudad_destino, duracion_estimada_min ) ),
  cooperativas ( nombre, logo_url ),
  profiles!comprador_id ( nombre_completo, cedula_rif ),
  pago:pagos!boletos_pago_id_fkey ( id, estado_verificacion, tipo_pago, motivo_rechazo,
    numero_referencia, banco_emisor, monto, monto_bs, moneda, monto_declarado,
    tasa_bcv, tasa_bcv_fecha, created_at )`;

/** Boletos de la misma compra (para pagar todos los asientos apartados juntos). */
export interface BoletoCompra {
  id: string;
  codigo_boleto: string;
  asiento: string | null;
  estado: string;
  precio: number | string | null;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  pasajero_telefono: string | null;
}

export const SELECT_BOLETO_COMPRA =
  "id, codigo_boleto, asiento, estado, precio, pasajero_nombre, pasajero_cedula, pasajero_telefono";

// ─── Encomiendas ─────────────────────────────────────────────────────────────

export const SELECT_ENCOMIENDAS_LISTA = `id, tracking_id, estado, ciudad_origen, ciudad_destino, receiver_nombre,
  remitente_nombre, origen_registro, sender_id, receiver_user_id, modalidad_pago, costo_calculado, created_at,
  cooperativas ( nombre, logo_url )`;

export interface EncomiendaLista {
  id: string;
  tracking_id: string | null;
  estado: string;
  ciudad_origen: string | null;
  ciudad_destino: string | null;
  receiver_nombre: string | null;
  remitente_nombre: string | null;
  origen_registro: string | null;
  sender_id: string | null;
  receiver_user_id: string | null;
  modalidad_pago: string | null;
  costo_calculado: number | string | null;
  created_at: string;
  cooperativas: Uno<CooperativaFila>;
}

export interface EncomiendaDetalle {
  id: string;
  tracking_id: string | null;
  sender_id: string | null;
  receiver_user_id: string | null;
  receiver_nombre: string | null;
  receiver_telefono: string | null;
  receiver_cedula_rif: string | null;
  descripcion_contenido: string | null;
  peso_kg: number | string | null;
  costo_calculado: number | string | null;
  modalidad_pago: string | null;
  pin_retiro: string | null;
  pin_bloqueado: boolean | null;
  foto_evidencia_url: string | null;
  foto_cliente_path: string | null;
  origen_registro: string | null;
  remitente_nombre: string | null;
  remitente_telefono: string | null;
  sucursal_origen_id: string | null;
  sucursal_destino_id: string | null;
  ciudad_origen: string | null;
  ciudad_destino: string | null;
  estado: string;
  cooperativa_id: string | null;
  created_at: string;
  cooperativas: Uno<CooperativaFila>;
}

/** Columnas del pago de una encomienda (PAGO_ENCOMIENDA_COLUMNAS de la app). */
export const PAGO_ENCOMIENDA_COLUMNAS =
  "id, encomienda_id, pagador_id, estado_verificacion, verificado, rechazado_at, motivo_rechazo, tipo_pago, monto, monto_bs, moneda, monto_declarado, tasa_bcv, tasa_bcv_fecha, numero_referencia, created_at";

export interface PagoEncomiendaFila extends PagoMinimo {
  id: string;
  encomienda_id?: string | null;
  pagador_id?: string | null;
  tipo_pago?: string | null;
  monto?: number | string | null;
  monto_bs?: number | string | null;
  moneda?: string | null;
  monto_declarado?: number | string | null;
  tasa_bcv?: number | string | null;
  tasa_bcv_fecha?: string | null;
  numero_referencia?: string | null;
}

export interface HistorialEncomiendaFila {
  id: string;
  estado_nuevo: string;
  created_at: string;
}

/** Una sucursal de la cooperativa (`fn_sucursales_en_ciudad`). */
export interface SucursalFila {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  horario: string | null;
}
