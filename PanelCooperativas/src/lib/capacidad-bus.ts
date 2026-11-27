// Capacidad por defecto de una salida sin bus (viaje extra, horarios): el tamaño de
// bus más común entre los buses activos de la cooperativa; sin buses, 31.

export const CAPACIDAD_BASE = 31;

/**
 * Moda de `asientos` entre los buses; en empate, el menor (así no se vende de más si
 * luego se asigna el bus más pequeño). Sin buses, `CAPACIDAD_BASE`.
 */
export function capacidadHabitual(buses: readonly { asientos: number }[]): number {
  const cuenta = new Map<number, number>();
  for (const b of buses) {
    if (Number.isInteger(b.asientos) && b.asientos > 0) cuenta.set(b.asientos, (cuenta.get(b.asientos) ?? 0) + 1);
  }
  let mejor = CAPACIDAD_BASE;
  let veces = 0;
  for (const [asientos, n] of cuenta) {
    if (n > veces || (n === veces && asientos < mejor)) {
      mejor = asientos;
      veces = n;
    }
  }
  return mejor;
}
