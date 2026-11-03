/**
 * Códigos que el pasajero ve y dicta en la taquilla (DS-09).
 *
 * La fuente es shared/artefactos.ts (copiada en ./artefactos.generated.ts por
 * shared/generar.mjs), la misma que usan el panel y la landing. Reglas completas en
 * Specs/00_General/Artefactos_Compartidos.md.
 *
 * El boleto se guarda como `BOL-7CABE4AD`; en pantalla se muestra en dos
 * bloques de 4 (`BOL-7CAB-E4AD`), más fácil de leer en voz alta. La taquilla
 * (`fn_validar_embarque`) acepta las dos formas, con espacios o minúsculas.
 *
 * El QR de una encomienda codifica su código de seguimiento (`EB-AAMMDD-NNNNN`),
 * que despacho, recepción y entrega ya aceptan; el `id` queda como respaldo.
 */

export {
  formatCodigoBoleto,
  normalizarCodigoBoleto,
  qrBoleto,
  qrEncomienda,
  TRACKING_RE,
  normalizarTracking,
  esTracking,
  PIN_RETIRO_LONGITUD,
  PIN_MAX_INTENTOS,
  PIN_VALIDACION_MINUTOS,
  pinValido,
} from './artefactos.generated';
