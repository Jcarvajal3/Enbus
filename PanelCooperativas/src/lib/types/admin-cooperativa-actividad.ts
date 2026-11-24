// ─── Actividad de una cooperativa, vista del super admin ────────────────────
// Viajes, boletos, encomiendas y pagos de UNA cooperativa. Cada lista llega ya
// paginada desde el servidor (`?pagina=`) y filtrada (`?estado=&desde=&hasta=`),
// porque una cooperativa con actividad puede tener miles de filas.

/** Filas por página de cada lista de la ficha. */
export const FILAS_ACTIVIDAD = 25;

export const PESTANAS_ACTIVIDAD = ["viajes", "boletos", "encomiendas", "pagos"] as const;
export type PestanaActividad = (typeof PESTANAS_ACTIVIDAD)[number];

export const ESTADOS_VIAJE = ["PROGRAMADO", "EN_CURSO", "COMPLETADO", "CANCELADO"] as const;
export const ESTADOS_BOLETO = ["RESERVADO", "PAGADO", "USADO", "CANCELADO", "EXPIRADO"] as const;
export const ESTADOS_ENCOMIENDA = [
  "PENDIENTE_DE_ESCANEO",
  "EN_RECEPCION",
  "POR_PAGAR",
  "PAGADA",
  "EN_TRANSITO",
  "EN_OFICINA_DESTINO",
  "ENTREGADA",
  "CANCELADA",
  "DEVUELTA",
] as const;
export const ESTADOS_PAGO = ["PENDIENTE", "APROBADO", "RECHAZADO"] as const;

/** Filtros leídos de la URL y ya validados. Cadena vacía = sin filtro. */
export interface FiltrosActividad {
  estado: string;
  /** 'YYYY-MM-DD' (hora de Venezuela) o "". */
  desde: string;
  hasta: string;
  /** Desde 1. */
  pagina: number;
}

/** Cifras de la cabecera de la ficha (siempre se calculan; cada una puede fallar sola). */
export interface ResumenActividad {
  viajes_total: number | null;
  /** Programados que todavía no han salido. */
  viajes_proximos: number | null;
  /** Boletos PAGADO o USADO. */
  boletos_vendidos: number | null;
  encomiendas_total: number | null;
  encomiendas_en_curso: number | null;
  pagos_total: number | null;
  /** Pagos que esperan verificación de la cooperativa. */
  pagos_por_verificar: number | null;
  /** Σ pagos verificados, USD de referencia. null si no se pudo calcular. */
  ingresos_usd: number | null;
  /** Σ de los Bs de los pagos verificados que tienen Bs registrados. */
  ingresos_bs: number | null;
}

export interface PaginaActividad<T> {
  filas: T[];
  total: number;
  pagina: number;
  porPagina: number;
  /** La consulta falló: la lista no está vacía, no se pudo cargar. */
  error: string | null;
}

export interface ViajeActividad {
  id: string;
  ciudad_origen: string;
  ciudad_destino: string;
  salida: string;
  llegada_estimada: string;
  numero_unidad: string | null;
  nombre_chofer: string | null;
  asientos_totales: number;
  asientos_disponibles: number;
  estado: string;
}

export interface BoletoActividad {
  id: string;
  codigo_boleto: string;
  asiento: string;
  precio: number;
  estado: string;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  ciudad_origen: string | null;
  ciudad_destino: string | null;
  salida: string | null;
  created_at: string;
}

export interface EncomiendaActividad {
  id: string;
  tracking_id: string;
  estado: string;
  ciudad_origen: string;
  ciudad_destino: string;
  remitente: string | null;
  destinatario: string;
  costo: number | null;
  peso_kg: number | null;
  pin_bloqueado: boolean;
  created_at: string;
}

export interface PagoActividad {
  id: string;
  monto: number;
  monto_bs: number | null;
  moneda: "VES" | "USD";
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
  tipo_pago: string;
  metodo_tipo: string | null;
  estado_verificacion: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  numero_referencia: string | null;
  boleto_codigo: string | null;
  encomienda_tracking_id: string | null;
  created_at: string;
}

/** Lo que la página manda a la ficha: solo la lista de la pestaña abierta. */
export type ActividadPestana =
  | { tab: "viajes"; datos: PaginaActividad<ViajeActividad> }
  | { tab: "boletos"; datos: PaginaActividad<BoletoActividad> }
  | { tab: "encomiendas"; datos: PaginaActividad<EncomiendaActividad> }
  | { tab: "pagos"; datos: PaginaActividad<PagoActividad> };
