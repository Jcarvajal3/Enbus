// Pruebas de shared/ve.ts: node --experimental-strip-types --test shared/tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cedulaParaGuardar,
  digitoVerificadorRif,
  fechaHoraVEaISO,
  fechaVE,
  formatCedula,
  formatCiudad,
  formatDuracion,
  formatFechaCalendario,
  formatFechaHoraVE,
  formatFechaVE,
  formatHaceTiempo,
  formatHoraVE,
  formatRuta,
  formatTelefono,
  isValidRif,
  mascaraTelefono,
  mismaCiudad,
  normalizarCedula,
  normalizarCiudad,
  normalizarTelefono,
  normalizeRif,
  rangoDiaVE,
  RIF_PLACEHOLDER,
  rifDigitoValido,
  separarCedula,
  sumarDiasVE,
  telefonoParaGuardar,
  telefonoWhatsApp,
} from "../ve.ts";

test("cédula: normaliza como normalizar_cedula (SQL)", () => {
  assert.equal(normalizarCedula("v-12.345.678"), "V12345678");
  assert.equal(normalizarCedula("12345678"), "V12345678");
  assert.equal(normalizarCedula("E 0081234567"), "E81234567");
  assert.equal(normalizarCedula("J-00012345-6"), "J123456");
  assert.equal(normalizarCedula("1234"), null);
  assert.equal(normalizarCedula("12345678901"), null);
  assert.equal(normalizarCedula("X12345678"), null);
  assert.equal(normalizarCedula("PENDIENTE-abc"), null);
  assert.equal(normalizarCedula(null), null);
  assert.equal(normalizarCedula(""), null);
});

test("cédula: formato y forma guardada", () => {
  assert.equal(formatCedula("v12345678"), "V-12.345.678");
  assert.equal(formatCedula("J123456789"), "J-12345678-9");
  // RIF jurídico con ceros a la izquierda: no se pierden al mostrarlo.
  assert.equal(formatCedula("J-00012345-6"), "J-00012345-6");
  assert.equal(formatCedula("G200003030"), "G-20000303-0");
  assert.equal(formatCedula("basura"), "—");
  assert.equal(cedulaParaGuardar("v-12.345.678"), "V-12345678");
  assert.equal(cedulaParaGuardar("123"), null);
  assert.deepEqual(separarCedula("e-1.234.567"), { letra: "E", numero: "1234567" });
  assert.deepEqual(separarCedula("PENDIENTE-x"), { letra: "V", numero: "" });
});

test("teléfono: normaliza como normalizar_telefono (SQL)", () => {
  assert.equal(normalizarTelefono("0414-123.45.67"), "4141234567");
  assert.equal(normalizarTelefono("+58 414 1234567"), "4141234567");
  assert.equal(normalizarTelefono("4141234567"), "4141234567");
  assert.equal(normalizarTelefono("0212-5551234"), "2125551234");
  assert.equal(normalizarTelefono("0314-1234567"), null);
  assert.equal(normalizarTelefono("041412345"), null);
  assert.equal(normalizarTelefono("PENDIENTE-123"), null);
  assert.equal(formatTelefono("04141234567"), "0414-123.45.67");
  assert.equal(telefonoParaGuardar("+584141234567"), "0414-1234567");
  assert.equal(telefonoWhatsApp("0414 123 4567"), "584141234567");
});

test("teléfono: máscara progresiva", () => {
  assert.equal(mascaraTelefono(""), "");
  assert.equal(mascaraTelefono("041"), "041");
  assert.equal(mascaraTelefono("0414"), "0414-");
  assert.equal(mascaraTelefono("04141234"), "0414-123.4");
  assert.equal(mascaraTelefono("04141234567"), "0414-123.45.67");
  assert.equal(mascaraTelefono("041412345678999"), "0414-123.45.67");
  assert.equal(mascaraTelefono("4141234567"), "0414-123.45.67");
  assert.equal(mascaraTelefono("+58 414 1234567"), "0414-123.45.67");
  // "+58 0414…" no duplica el 0.
  assert.equal(mascaraTelefono("+58 0414 1234567"), "0414-123.45.67");
});

test("RIF: normaliza y valida la forma", () => {
  assert.equal(normalizeRif("j123456789"), "J-12345678-9");
  assert.equal(normalizeRif("J 12.345.678-9"), "J-12345678-9");
  assert.equal(normalizeRif("J-1234567-8"), null);
  assert.equal(normalizeRif("X-12345678-9"), null);
  assert.equal(normalizeRif(undefined), null);
  assert.equal(isValidRif("G-20000303-0"), true);
});

test("RIF: dígito verificador (módulo 11 del SENIAT)", () => {
  // RIF públicos conocidos.
  assert.equal(digitoVerificadorRif("G-20000303"), 0); // SENIAT
  assert.equal(digitoVerificadorRif("J-00124134-5"), 5); // CANTV
  assert.equal(digitoVerificadorRif("J-12345678"), 4);
  assert.equal(rifDigitoValido("J-00124134-5"), true);
  assert.equal(rifDigitoValido("J-00124134-6"), false);
  assert.equal(rifDigitoValido("G-20000303-0"), true);
  // El ejemplo que se muestra en los formularios es un RIF válido.
  assert.equal(rifDigitoValido(RIF_PLACEHOLDER), true);
  // C (comunal): sin tabla oficial, se acepta cualquier dígito.
  assert.equal(digitoVerificadorRif("C-12345678"), null);
  assert.equal(rifDigitoValido("C-12345678-1"), true);
  assert.equal(rifDigitoValido("no es rif"), false);
  assert.equal(digitoVerificadorRif("J-123"), null);
});

test("ciudades: normalizar_localidad y nombres legibles", () => {
  assert.equal(normalizarCiudad("Puerto La Cruz"), "puerto_la_cruz");
  assert.equal(normalizarCiudad("  MÉRIDA "), "merida");
  assert.equal(normalizarCiudad("San Juan de los Morros"), "san_juan");
  assert.equal(normalizarCiudad("san_fernando_de_apure"), "san_fernando");
  assert.equal(normalizarCiudad(""), "");
  assert.equal(formatCiudad("merida"), "Mérida");
  assert.equal(formatCiudad("puerto_la_cruz"), "Puerto La Cruz");
  assert.equal(formatCiudad("san_juan"), "San Juan de los Morros");
  assert.equal(formatCiudad("VALENCIA"), "Valencia");
  assert.equal(formatRuta("puerto_la_cruz → valencia"), "Puerto La Cruz → Valencia");
  assert.equal(mismaCiudad("Mérida", "merida"), true);
  assert.equal(mismaCiudad("", ""), false);
});

test("fechas: día en Venezuela sin depender de la zona del proceso", () => {
  // 23:30 en Venezuela del 3 de octubre = 03:30 UTC del 4.
  assert.equal(fechaVE("2026-10-04T03:30:00Z"), "2026-10-03");
  assert.equal(fechaVE("2026-10-04T04:00:00Z"), "2026-10-04");
  assert.equal(fechaVE("2026-10-03"), "2026-10-03");
  assert.equal(fechaVE(new Date("2026-01-01T03:59:59.999Z")), "2025-12-31");
  assert.throws(() => fechaVE("no es fecha"), RangeError);
  assert.equal(fechaHoraVEaISO("2026-10-03", "20:15"), "2026-10-04T00:15:00.000Z");
  assert.throws(() => fechaHoraVEaISO("2026-10-3", "20:15"), RangeError);
  assert.deepEqual(rangoDiaVE("2026-10-03"), {
    desde: "2026-10-03T04:00:00.000Z",
    hasta: "2026-10-04T03:59:59.999Z",
  });
  assert.equal(sumarDiasVE("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDiasVE("2026-03-01", -1), "2026-02-28");
  assert.equal(formatFechaCalendario("2026-10-04"), "04/10/2026");
  assert.equal(formatFechaCalendario("otra cosa"), "otra cosa");
});

test("fechas: formatos legibles deterministas", () => {
  assert.equal(formatFechaVE("2026-10-04T03:30:00Z"), "03/10/2026");
  assert.equal(formatFechaVE("basura"), "");
  assert.equal(formatHoraVE("2026-10-03T18:30:00Z"), "2:30 p. m.");
  assert.equal(formatHoraVE("2026-10-03T04:05:00Z"), "12:05 a. m.");
  assert.equal(formatHoraVE("2026-10-03T16:05:00Z"), "12:05 p. m.");
  assert.equal(formatHoraVE("07:05"), "7:05 a. m.");
  assert.equal(formatHoraVE("19:45:00"), "7:45 p. m.");
  assert.equal(formatHoraVE("25:00"), "");
  assert.equal(formatFechaHoraVE("2026-10-03T18:30:00Z"), "03/10/2026 · 2:30 p. m.");
  assert.equal(formatFechaHoraVE(""), "");
});

test("fechas: el formato a mano coincide con Intl (America/Caracas) desde 2016", () => {
  const fecha = new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // Los espacios varían según la versión de ICU (normal, U+00A0, U+202F).
  const plano = (s: string) => s.replace(/[\s  ]+/g, " ").toLowerCase();
  const desde = Date.UTC(2016, 5, 1);
  const hasta = Date.UTC(2030, 0, 1);
  for (let i = 0; i < 500; i++) {
    const d = new Date(desde + Math.floor(((hasta - desde) * i) / 500) + i * 61_000);
    assert.equal(formatFechaVE(d), fecha.format(d), d.toISOString());
    assert.equal(plano(formatHoraVE(d)), plano(hora.format(d)), d.toISOString());
  }
});

test("tiempo relativo", () => {
  const ahora = new Date("2026-10-03T18:00:00Z"); // 2:00 p. m. en Venezuela
  assert.equal(formatHaceTiempo("2026-10-03T17:59:30Z", ahora), "hace un momento");
  assert.equal(formatHaceTiempo("2026-10-03T17:55:00Z", ahora), "hace 5 min");
  assert.equal(formatHaceTiempo("2026-10-03T15:00:00Z", ahora), "hace 3 h");
  assert.equal(formatHaceTiempo("2026-10-03T00:30:00Z", ahora), "ayer a las 8:30 p. m.");
  assert.equal(formatHaceTiempo("2026-09-25T15:00:00Z", ahora), "vie. 25/09");
  assert.equal(formatHaceTiempo("2025-09-25T15:00:00Z", ahora), "jue. 25/09/2025");
  assert.equal(formatHaceTiempo("no", ahora), "");
});

test("duración", () => {
  assert.equal(formatDuracion(45), "45 min");
  assert.equal(formatDuracion(510), "8 h 30 min");
  assert.equal(formatDuracion(480), "8 h");
  assert.equal(formatDuracion(0), "0 min");
  assert.equal(formatDuracion(-1), "");
  assert.equal(formatDuracion(Number.NaN), "");
});
