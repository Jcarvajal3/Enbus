/**
 * REF-02: Pure utility — seat grid generator extracted from SeatSelector.tsx.
 *
 * Keeping this as a standalone pure function makes it:
 *   1. Independently unit-testable without mounting the component.
 *   2. Shareable if another screen ever needs the same layout.
 *   3. Easier to extend (e.g. 3+2 layout for larger coaches).
 *
 * Layout: standard Venezuelan interurban coach — 2 seats | aisle | 2 seats per row.
 * The aisle is represented as an empty string '' inside the row array.
 */

/** A single row of seat labels. Empty string ('') represents the aisle. */
export type SeatRow = string[];

/**
 * Generates a 2+2 bus seat grid for `total` seats.
 * Returns an array of rows, each containing 5 elements: [left1, left2, '', right1, right2].
 * The last row may have fewer seats if total is not divisible by 4.
 *
 * @example
 * generarAsientos(8)
 * // => [['1','2','','3','4'], ['5','6','','7','8']]
 */
export function generarAsientos(total: number): SeatRow[] {
  const filas: SeatRow[] = [];
  let numero = 1;

  while (numero <= total) {
    const fila: SeatRow = [];

    // Left side (up to 2 seats)
    if (numero <= total) fila.push(String(numero++));
    if (numero <= total) fila.push(String(numero++));

    // Aisle separator
    fila.push('');

    // Right side (up to 2 seats)
    if (numero <= total) fila.push(String(numero++));
    if (numero <= total) fila.push(String(numero++));

    filas.push(fila);
  }

  return filas;
}
