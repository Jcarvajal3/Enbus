// ─── Alcance de Recepción en destino ─────────────────────────────────────────
// Una encomienda "va" a una sucursal si su sucursal_destino_id es esa sucursal.
// Solo como respaldo, cuando la encomienda no tiene sucursal de destino (la ciudad
// tenía varias sucursales o ninguna al crearla), se compara su ciudad_destino con la
// ciudad de la sucursal.
// Se usa en el cliente (para listar) y en las server actions (para validar).
// Entrega también filtra con esto.

import { mismaCiudad } from "@/lib/ciudades";

/** Misma regla que `normalizar_localidad` (SQL): "San Juan de los Morros" → "san_juan". */
export { normalizarCiudad } from "@/lib/ciudades";

export type SucursalRecepcion = {
  id: string;
  nombre: string;
  ciudad: string;
  estado_geografico: string;
};

export type DestinoEncomienda = {
  sucursal_destino_id?: string | null;
  ciudad_destino?: string | null;
};

/** true si la encomienda tiene como destino la sucursal indicada. */
export function vaASucursal(encomienda: DestinoEncomienda, sucursal: SucursalRecepcion): boolean {
  if (encomienda.sucursal_destino_id) {
    return encomienda.sucursal_destino_id === sucursal.id;
  }
  return mismaCiudad(encomienda.ciudad_destino, sucursal.ciudad);
}
