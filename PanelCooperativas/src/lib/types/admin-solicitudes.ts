import type { Cooperativa } from "./admin-cooperativas";

export interface SolicitudPendiente extends Cooperativa {
  // Inherits all fields including email and telefono, which are present on the cooperativas table
}
