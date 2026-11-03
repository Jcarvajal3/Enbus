/**
 * Códigos que el pasajero ve y dicta en la taquilla (DS-09).
 *
 * El boleto se guarda como `BOL-7CABE4AD`; en pantalla se muestra en dos
 * bloques de 4 (`BOL-7CAB-E4AD`), más fácil de leer en voz alta. La taquilla
 * (`fn_validar_embarque`) acepta las dos formas, con espacios o minúsculas.
 *
 * El QR de una encomienda codifica su código de seguimiento (`EB-AAMMDD-NNNNN`),
 * que despacho, recepción y entrega ya aceptan; el `id` queda como respaldo.
 */

const BOLETO_RE = /^BOL-?([0-9A-Z]{4})-?([0-9A-Z]{4})$/;

/** "BOL-7CABE4AD" → "BOL-7CAB-E4AD". Otros formatos se devuelven sin cambio. */
export function formatCodigoBoleto(codigo: string | null | undefined): string {
  const original = (codigo ?? '').trim();
  if (!original) return '';
  const m = original.toUpperCase().replace(/\s+/g, '').match(BOLETO_RE);
  return m ? `BOL-${m[1]}-${m[2]}` : original;
}

/** Contenido del QR de una encomienda: su código de seguimiento, o el id si aún no lo tiene. */
export function qrEncomienda(e: { tracking_id?: string | null; id: string }): string {
  const tracking = e.tracking_id?.trim();
  return tracking ? tracking : e.id;
}
