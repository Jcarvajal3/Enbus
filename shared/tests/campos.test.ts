// Pruebas de los campos con máscara, de leerMonto y de bancos: node --experimental-strip-types --test shared/tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import { DECIMALES_TASA, editarMonto, leerMonto, MONTO_PLACEHOLDER } from "../dinero.ts";
import { BANCOS_VE, buscarBanco, buscarBancos, etiquetaBanco, mostrarBanco, OPCIONES_BANCO, OTRO_BANCO } from "../bancos.ts";
import {
  CEDULA_ERROR,
  CEDULA_PLACEHOLDER,
  editarCedulaNumero,
  editarTelefono,
  LETRAS_ENCOMIENDA,
  LETRAS_PASAJERO,
  LETRAS_PERSONA,
  LETRAS_TITULAR,
  mascaraCedulaNumero,
  mostrarTelefono,
  telefonoParaGuardar,
  TELEFONO_ERROR,
  TELEFONO_PLACEHOLDER,
  telefonoValido,
} from "../ve.ts";

// ─── Teléfono ────────────────────────────────────────────────────────────────

/** Simula escribir `texto` letra a letra, como lo haría el campo. */
function escribir(texto: string, inicial = ""): string {
  let visible = inicial;
  for (const c of texto) visible = editarTelefono(visible, visible + c);
  return visible;
}

test("editarTelefono: escribir dígito a dígito", () => {
  assert.equal(escribir("0"), "0");
  assert.equal(escribir("0414"), "0414-");
  assert.equal(escribir("04141234"), "0414-123.4");
  assert.equal(escribir("04141234567"), "0414-123.45.67");
  assert.equal(escribir("041412345678999"), "0414-123.45.67");
  assert.equal(escribir("4141234567"), "0414-123.45.67");
});

test("editarTelefono: prefijo internacional a medio escribir", () => {
  assert.equal(editarTelefono("", "+"), "+");
  assert.equal(editarTelefono("+", "+5"), "+5");
  assert.equal(editarTelefono("+5", "+58"), "+58");
  assert.equal(editarTelefono("+58", "+58 "), "+58");
  assert.equal(editarTelefono("+58", "+584"), "04");
  assert.equal(escribir("+584141234567"), "0414-123.45.67");
  assert.equal(escribir("584141234567"), "0414-123.45.67");
  assert.equal(editarTelefono("", "5"), "+5");
  // Borrar el prefijo letra a letra.
  assert.equal(editarTelefono("+58", "+5"), "+5");
  assert.equal(editarTelefono("+5", "+"), "+");
  assert.equal(editarTelefono("+", ""), "");
});

test("editarTelefono: pegado completo", () => {
  assert.equal(editarTelefono("", "+58 414 1234567"), "0414-123.45.67");
  assert.equal(editarTelefono("", "0414-1234567"), "0414-123.45.67");
  assert.equal(editarTelefono("0414-123.45.67", "0412-9876543"), "0412-987.65.43");
});

test("editarTelefono: borrar sobre un separador borra el dígito anterior", () => {
  assert.equal(editarTelefono("0414-", "0414"), "041");
  assert.equal(editarTelefono("0414-123.4", "0414-1234"), "0414-124");
  assert.equal(editarTelefono("0414-123.45.67", "0414-123.4567"), "0414-123.46.7");
  assert.equal(editarTelefono("0414-123.45.67", "0414-12345.67"), "0414-124.56.7");
  // Borrar un dígito normal.
  assert.equal(editarTelefono("0414-123.45.67", "0414-123.45.6"), "0414-123.45.6");
});

test("editarTelefono: al borrar no deja el separador al final", () => {
  assert.equal(editarTelefono("0414-1", "0414-"), "0414");
  assert.equal(editarTelefono("0414-123.4", "0414-123."), "0414-123");
  // Y seguir escribiendo desde ahí vuelve a poner el guion.
  assert.equal(editarTelefono("0414", "04145"), "0414-5");
});

test("editarTelefono: vacío, nulos y marcadores PENDIENTE", () => {
  assert.equal(editarTelefono("", ""), "");
  assert.equal(editarTelefono(null, null), "");
  assert.equal(editarTelefono(undefined, "abc"), "");
  assert.equal(editarTelefono("", "PENDIENTE-abc"), "");
  assert.equal(editarTelefono("0414-123", ""), "");
});

test("mostrarTelefono: valor guardado, a medias o con prefijo", () => {
  assert.equal(mostrarTelefono("0414-1234567"), "0414-123.45.67");
  assert.equal(mostrarTelefono("0414-123.45.67"), "0414-123.45.67");
  assert.equal(mostrarTelefono("+58 414 1234567"), "0414-123.45.67");
  assert.equal(mostrarTelefono("0414"), "0414");
  assert.equal(mostrarTelefono("0414-"), "0414-");
  assert.equal(mostrarTelefono("+58"), "+58");
  assert.equal(mostrarTelefono("+ 5"), "+5");
  assert.equal(mostrarTelefono("PENDIENTE-x"), "");
  assert.equal(mostrarTelefono(null), "");
});

test("teléfono: lo que se escribe se puede guardar", () => {
  const visible = escribir("04141234567");
  assert.equal(telefonoValido(visible), true);
  assert.equal(telefonoParaGuardar(visible), "0414-1234567");
});

test("placeholders y errores usan el formato con puntos", () => {
  assert.equal(TELEFONO_PLACEHOLDER, "Ej. 0414-123.45.67");
  assert.match(TELEFONO_ERROR, /0414-123\.45\.67/);
  assert.equal(CEDULA_PLACEHOLDER, "Ej. 12.345.678");
  assert.match(CEDULA_ERROR, /V-12345678/);
  assert.equal(MONTO_PLACEHOLDER, "Ej. 1.250,00");
});

// ─── Cédula ──────────────────────────────────────────────────────────────────

test("mascaraCedulaNumero: puntos de miles, solo dígitos, máximo 10", () => {
  assert.equal(mascaraCedulaNumero(""), "");
  assert.equal(mascaraCedulaNumero(null), "");
  assert.equal(mascaraCedulaNumero("1"), "1");
  assert.equal(mascaraCedulaNumero("123"), "123");
  assert.equal(mascaraCedulaNumero("1234"), "1.234");
  assert.equal(mascaraCedulaNumero("12345678"), "12.345.678");
  assert.equal(mascaraCedulaNumero("12.345.678"), "12.345.678");
  assert.equal(mascaraCedulaNumero("V-12.345.678"), "12.345.678");
  assert.equal(mascaraCedulaNumero("1234567890123"), "1.234.567.890");
  assert.equal(mascaraCedulaNumero("abc"), "");
});

test("editarCedulaNumero: borrar un punto borra el dígito anterior", () => {
  assert.equal(editarCedulaNumero("12.345.678", "12345.678"), "1.345.678");
  assert.equal(editarCedulaNumero("12.345.678", "12.345678"), "1.234.678");
  assert.equal(editarCedulaNumero("1.234", "1234"), "234");
  // Borrar un dígito, escribir y pegar.
  assert.equal(editarCedulaNumero("12.345.678", "12.345.67"), "1.234.567");
  assert.equal(editarCedulaNumero("12.345", "12.3456"), "123.456");
  assert.equal(editarCedulaNumero("", "v-12.345.678"), "12.345.678");
  assert.equal(editarCedulaNumero("", ""), "");
  assert.equal(editarCedulaNumero(null, undefined), "");
});

test("letras de cédula por contexto", () => {
  assert.deepEqual([...LETRAS_PERSONA], ["V", "E"]);
  assert.deepEqual([...LETRAS_PASAJERO], ["V", "E", "P"]);
  assert.deepEqual([...LETRAS_ENCOMIENDA], ["V", "E", "J", "P"]);
  assert.deepEqual([...LETRAS_TITULAR], ["V", "E", "J", "G", "P"]);
});

// ─── Montos ──────────────────────────────────────────────────────────────────

test("leerMonto y editarMonto: más decimales (tasa BCV)", () => {
  assert.equal(leerMonto("36,4567"), null);
  assert.equal(leerMonto("36,4567", { decimales: DECIMALES_TASA }), 36.4567);
  assert.equal(leerMonto("1.036,45678", { decimales: DECIMALES_TASA }), null);
  // Un punto con 3 cifras sigue siendo de miles aunque se admitan más decimales.
  assert.equal(leerMonto("36.456", { decimales: DECIMALES_TASA }), 36456);
  assert.equal(editarMonto("36,456", "36,4567", DECIMALES_TASA), "36,4567");
  assert.equal(editarMonto("36,4567", "36,45678", DECIMALES_TASA), "36,4567");
  assert.equal(editarMonto("36,45", "36,456"), "36,45");
  // Un solo punto con 1..decimalesMax cifras (salvo exactamente 3) es decimal al pegar.
  assert.equal(editarMonto("", "36.4567", DECIMALES_TASA), "36,4567");
  assert.equal(editarMonto("", "36.45", DECIMALES_TASA), "36,45");
  assert.equal(editarMonto("", "36.456", DECIMALES_TASA), "36.456");
  assert.equal(editarMonto("", "36.4567"), "364.567");
});

test("leerMonto: formato venezolano", () => {
  assert.equal(leerMonto("1.250,50"), 1250.5);
  assert.equal(leerMonto("1250,50"), 1250.5);
  assert.equal(leerMonto("1250,5"), 1250.5);
  assert.equal(leerMonto("1.250"), 1250);
  assert.equal(leerMonto("1.250.000"), 1250000);
  assert.equal(leerMonto("1.250.000,99"), 1250000.99);
  assert.equal(leerMonto("12,5"), 12.5);
  assert.equal(leerMonto("12,50"), 12.5);
  assert.equal(leerMonto("0,5"), 0.5);
  assert.equal(leerMonto(",5"), 0.5);
  assert.equal(leerMonto("12,"), 12);
  assert.equal(leerMonto("1250"), 1250);
  assert.equal(leerMonto("7"), 7);
});

test("leerMonto: punto decimal con 1 o 2 cifras", () => {
  assert.equal(leerMonto("12.5"), 12.5);
  assert.equal(leerMonto("12.50"), 12.5);
  assert.equal(leerMonto("1250.50"), 1250.5);
  assert.equal(leerMonto("0.50"), 0.5);
});

test("leerMonto: prefijos y sufijos de moneda", () => {
  assert.equal(leerMonto("Bs 1.250,00"), 1250);
  assert.equal(leerMonto("Bs. 1.250,00"), 1250);
  assert.equal(leerMonto("bs1.250,00"), 1250);
  assert.equal(leerMonto("$12"), 12);
  assert.equal(leerMonto("$ 12,40"), 12.4);
  assert.equal(leerMonto("USD 12,40"), 12.4);
  assert.equal(leerMonto("US$12"), 12);
  assert.equal(leerMonto("12 Bs."), 12);
  assert.equal(leerMonto("  1.250,00  "), 1250);
  assert.equal(leerMonto("1 250,00"), 1250);
  assert.equal(leerMonto("1 250,00"), 1250);
});

test("leerMonto: inválidos devuelven null", () => {
  for (const malo of [
    "", " ", "abc", "-5", "+5", "-", ",", ".", "Bs", "$", "0", "0,00", "0,001", "12,345", "1,234.56",
    "1.25,50", "1..250", "1.2.3", "12.345,6,7", "12,5,", "1.250.00", "5e3", "12a", "1.2500", "0.500", "0.5.0",
    "1.234567890123,00", "NaN", "Infinity",
  ]) {
    assert.equal(leerMonto(malo), null, `"${malo}" debería ser null`);
  }
  assert.equal(leerMonto(null), null);
  assert.equal(leerMonto(undefined), null);
});

test("leerMonto: ambigüedad documentada del punto", () => {
  // Un punto con exactamente 3 cifras detrás son miles; con 1 o 2, decimal.
  assert.equal(leerMonto("1.250"), 1250);
  assert.equal(leerMonto("12.345"), 12345);
  assert.equal(leerMonto("1.25"), 1.25);
  assert.equal(leerMonto("1.2"), 1.2);
});

test("leerMonto: cero solo si se permite", () => {
  assert.equal(leerMonto("0", { permitirCero: true }), 0);
  assert.equal(leerMonto("0,00", { permitirCero: true }), 0);
  assert.equal(leerMonto("-0", { permitirCero: true }), null);
  assert.equal(leerMonto("abc", { permitirCero: true }), null);
});

/** Simula escribir `texto` tecla a tecla en un campo de monto. */
function escribirMonto(texto: string, inicial = ""): string {
  let visible = inicial;
  for (const c of texto) visible = editarMonto(visible, visible + c);
  return visible;
}

test("editarMonto: máscara en vivo", () => {
  assert.equal(escribirMonto("1250"), "1.250");
  assert.equal(escribirMonto("1250000"), "1.250.000");
  assert.equal(escribirMonto("1250,5"), "1.250,5");
  assert.equal(escribirMonto("1250,567"), "1.250,56");
  assert.equal(escribirMonto("1250.5"), "1.250,5");
  assert.equal(escribirMonto("12,"), "12,");
  assert.equal(escribirMonto(",5"), "0,5");
  assert.equal(escribirMonto("007"), "7");
  assert.equal(escribirMonto("0"), "0");
  assert.equal(escribirMonto("abc"), "");
  assert.equal(escribirMonto("1,2,3"), "1,23");
});

test("editarMonto: pegado y borrado", () => {
  assert.equal(editarMonto("", "Bs 1.250,00"), "1.250,00");
  assert.equal(editarMonto("", "1.250"), "1.250");
  assert.equal(editarMonto("", "12.5"), "12,5");
  assert.equal(editarMonto("1.250", "12.5"), "12,5");
  assert.equal(editarMonto("", "$12"), "12");
  // Al borrar, los puntos del campo son miles.
  assert.equal(editarMonto("12.505", "12.50"), "1.250");
  assert.equal(editarMonto("1.250", "1.25"), "125");
  assert.equal(editarMonto("1.250,50", "1.250,5"), "1.250,5");
  assert.equal(editarMonto("1.250,5", "1.250,"), "1.250,");
  assert.equal(editarMonto("1", ""), "");
  // Seguir escribiendo con puntos de miles ya puestos.
  assert.equal(editarMonto("1.250", "1.2505"), "12.505");
  assert.equal(editarMonto("12.505", "12.505."), "12.505,");
  assert.equal(editarMonto(null, null), "");
});

test("editarMonto: lo que muestra se lee con leerMonto", () => {
  for (const texto of ["1250,5", "1250000", "12,34", "0,5", "999999999999,99"]) {
    const visible = escribirMonto(texto);
    assert.equal(leerMonto(visible), leerMonto(texto), `"${visible}"`);
  }
});

// ─── Bancos ──────────────────────────────────────────────────────────────────

test("bancos: lista única sin códigos ni nombres repetidos", () => {
  assert.equal(new Set(BANCOS_VE.map((b) => b.codigo)).size, BANCOS_VE.length);
  assert.equal(new Set(BANCOS_VE.map((b) => b.nombre)).size, BANCOS_VE.length);
  for (const b of BANCOS_VE) assert.match(b.codigo, /^\d{4}$/);
  assert.equal(OPCIONES_BANCO.at(-1), OTRO_BANCO);
  assert.equal(OPCIONES_BANCO.length, BANCOS_VE.length + 1);
  assert.equal(etiquetaBanco(BANCOS_VE[1]), "0134 · Banesco");
});

test("bancos: búsqueda por nombre, código y alias sin tildes", () => {
  assert.equal(buscarBancos("").length, BANCOS_VE.length);
  assert.equal(buscarBancos(null).length, BANCOS_VE.length);
  assert.equal(buscarBancos("banes")[0].codigo, "0134");
  assert.equal(buscarBancos("BANESCO")[0].codigo, "0134");
  assert.deepEqual(buscarBancos("0134").map((b) => b.nombre), ["Banesco"]);
  assert.equal(buscarBancos("bicentenario")[0].codigo, "0175");
  assert.equal(buscarBancos("bod")[0].codigo, "0191");
  assert.equal(buscarBancos("credito").some((b) => b.codigo === "0104"), true);
  assert.equal(buscarBancos("crédito").some((b) => b.codigo === "0191"), true);
  assert.equal(buscarBancos("agricola")[0].codigo, "0166");
  assert.equal(buscarBancos("  fondo   comun ")[0].codigo, "0151");
  assert.deepEqual(buscarBancos("zzzz"), []);
});

test("bancos: los que empiezan por lo escrito van primero", () => {
  const r = buscarBancos("banco");
  assert.equal(r.length > 3, true);
  assert.equal(r[0].nombre.toLowerCase().startsWith("banco"), true);
});

test("bancos: reconocer lo guardado", () => {
  assert.equal(buscarBanco("0134 · Banesco")?.nombre, "Banesco");
  assert.equal(buscarBanco("0134")?.nombre, "Banesco");
  assert.equal(buscarBanco("bicentenario")?.codigo, "0175");
  assert.equal(buscarBanco("Otro banco"), null);
  assert.equal(buscarBanco(""), null);
  assert.equal(mostrarBanco("banesco"), "0134 · Banesco");
  assert.equal(mostrarBanco("Banco Raro"), "Banco Raro");
  assert.equal(mostrarBanco(null), "");
});
