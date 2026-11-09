// ─── Reembolsos de boletos y cancelación de viajes (fase 3, #27) ─────────────
// Contrato manual de Audits/fase3_spec.md §3.2 (`fn_reembolsos`,
// `fn_registrar_reembolso`, `fn_cancelar_viaje`). Montos en USD de referencia:
// la devolución se hace en Bs a la tasa BCV del día en que se paga.

import type { EstadoVerificacion, MonedaPago, TipoMetodoPago } from "@/lib/types/pagos";

export type FiltroReembolsos = "PENDIENTE" | "PROCESADO" | "TODOS";

export type CanceladoPor = "PASAJERO" | "COOPERATIVA";

/** Medio con que la cooperativa devolvió el dinero (el punto de venta no es un medio de devolución). */
export type MetodoReembolso = Exclude<TipoMetodoPago, "PUNTO_DE_VENTA">;

/** Fila de `fn_reembolsos(p_estado)`. */
export interface Reembolso {
  boleto_id: string;
  codigo_boleto: string;
  compra_id: string | null;
  asiento: string;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  /** Comprador (perfil) o, si no hay, el pasajero. */
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  viaje_salida: string;
  /** "Caracas → Valencia" */
  ruta: string;
  cancelado_at: string;
  motivo_cancelacion: string | null;
  cancelado_por: CanceladoPor;
  /** USD de referencia a devolver (95 % si canceló el pasajero, 100 % si la cooperativa). */
  monto_usd: number;
  pago_id: string | null;
  /** Tipo del método de pago con que pagó el pasajero (o `tipo_pago` del pago). */
  pago_metodo: TipoMetodoPago | "DIGITAL" | null;
  pago_banco_emisor: string | null;
  pago_referencia: string | null;
  pago_moneda: MonedaPago | null;
  pago_estado: EstadoVerificacion | null;
  procesado: boolean;
  procesado_at: string | null;
  reembolso_metodo: MetodoReembolso | null;
  reembolso_referencia: string | null;
  reembolso_nota: string | null;
}

/** Parámetros de `fn_registrar_reembolso`. */
export type RegistrarReembolsoParams = {
  p_boleto_ids: string[];
  p_metodo: MetodoReembolso;
  /** Obligatoria (≥ 4 caracteres) salvo en efectivo. */
  p_referencia: string | null;
  p_nota?: string | null;
};

/** `fn_registrar_reembolso` */
export type ResultadoRegistrarReembolso = {
  procesados: number;
  ya_procesados: number;
};

/** `fn_cancelar_viaje` */
export type ResultadoCancelarViaje = {
  estado: "CANCELADO";
  boletos_reembolso?: number;
  reservas_anuladas?: number;
  total_reembolso_usd?: number;
  encomiendas_en_transito?: number;
  ya_procesado?: boolean;
};

/** Impacto que se muestra antes de cancelar un viaje (`checkBoletosVendidos` ampliada). */
export type ImpactoCancelarViaje = {
  pagados: number;
  total_usd: number;
  reservas: number;
  pagos_pendientes: number;
  encomiendas_en_transito: number;
};
