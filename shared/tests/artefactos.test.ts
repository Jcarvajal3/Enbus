// Pruebas de shared/artefactos.ts: node --experimental-strip-types --test shared/tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esTracking,
  formatCodigoBoleto,
  normalizarCodigoBoleto,
  normalizarTracking,
  pinValido,
  PIN_MAX_INTENTOS,
  PIN_RETIRO_LONGITUD,
  PIN_VALIDACION_MINUTOS,
  qrBoleto,
  qrEncomienda,
  TRACKING_RE,
} from "../artefactos.ts";

test("boleto: formato para mostrar", () => {
  assert.equal(formatCodigoBoleto("BOL-7CABE4AD"), "BOL-7CAB-E4AD");
  assert.equal(formatCodigoBoleto(" bol-7cab-e4ad "), "BOL-7CAB-E4AD");
  assert.equal(formatCodigoBoleto("OTRO-123"), "OTRO-123");
  assert.equal(formatCodigoBoleto(null), "");
});

test("boleto: lo escrito o escaneado vuelve a la forma guardada (como fn_validar_embarque)", () => {
  assert.equal(normalizarCodigoBoleto("bol 7cab-e4ad"), "BOL-7CABE4AD");
  assert.equal(normalizarCodigoBoleto("BOL-7CAB-E4AD"), "BOL-7CABE4AD");
  assert.equal(normalizarCodigoBoleto("PASS-BOL-7CABE4AD"), "BOL-7CABE4AD");
  assert.equal(normalizarCodigoBoleto(" algo raro "), "ALGO RARO");
});

test("boleto: contenido del QR", () => {
  assert.equal(qrBoleto({ codigo_boleto: "BOL-7CABE4AD" }), "PASS-BOL-7CABE4AD");
  assert.equal(qrBoleto({ codigo_boleto: "BOL-7CABE4AD", qr_embarque_data: "  " }), "PASS-BOL-7CABE4AD");
  assert.equal(qrBoleto({ codigo_boleto: "BOL-7CABE4AD", qr_embarque_data: "QR-1" }), "QR-1");
});

test("encomienda: código de seguimiento", () => {
  assert.equal(normalizarTracking(" eb-261004- 46719"), "EB-261004-46719");
  assert.equal(normalizarTracking("EB26100446719"), "EB-261004-46719");
  assert.equal(normalizarTracking("eb_261004.46719"), "EB-261004-46719");
  assert.equal(normalizarTracking("otro"), "OTRO");
  assert.equal(esTracking("eb 261004 46719"), true);
  assert.equal(esTracking("EB-261004-4671"), false);
  assert.equal(TRACKING_RE.test("EB-261004-46719"), true);
  assert.equal(qrEncomienda({ tracking_id: "EB-261004-46719", id: "uuid" }), "EB-261004-46719");
  assert.equal(qrEncomienda({ tracking_id: null, id: "uuid" }), "uuid");
});

test("PIN de retiro (igual que fn_validar_pin_retiro / fn_entregar_encomienda)", () => {
  assert.equal(PIN_RETIRO_LONGITUD, 4);
  assert.equal(PIN_MAX_INTENTOS, 10);
  assert.equal(PIN_VALIDACION_MINUTOS, 15);
  assert.equal(pinValido("0123"), true);
  assert.equal(pinValido(" 0123 "), true);
  assert.equal(pinValido("123"), false);
  assert.equal(pinValido("12a4"), false);
  assert.equal(pinValido("12345"), false);
});
