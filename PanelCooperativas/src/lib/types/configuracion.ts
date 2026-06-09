// ─────────────────────────────────────────────────────────────────────────────
// Cooperativa config — domain types
// ─────────────────────────────────────────────────────────────────────────────

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
  estado: string;
  ciudad: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
  created_at: string;
}

export interface CooperativaData {
  id: string;
  nombre: string;
  rif: string | null;
  logo_url: string | null;
  comision_porcentaje: number | null;
}
