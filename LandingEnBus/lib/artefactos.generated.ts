// GENERADO por shared/generar.mjs — no editar a mano. Fuente: shared/artefactos.ts

// ─── Artefactos que el cliente ve, dicta o escanea (fuente única) ────────────
// Código de boleto, QR del pase, código de seguimiento de encomienda y PIN de retiro.
// Reglas completas en Specs/00_General/Artefactos_Compartidos.md.
//
// TS puro: sin imports, sin `\p{…}` ni lookbehind (Hermes). `node shared/generar.mjs`
// lo copia como `artefactos.generated.ts` en los tres proyectos: no editar las copias.

// ─── Boleto ──────────────────────────────────────────────────────────────────
// Se guarda como `BOL-7CABE4AD`; se muestra en dos bloques de 4 (`BOL-7CAB-E4AD`),
// más fácil de leer en voz alta. La taquilla (`fn_validar_embarque`) acepta las dos
// formas, con espacios, minúsculas o el prefijo del QR `PASS-`.

const BOLETO_RE = /^BOL-?([0-9A-Z]{4})-?([0-9A-Z]{4})$/;
const BOLETO_NORMALIZADO_RE = /^BOL([0-9A-Z]{8})$/;

/** "BOL-7CABE4AD" → "BOL-7CAB-E4AD". Otros formatos se devuelven sin cambio. */
export function formatCodigoBoleto(codigo: string | null | undefined): string {
  const original = (codigo ?? "").trim();
  if (!original) return "";
  const m = original.toUpperCase().replace(/\s+/g, "").match(BOLETO_RE);
  return m ? `BOL-${m[1]}-${m[2]}` : original;
}

/**
 * Lo que se escribió o escaneó → forma guardada: "bol 7cab-e4ad", "BOL-7CAB-E4AD" o
 * "PASS-BOL-7CABE4AD" → "BOL-7CABE4AD" (igual que fn_validar_embarque). Si no parece un
 * código de boleto, devuelve el texto sin espacios a los lados y en mayúsculas.
 */
export function normalizarCodigoBoleto(entrada: string): string {
  const texto = (entrada ?? "").trim().toUpperCase();
  let compacto = texto.replace(/[^A-Z0-9]/g, "");
  if (compacto.startsWith("PASS")) compacto = compacto.slice(4);
  const m = compacto.match(BOLETO_NORMALIZADO_RE);
  return m ? `BOL-${m[1]}` : texto;
}

/** Contenido del QR del pase de abordaje: `qr_embarque_data`, o `PASS-<código>` si no lo tiene. */
export function qrBoleto(b: { codigo_boleto: string; qr_embarque_data?: string | null }): string {
  const qr = b.qr_embarque_data?.trim();
  return qr ? qr : `PASS-${b.codigo_boleto}`;
}

// ─── Encomienda ──────────────────────────────────────────────────────────────
// Código de seguimiento `EB-AAMMDD-NNNNN` (trigger generar_tracking_id). El QR de la
// guía codifica ese mismo código; el `id` queda como respaldo si aún no lo tiene.

export const TRACKING_RE = /^EB-\d{6}-\d{5}$/;

/** Sin espacios (ni a los lados ni dentro) y en mayúsculas: " eb-261004- 46719" → "EB-261004-46719". */
export function normalizarTracking(entrada: string): string {
  return (entrada ?? "").replace(/\s+/g, "").toUpperCase();
}

/** true si el texto (normalizado) es un código de seguimiento. */
export function esTracking(v: string): boolean {
  return TRACKING_RE.test(normalizarTracking(v));
}

/** Contenido del QR de una encomienda: su código de seguimiento, o el id si aún no lo tiene. */
export function qrEncomienda(e: { tracking_id?: string | null; id: string }): string {
  const tracking = e.tracking_id?.trim();
  return tracking ? tracking : e.id;
}

// ─── PIN de retiro ───────────────────────────────────────────────────────────
// 4 dígitos; se bloquea a los 10 intentos fallidos; validarlo deja 15 minutos para
// entregar (fn_validar_pin_retiro / fn_entregar_encomienda). Se imprime en la guía.

export const PIN_RETIRO_LONGITUD = 4;
export const PIN_MAX_INTENTOS = 10;
export const PIN_VALIDACION_MINUTOS = 15;

/** true si son exactamente 4 dígitos (se ignoran espacios a los lados). */
export function pinValido(v: string): boolean {
  return /^\d{4}$/.test((v ?? "").trim());
}
