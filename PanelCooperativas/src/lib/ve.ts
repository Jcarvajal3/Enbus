// ─── Cédula y teléfono venezolanos ───────────────────────────────────────────
// Espejo de `normalizar_cedula` / `normalizar_telefono` (SQL, migración
// 20260719000001) y de EnBusApp/src/utils/validation.ts: mismas reglas en la
// base, la app y el panel. Los marcadores `PENDIENTE-<id>` (perfiles creados
// con Google sin cédula ni teléfono) cuentan como vacíos.
// Para el RIF de una cooperativa (J-12345678-9) usar lib/rif.ts.

const LETRAS_CEDULA = /^[VEJGPC]$/;

/** "v-12.345.678" → "V12345678"; "12345678" → "V12345678"; inválida o 'PENDIENTE…' → null. */
export function normalizarCedula(v: string | null | undefined): string | null {
  const limpio = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpio.startsWith("PENDIENTE")) return null;
  if (!/^[VEJGPC]?[0-9]+$/.test(limpio)) return null;
  const numeros = limpio.replace(/[^0-9]/g, "").replace(/^0+/, "");
  if (numeros.length < 5 || numeros.length > 10) return null;
  const letra = LETRAS_CEDULA.test(limpio.charAt(0)) ? limpio.charAt(0) : "V";
  return `${letra}${numeros}`;
}

/** true si la cédula (o RIF de persona) se puede normalizar. */
export function cedulaValida(v: string): boolean {
  return normalizarCedula(v) !== null;
}

/** "V12345678" → "V-12.345.678"; RIF de 9 dígitos (J, G, C) → "J-12345678-9"; inválida → "—". */
export function formatCedula(v: string | null | undefined): string {
  const n = normalizarCedula(v);
  if (!n) return "—";
  const letra = n.charAt(0);
  const numeros = n.slice(1);
  if ((letra === "J" || letra === "G" || letra === "C") && numeros.length === 9) {
    return `${letra}-${numeros.slice(0, 8)}-${numeros.slice(8)}`;
  }
  return `${letra}-${numeros.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** → "V-12345678": forma única en que se guarda una cédula (igual que la app); null si no es válida. */
export function cedulaParaGuardar(v: string | null | undefined): string | null {
  const n = normalizarCedula(v);
  return n ? `${n.charAt(0)}-${n.slice(1)}` : null;
}

/** "0414-123.45.67", "+58 414 1234567", "4141234567" → "4141234567"; inválido o 'PENDIENTE…' → null. */
export function normalizarTelefono(v: string | null | undefined): string | null {
  const texto = v ?? "";
  if (texto.trim().toUpperCase().startsWith("PENDIENTE")) return null;
  let d = texto.replace(/[^0-9]/g, "");
  if (d.length === 12 && d.startsWith("58")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[24][0-9]{9}$/.test(d) ? d : null;
}

/** true si es un teléfono venezolano (móvil 04xx o fijo 02xx). */
export function telefonoValido(v: string): boolean {
  return normalizarTelefono(v) !== null;
}

/** "4141234567" → "0414-123.45.67"; inválido → "—". */
export function formatTelefono(v: string | null | undefined): string {
  const n = normalizarTelefono(v);
  if (!n) return "—";
  return `0${n.slice(0, 3)}-${n.slice(3, 6)}.${n.slice(6, 8)}.${n.slice(8)}`;
}

/** → "0414-1234567": forma única en que se guarda un teléfono (igual que la app); null si no es válido. */
export function telefonoParaGuardar(v: string | null | undefined): string | null {
  const n = normalizarTelefono(v);
  return n ? `0${n.slice(0, 3)}-${n.slice(3)}` : null;
}

/** Teléfono para enlaces wa.me: "584141234567", o null si no es válido. */
export function telefonoWhatsApp(v: string | null | undefined): string | null {
  const n = normalizarTelefono(v);
  return n ? `58${n}` : null;
}

export const CEDULA_PLACEHOLDER = "V-12345678";
export const TELEFONO_PLACEHOLDER = "0414-1234567";
export const CEDULA_ERROR = "Escribe la cédula con su letra, por ejemplo V-12345678.";
export const TELEFONO_ERROR = "Escribe un teléfono venezolano, por ejemplo 0414-1234567.";
