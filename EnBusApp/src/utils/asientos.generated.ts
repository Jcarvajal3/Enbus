// GENERADO por shared/generar.mjs — no editar a mano. Fuente: shared/asientos.ts

// ─── Distribución de asientos del bus ────────────────────────────────────────
// Una sola distribución para la app (elegir asientos) y el panel (vender y ver la
// ocupación), igual a la de las taquillas de las cooperativas. Con 31 asientos:
//
//   [chofer]
//    1   2  │  (puerta)
//    5   6  │   4   3
//    9  10  │   8   7
//   …
//   29  30  31  28  27        ← la última fila siempre lleva 5: uno en el pasillo
//
// - A la izquierda los pares van de ventana a pasillo (1, 2). A la derecha van una
//   fila más atrás que su par de la izquierda, porque adelante a la derecha está la
//   puerta, y también de ventana a pasillo (3 en la ventana, 4 en el pasillo).
// - El asiento del pasillo de la última fila es el último número.
// - Si el total no es 31, 35, 39…, los asientos que faltan se quitan a la derecha junto
//   a la puerta (primero el del pasillo), y la numeración sigue sin saltos.
//
// La base de datos solo guarda `asientos_totales`: la distribución sale de ese número.

/** Número de asiento ("1".."N") o null (hueco o pasillo). */
export type CeldaAsiento = string | null;

/** Columnas de cada fila: ventana izq., pasillo izq., pasillo central, pasillo der., ventana der. */
export type FilaAsientos = [CeldaAsiento, CeldaAsiento, CeldaAsiento, CeldaAsiento, CeldaAsiento];

export type DistribucionBus = {
  /** Filas del frente hacia atrás. En la primera, la derecha es la puerta (vacía). */
  filas: FilaAsientos[];
};

type Posicion = { fila: number; col: number; lado: "izq" | "der" | "centro" };

export function distribucionAsientos(total: number): DistribucionBus {
  const n = Math.max(0, Math.floor(total));
  if (n === 0) return { filas: [] };

  // Con R filas caben 4R − 1: la primera sin el lado derecho (puerta) y la última con 5.
  const totalFilas = Math.max(1, Math.ceil((n + 1) / 4));
  let sobran = 4 * totalFilas - 1 - n;

  // Posiciones en el orden de la numeración.
  const posiciones: Posicion[] = [];
  for (let f = 0; f < totalFilas; f++) {
    posiciones.push({ fila: f, col: 0, lado: "izq" }, { fila: f, col: 1, lado: "izq" });
    if (f + 1 < totalFilas) {
      posiciones.push({ fila: f + 1, col: 4, lado: "der" }, { fila: f + 1, col: 3, lado: "der" });
    }
  }
  posiciones.push({ fila: totalFilas - 1, col: 2, lado: "centro" });

  // Lo que sobra se quita junto a la puerta: a la derecha, de adelante hacia atrás y
  // primero el pasillo, sin tocar la última fila. En buses muy pequeños, luego la
  // primera fila de la izquierda (pasillo y ventana) y por último el resto.
  const ultima = totalFilas - 1;
  const quitar = new Set<Posicion>();
  const derecha = posiciones
    .filter((p) => p.lado === "der" && p.fila < ultima)
    .sort((a, b) => a.fila - b.fila || a.col - b.col);
  const frenteIzq = posiciones.filter((p) => p.lado === "izq" && p.fila === 0 && p.fila < ultima).reverse();
  const resto = [...posiciones].reverse();
  for (const p of [...derecha, ...frenteIzq, ...resto]) {
    if (quitar.has(p)) continue;
    if (sobran === 0) break;
    quitar.add(p);
    sobran--;
  }

  const filas: FilaAsientos[] = Array.from({ length: totalFilas }, () => [null, null, null, null, null]);
  let numero = 1;
  for (const p of posiciones) {
    if (quitar.has(p)) continue;
    filas[p.fila][p.col] = String(numero++);
  }
  return { filas };
}

/** Lado del asiento, para su etiqueta ("ventana" / "pasillo"). */
export function ubicacionAsiento(columna: number): "ventana" | "pasillo" {
  return columna === 0 || columna === 4 ? "ventana" : "pasillo";
}
