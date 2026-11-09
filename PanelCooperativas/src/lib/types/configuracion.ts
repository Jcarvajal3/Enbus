// ─────────────────────────────────────────────────────────────────────────────
// Cooperativa config — domain types
// ─────────────────────────────────────────────────────────────────────────────

import type { HorarioSemana } from "@/lib/horario";

/**
 * Tipos de cuenta que la cooperativa configura en Métodos de pago. No incluye el punto de venta:
 * es un cobro presencial sin cuenta (la base de datos lo impide en `metodos_pago_cooperativa`).
 */
export type TipoMetodoPago =
  | "TRANSFERENCIA_BANCARIA"
  | "PAGO_MOVIL"
  | "ZELLE"
  | "EFECTIVO";

export interface MetodoPagoCooperativa {
  id: string;
  cooperativa_id: string;
  tipo: TipoMetodoPago;
  banco: string | null;
  titular: string;
  numero_cuenta: string | null;
  cedula_rif: string | null;
  email_zelle: string | null;
  instrucciones: string | null;
  activo: boolean;
  created_at: string;
}

export interface Sucursal {
  id: string;
  cooperativa_id: string;
  nombre: string;
  /** Clave de lib/data/venezuela.ts ("carabobo"). La columna real es `estado_geografico`. */
  estado_geografico: string | null;
  /** Columna antigua; solo se lee como respaldo (`estado_geografico ?? estado`). */
  estado?: string | null;
  ciudad: string;
  direccion: string | null;
  telefono: string | null;
  /** Texto que ve la app. Si hay `horario_semana`, se genera a partir de ella (lib/horario.ts). */
  horario?: string | null;
  /** Horario por día para el editor del panel. NULL en sucursales con horario en texto libre. */
  horario_semana?: HorarioSemana | null;
  activa: boolean;
  created_at: string;
}

export interface CooperativaData {
  id: string;
  nombre: string;
  rif: string | null;
  logo_url: string | null;
  comision_porcentaje: number | null;
  /** PENDIENTE | RECHAZADA | ACTIVA | SUSPENDIDA | INACTIVA */
  estado?: string | null;
}
