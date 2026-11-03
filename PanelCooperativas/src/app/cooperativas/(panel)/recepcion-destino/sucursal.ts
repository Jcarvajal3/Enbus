// ─── Alcance de Recepción en destino ─────────────────────────────────────────
// Una encomienda "va" a una sucursal si su sucursal_destino_id es esa sucursal.
// Solo como respaldo, cuando la encomienda no tiene sucursal de destino (la ciudad
// tenía varias sucursales o ninguna al crearla), se compara su ciudad_destino con la
// ciudad de la sucursal.
// Se usa en el cliente (para listar) y en las server actions (para validar).
// Entrega también filtra con esto.

/** Nombres largos que las rutas guardan abreviados (igual que normalizar_localidad en SQL). */
const ALIAS_CIUDAD: Record<string, string> = {
  "san fernando de apure": "san fernando",
  "san juan de los morros": "san juan",
};

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

/**
 * "San_Cristóbal", "san cristobal" y "SAN CRISTOBAL" se comparan igual.
 * "San Fernando de Apure" equivale a "san_fernando" y "San Juan de los Morros" a "san_juan".
 */
export function normalizarCiudad(valor?: string | null): string {
  const base = (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
  return ALIAS_CIUDAD[base] ?? base;
}

/** true si la encomienda tiene como destino la sucursal indicada. */
export function vaASucursal(encomienda: DestinoEncomienda, sucursal: SucursalRecepcion): boolean {
  if (encomienda.sucursal_destino_id) {
    return encomienda.sucursal_destino_id === sucursal.id;
  }
  const ciudad = normalizarCiudad(encomienda.ciudad_destino);
  return ciudad !== "" && ciudad === normalizarCiudad(sucursal.ciudad);
}
