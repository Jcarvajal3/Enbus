// ─── Pagos, cobros y respuestas de las RPC de fase 2 ─────────────────────────
// Las RPC devuelven jsonb (sin tipos generados): estos tipos son el contrato
// manual de Audits/fase2_spec.md §3.2. Montos: `monto`/`*_usd` = USD de
// referencia; `monto_bs` = Bs esperados a la tasa usada; `moneda` = moneda en
// que pagó el cliente.

import { formatFechaHoraCortaVE } from "@/lib/fechas";
import type { EstadoBoleto } from "@/lib/types/boletos";

export type TipoPago = "DIGITAL" | "EFECTIVO";
export type MonedaPago = "VES" | "USD";
export type EstadoVerificacion = "PENDIENTE" | "APROBADO" | "RECHAZADO";
export type TipoMetodoPago = "EFECTIVO" | "PAGO_MOVIL" | "TRANSFERENCIA_BANCARIA" | "ZELLE";

// ── Tasa BCV ──

export type TasaBCV = {
  /** Bs por 1 USD. */
  tasa: number;
  /** Fecha de vigencia 'YYYY-MM-DD'. */
  fecha: string;
  fuente: "dolarapi" | "manual";
  /** Días desde la fecha de vigencia (hoy en Caracas). */
  diasAntiguedad: number;
  /** Última actualización (ISO). */
  actualizadaAt: string | null;
};

type FilaTasaBCV = {
  tasa: number | string;
  fecha: string;
  fuente: string;
  dias_antiguedad: number | null;
  actualizada_at: string | null;
};

/**
 * true si la tasa tiene 2 días o más sin actualizarse (o no hay tasa).
 * Vive aquí (no en el provider "use client") para poder usarla también en Server Components.
 */
export function esTasaDesactualizada(tasa: TasaBCV | null | undefined): boolean {
  return !tasa || tasa.diasAntiguedad >= 2;
}

/** Convierte la fila de `fn_tasa_bcv_vigente` al formato del panel (servidor y cliente). */
export function filaATasaBCV(fila: FilaTasaBCV | null | undefined): TasaBCV | null {
  if (!fila) return null;
  const tasa = Number(fila.tasa);
  if (!Number.isFinite(tasa) || tasa <= 0 || !fila.fecha) return null;
  return {
    tasa,
    fecha: String(fila.fecha).slice(0, 10),
    fuente: fila.fuente === "manual" ? "manual" : "dolarapi",
    diasAntiguedad: Number(fila.dias_antiguedad ?? 0),
    actualizadaAt: fila.actualizada_at ?? null,
  };
}

// ── Fila de la tabla pagos ──

export interface Pago {
  id: string;
  boleto_id?: string | null;
  encomienda_id: string | null;
  pagador_id?: string | null;
  cooperativa_id?: string | null;
  metodo_pago_id?: string | null;
  /** USD de referencia esperado. */
  monto: number;
  /** Bs esperados (null en pagos anteriores a la fase 2). */
  monto_bs?: number | null;
  tasa_bcv?: number | null;
  tasa_bcv_fecha?: string | null;
  moneda?: MonedaPago;
  /** Lo que el cliente dice que pagó (o lo recibido en taquilla), en `moneda`. */
  monto_declarado?: number | null;
  tipo_pago: TipoPago;
  numero_referencia: string | null;
  fecha_transaccion: string | null;
  banco_emisor: string | null;
  verificado: boolean;
  verificado_por?: string | null;
  verificado_at?: string | null;
  rechazado_at?: string | null;
  rechazado_por?: string | null;
  motivo_rechazo?: string | null;
  estado_verificacion?: EstadoVerificacion;
  created_at?: string;
}

/** Embed `pago:pagos!boletos_pago_id_fkey(...)` desde boletos. */
export type PagoResumen = Pick<Pago, "id" | "tipo_pago" | "monto"> &
  Partial<Pick<Pago, "monto_bs" | "moneda" | "monto_declarado" | "tasa_bcv" | "tasa_bcv_fecha"
    | "numero_referencia" | "banco_emisor" | "motivo_rechazo" | "created_at">> & {
    estado_verificacion: EstadoVerificacion;
  };

// ── Estado visible de un boleto ──

export type EstadoUiBoleto =
  | Exclude<EstadoBoleto, "RESERVADO">
  | "RESERVA_SIN_PAGAR"
  | "PAGO_EN_VERIFICACION"
  | "PAGO_RECHAZADO";

/** Espejo de `estado_ui_boleto(estado, pago.estado_verificacion)` del servidor. */
export function getEstadoUiBoleto(
  estado: EstadoBoleto,
  pagoEstado?: EstadoVerificacion | null
): EstadoUiBoleto {
  if (estado !== "RESERVADO") return estado;
  if (pagoEstado === "PENDIENTE") return "PAGO_EN_VERIFICACION";
  if (pagoEstado === "RECHAZADO") return "PAGO_RECHAZADO";
  return "RESERVA_SIN_PAGAR";
}

// ── Bandeja "Pagos por verificar" (fn_pagos_por_verificar) ──

export type PagadorRol = "PASAJERO" | "REMITENTE" | "DESTINATARIO" | "OTRO";

export interface PagoPorVerificar {
  pago_id: string;
  creado_at: string;
  tipo_recurso: "boleto" | "encomienda";
  compra_id: string | null;
  boleto_ids: string[] | null;
  /** "BOL-AAAA, BOL-BBBB" */
  codigos_boletos: string | null;
  /** "14, 15" */
  asientos: string | null;
  encomienda_id: string | null;
  tracking_id: string | null;
  encomienda_estado: string | null;
  modalidad_pago: "ORIGEN" | "DESTINO" | null;
  viaje_salida: string | null;
  /** "Valencia → Caracas" */
  ruta: string | null;
  /** Los boletos vencieron/se cancelaron o la encomienda se cerró. */
  recurso_vencido: boolean;
  cliente_nombre: string | null;
  cliente_cedula: string | null;
  cliente_telefono: string | null;
  pagador_rol: PagadorRol;
  metodo_tipo: TipoMetodoPago | null;
  cuenta_banco: string | null;
  cuenta_titular: string | null;
  /** Últimos 4 dígitos de la cuenta o teléfono destino. */
  cuenta_final: string | null;
  cuenta_email_zelle: string | null;
  banco_emisor: string | null;
  numero_referencia: string | null;
  fecha_transaccion: string | null;
  moneda: MonedaPago;
  /** Monto esperado en `moneda` (null en pagos en Bs anteriores a la fase 2). */
  esperado: number | null;
  declarado: number | null;
  /** declarado − esperado (negativo = falta dinero). */
  diferencia: number | null;
  monto_usd: number;
  monto_bs: number | null;
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
  estado_verificacion: EstadoVerificacion;
  motivo_rechazo: string | null;
  /** La misma referencia aparece en otro pago no rechazado de la cooperativa. */
  referencia_repetida: boolean;
  /** Capture del pago en el bucket privado `comprobantes-pago` (obligatorio en Pago Móvil). */
  comprobante_path: string | null;
  /** URL firmada del capture; solo la trae `obtenerPago`. Null si no se pudo firmar. */
  comprobante_url?: string | null;
}

/** "04/10 · 8:00 a. m." en hora de Venezuela (salida de un viaje) = `formatFechaHoraCortaVE`. */
export function formatSalidaCorta(iso: string): string {
  return formatFechaHoraCortaVE(iso);
}

/**
 * Concepto de un pago para la bandeja y el diálogo (servidor y cliente):
 * "2 boletos · Valencia → Caracas · 04/10 · 8:00 a. m. · asientos 14, 15" / "Encomienda EB-… · cobro en destino".
 */
export function conceptoDePago(p: PagoPorVerificar): string {
  if (p.tipo_recurso === "encomienda") {
    const cobro = p.modalidad_pago === "DESTINO" ? "cobro en destino" : "cobro en origen";
    return `Encomienda ${p.tracking_id ?? ""} · ${cobro}`;
  }
  const n = p.boleto_ids?.length ?? 1;
  const partes = [n === 1 ? "1 boleto" : `${n} boletos`];
  if (p.ruta) partes.push(p.ruta);
  // "3:56 a. m." sin cortes de línea dentro de la hora (el concepto se ajusta en la tabla).
  if (p.viaje_salida) partes.push(formatSalidaCorta(p.viaje_salida).replace(/ ([ap])\. m\./g, "\u00a0$1.\u00a0m."));
  if (p.asientos) partes.push(`${p.asientos.includes(",") ? "asientos" : "asiento"} ${p.asientos}`);
  return partes.join(" · ");
}

export type ResultadoAprobarPago = {
  ok: boolean;
  boletos_activados?: number;
  encomienda_id?: string;
  ya_procesado?: boolean;
};

export type ResultadoRechazarPago = {
  ok: boolean;
  /** Boletos cancelados por el rechazo: sus asientos quedaron libres. */
  boletos_liberados?: number;
  ya_procesado?: boolean;
};

// ── Compras de boletos (Resumen) ──

export type BoletoResumen = {
  id: string;
  codigo_boleto: string;
  asiento: string;
  estado: EstadoBoleto;
  estado_ui: EstadoUiBoleto;
  precio_usd: number;
  reserva_expira_at: string | null;
  qr_embarque_data: string | null;
  /** Fase 3: datos del pasajero de cada asiento (`fn_asignar_pasajeros`). */
  pasajero_nombre?: string | null;
  pasajero_cedula?: string | null;
  pasajero_telefono?: string | null;
};

export type PagoDeCompra = {
  id: string;
  estado: EstadoVerificacion;
  monto_usd: number;
  monto_bs: number | null;
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
  moneda: MonedaPago;
  monto_declarado: number | null;
  motivo_rechazo: string | null;
};

export interface ResumenCompra {
  compra_id: string;
  server_now: string;
  viaje_id: string | null;
  cooperativa_id: string | null;
  boletos: BoletoResumen[];
  total_usd: number | null;
  reserva_expira_at: string | null;
  pago: PagoDeCompra | null;
  /** La operación ya se había hecho con la misma clave de idempotencia. */
  repetido?: boolean;
}

/** Elemento de `p_pasajeros` de `fn_asignar_pasajeros`. */
export type PasajeroAsiento = {
  asiento: string;
  nombre: string;
  cedula: string;
  telefono?: string | null;
};

/** `fn_asignar_pasajeros(p_compra_id, p_pasajeros)` */
export interface ResultadoAsignarPasajeros extends ResumenCompra {
  actualizados: number;
  /** Asientos que siguen sin nombre o cédula válidos. */
  asientos_sin_datos: string[];
}

/** Datos de cobro que devuelven las RPC de taquilla. */
export type CobroTaquilla = {
  moneda: MonedaPago;
  esperado: number;
  recibido: number;
  vuelto: number;
  total_usd?: number;
  total_bs?: number;
  tasa?: number;
  tasa_fecha?: string;
};

export type BoletoImpresion = {
  codigo_boleto: string;
  qr: string | null;
  asiento: string;
  pasajero: string | null;
  cedula: string | null;
};

/** `fn_vender_boletos_taquilla` */
export interface VentaTaquilla extends ResumenCompra {
  impresion: BoletoImpresion[];
  salida: string;
  cobro: CobroTaquilla;
}

/** `fn_cobrar_reserva_taquilla` */
export interface CobroReservaTaquilla extends ResumenCompra {
  cobro?: CobroTaquilla;
}

// ── Embarque (fn_validar_embarque / fn_confirmar_embarque) ──

export type ResultadoEmbarqueTipo =
  | "VALIDO"
  | "USADO"
  | "CANCELADO"
  | "EXPIRADO"
  | "VIAJE_CANCELADO"
  | "OTRO_VIAJE"
  | "OTRO_DIA"
  | "PAGO_EN_VERIFICACION"
  | "PAGO_RECHAZADO"
  | "RESERVA_SIN_PAGAR"
  | "NO_ENCONTRADO"
  | "OTRA_COOPERATIVA";

export type PagoEmbarque = {
  id: string;
  estado: EstadoVerificacion;
  tipo_pago: TipoPago;
  banco_emisor: string | null;
  numero_referencia: string | null;
  fecha_transaccion: string | null;
  monto_usd: number;
  monto_bs: number | null;
  moneda: MonedaPago;
  monto_declarado: number | null;
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
  motivo_rechazo: string | null;
  metodo_pago_id: string | null;
};

export type ResultadoEmbarque =
  | {
      resultado: "NO_ENCONTRADO" | "OTRA_COOPERATIVA";
      codigo: string;
    }
  | {
      resultado: Exclude<ResultadoEmbarqueTipo, "NO_ENCONTRADO" | "OTRA_COOPERATIVA">;
      /** Días entre la salida y hoy (negativo = ya pasó). */
      dias_diferencia: number;
      boleto: {
        id: string;
        codigo_boleto: string;
        asiento: string;
        estado: EstadoBoleto;
        compra_id: string;
        pasajero_nombre: string | null;
        pasajero_cedula: string | null;
        embarcado_at: string | null;
        updated_at: string | null;
        motivo_cancelacion: string | null;
        reserva_expira_at: string | null;
        precio_usd: number;
      };
      viaje: {
        id: string;
        salida: string;
        estado: string;
        unidad: string | null;
        origen: string;
        destino: string;
      };
      pago: PagoEmbarque | null;
    };

// ── Encomiendas: cobro, recepción y despacho ──

/** `fn_registrar_pago_encomienda` / `fn_cobrar_encomienda_taquilla` */
export type CobroEncomienda = {
  pago_id: string;
  estado: "PENDIENTE" | "APROBADO";
  encomienda_estado?: string;
  monto_usd?: number;
  monto_bs?: number;
  tasa_bcv?: number;
  tasa_bcv_fecha?: string;
  moneda?: MonedaPago;
  monto_declarado?: number;
  esperado?: number;
  recibido?: number;
  vuelto?: number;
  repetido?: boolean;
};

/** `fn_cotizar_encomienda` */
export type CotizacionEncomienda = {
  costo_usd: number;
  costo_bs: number | null;
  peso_max_kg: number;
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
};

/** `fn_confirmar_recepcion_origen` */
export type RecepcionOrigen = {
  estado: "POR_PAGAR";
  costo_usd: number;
  costo_bs?: number | null;
  tasa_bcv?: number | null;
  tasa_bcv_fecha?: string | null;
  modalidad_pago: "ORIGEN" | "DESTINO";
  repetido?: boolean;
};

export type ResultadoDespachoTipo =
  | "OK"
  | "NO_ENCONTRADA"
  | "OTRO_DESTINO"
  | "OTRO_ORIGEN"
  | "POR_PAGAR"
  | "SIN_RECIBIR"
  | "YA_DESPACHADA"
  | "CERRADA"
  | "OTRA_COOPERATIVA";

/** `fn_validar_encomienda_despacho` */
export type ResultadoDespacho =
  | { resultado: "NO_ENCONTRADA"; codigo: string }
  | {
      resultado: Exclude<ResultadoDespachoTipo, "NO_ENCONTRADA">;
      encomienda: {
        id: string;
        tracking_id: string;
        estado: string;
        modalidad_pago: "ORIGEN" | "DESTINO";
        ciudad_origen: string;
        ciudad_destino: string;
        receiver_nombre: string;
        peso_kg: number | null;
        costo_usd: number | null;
        cobro_en_destino: boolean;
      };
      viaje: {
        origen: string;
        destino: string;
        salida: string;
        unidad: string | null;
        estado: string;
      };
    };

/** Elemento de `details.rechazadas` de `EB_DESPACHO_INVALIDO`. */
export type EncomiendaRechazadaDespacho = {
  id: string;
  resultado: ResultadoDespachoTipo | "VIAJE_NO_ENCONTRADO";
  tracking_id: string | null;
  ciudad_destino: string | null;
};

/** `fn_despachar_encomiendas` */
export type DespachoRealizado = { despachadas: number; cobro_en_destino: number };

/** `fn_marcar_salida_viaje` */
export type SalidaViaje = {
  estado: "EN_CURSO";
  reservas_liberadas?: number;
  pagos_en_verificacion?: number;
  ya_procesado?: boolean;
};

// ── Fase 3: cotización pública de envíos ──

/** Opción por cooperativa de `fn_cotizar_envio_publico`. */
export type OpcionCotizacionEnvio = {
  cooperativa_id: string;
  cooperativa: string;
  calificacion: number | null;
  duracion_min: number | null;
  costo_usd: number;
  costo_bs: number | null;
};

/** `fn_cotizar_envio_publico(p_peso_kg, p_ciudad_origen, p_ciudad_destino)` */
export type CotizacionEnvioPublica = {
  peso_max_kg: number;
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
  opciones: OpcionCotizacionEnvio[];
};
