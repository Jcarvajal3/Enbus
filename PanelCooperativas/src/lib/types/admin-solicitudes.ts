import type { Cooperativa } from "./admin-cooperativas";

/** Estado de la cuenta del administrador de la cooperativa. */
export type CuentaSolicitud = "CREADA" | "INVITACION_PENDIENTE" | "SIN_CUENTA";

// Hereda todos los campos de la tabla cooperativas (email, telefono, representante,
// mensaje_registro, motivo_estado…) y añade el estado de la cuenta del administrador.
export interface SolicitudPendiente extends Cooperativa {
  /** "Ya creó su cuenta" / "Invitación pendiente" / "Sin cuenta". */
  cuenta: CuentaSolicitud;
  /** Correo del administrador ya registrado o de la invitación pendiente. */
  cuenta_email?: string | null;
}

export interface SolicitudesAdmin {
  pendientes: SolicitudPendiente[];
  rechazadas: SolicitudPendiente[];
}
