// Pruebas de shared/asientos.ts: node --experimental-strip-types --test shared/tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import { distribucionAsientos } from "../asientos.ts";

test("31 asientos: como el bus de la taquilla (31 en el pasillo de atrás)", () => {
  const { filas } = distribucionAsientos(31);
  assert.deepEqual(filas[0], ["1", "2", null, null, null]);
  assert.deepEqual(filas[1], ["5", "6", null, "4", "3"]);
  assert.deepEqual(filas[2], ["9", "10", null, "8", "7"]);
  assert.deepEqual(filas.at(-1), ["29", "30", "31", "28", "27"]);
  assert.equal(filas.length, 8);
});

test("30 asientos: falta uno junto a la puerta y la última fila sigue con 5", () => {
  const { filas } = distribucionAsientos(30);
  assert.deepEqual(filas[0], ["1", "2", null, null, null]);
  assert.deepEqual(filas[1], ["4", "5", null, null, "3"]);
  assert.deepEqual(filas.at(-1), ["28", "29", "30", "27", "26"]);
});

test("la última fila lleva 5 asientos desde 7 en adelante", () => {
  for (let n = 7; n <= 60; n++) {
    const ultima = distribucionAsientos(n).filas.at(-1)!;
    assert.ok(ultima.every((c) => c !== null), `total ${n}: ${ultima.join(",")}`);
    assert.equal(ultima[2], String(n), `total ${n}: el del pasillo es el último`);
  }
});

test("cada asiento aparece una sola vez, para cualquier total", () => {
  for (let n = 0; n <= 60; n++) {
    const todos = distribucionAsientos(n).filas.flat().filter((a): a is string => a !== null);
    assert.deepEqual(
      [...todos].sort((a, b) => Number(a) - Number(b)),
      Array.from({ length: n }, (_, i) => String(i + 1)),
      `total ${n}`
    );
  }
});
