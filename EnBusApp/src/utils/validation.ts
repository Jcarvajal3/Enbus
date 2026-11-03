/**
 * SEC-01: Input sanitization and validation utilities.
 *
 * Centralising these here means:
 *   1. Validation logic is testable independently of UI components.
 *   2. Consistent rules across all forms (nueva encomienda, perfil, etc.).
 *   3. Single place to tighten rules (e.g. regex for cedula) in the future.
 */

// ─── Sanitizers ───────────────────────────────────────────────────────────────

/** Strip leading/trailing whitespace and collapse internal runs of spaces */
export const sanitizeText = (val: string) => val.trim().replace(/\s{2,}/g, ' ');

/** Remove all non-digit characters — useful for phone/cedula normalization */
export const digitsOnly = (val: string) => val.replace(/\D/g, '');

/** Cap a string to a maximum length to prevent oversized DB inserts */
export const maxLength = (val: string, max: number) => val.slice(0, max);

// ─── Cédula y teléfono venezolanos ────────────────────────────────────────────
//
// Espejo exacto de `normalizar_cedula` / `normalizar_telefono` de la base
// (migración 20260719000001): lo que la app acepta es lo que el servidor acepta.
// Los marcadores `PENDIENTE-<id>` (alta con Google sin cédula ni teléfono)
// cuentan como vacíos.

const LETRAS_CEDULA = /^[VEJGPC]$/;

/** "v-12.345.678", "V12345678" o "12345678" → "V12345678". `null` si no es usable. */
export function normalizarCedula(v: string | null | undefined): string | null {
  const limpio = (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpio.startsWith('PENDIENTE')) return null;
  if (!/^[VEJGPC]?[0-9]+$/.test(limpio)) return null;
  const numero = limpio.replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (numero.length < 5 || numero.length > 10) return null;
  const letra = LETRAS_CEDULA.test(limpio.charAt(0)) ? limpio.charAt(0) : 'V';
  return letra + numero;
}

/** Puntos de miles: "12345678" → "12.345.678". */
const conPuntos = (numero: string) => numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** → "V-12.345.678" ("—" si no es válida). Para mostrar. */
export function formatCedula(v: string | null | undefined): string {
  const n = normalizarCedula(v);
  if (!n) return '—';
  return `${n.charAt(0)}-${conPuntos(n.slice(1))}`;
}

/** → "V-12345678": forma única en que la app guarda una cédula (`null` si no es válida). */
export function cedulaParaGuardar(v: string | null | undefined): string | null {
  const n = normalizarCedula(v);
  return n ? `${n.charAt(0)}-${n.slice(1)}` : null;
}

/** "0414-123.45.67", "+58 414 1234567" o "4141234567" → "4141234567". `null` si no es válido. */
export function normalizarTelefono(v: string | null | undefined): string | null {
  const texto = (v ?? '').trim();
  if (texto.toUpperCase().startsWith('PENDIENTE')) return null;
  const d = texto.replace(/[^0-9]/g, '');
  const local =
    d.length === 12 && d.startsWith('58')
      ? d.slice(2)
      : d.length === 11 && d.startsWith('0')
        ? d.slice(1)
        : d;
  return /^[24][0-9]{9}$/.test(local) ? local : null;
}

/** → "0414-123.45.67" ("—" si no es válido). Para mostrar. */
export function formatTelefono(v: string | null | undefined): string {
  const n = normalizarTelefono(v);
  if (!n) return '—';
  return `0${n.slice(0, 3)}-${n.slice(3, 6)}.${n.slice(6, 8)}.${n.slice(8)}`;
}

/** → "0414-1234567": forma única en que la app guarda un teléfono (`null` si no es válido). */
export function telefonoParaGuardar(v: string | null | undefined): string | null {
  const n = normalizarTelefono(v);
  return n ? `0${n.slice(0, 3)}-${n.slice(3)}` : null;
}

export function cedulaValida(v: string): boolean {
  return normalizarCedula(v) !== null;
}

export function telefonoValido(v: string): boolean {
  return normalizarTelefono(v) !== null;
}

/** Nombre que `handle_new_user` pone cuando no tiene ninguno. */
const NOMBRE_RELLENO = 'usuario enbus';

/** Nombre usable: al menos 3 letras y no el relleno del alta. */
export function nombreValido(v: string | null | undefined): boolean {
  const t = sanitizeText(v ?? '');
  return t.length >= 3 && t.toLowerCase() !== NOMBRE_RELLENO;
}

/**
 * true si el perfil tiene nombre, cédula y teléfono válidos (lo que exige
 * `fn_checkout_boletos` y el alta de encomiendas). Un perfil creado con Google
 * llega con `PENDIENTE-…` en cédula y teléfono: no está completo.
 */
export function perfilCompleto(
  p: { nombre_completo?: string | null; cedula_rif?: string | null; telefono?: string | null } | null
): boolean {
  if (!p) return false;
  return nombreValido(p.nombre_completo) && cedulaValida(p.cedula_rif ?? '') && telefonoValido(p.telefono ?? '');
}

// ─── Validators ───────────────────────────────────────────────────────────────

export type ValidationResult = { valid: true } | { valid: false; message: string };

export const MENSAJE_CEDULA = 'Escribe la cédula con su letra, por ejemplo V-12345678.';
export const MENSAJE_TELEFONO = 'Escribe un teléfono venezolano, por ejemplo 0414-1234567.';

/** Teléfono venezolano (fijo o móvil, con o sin 0 / +58). Mismas reglas que el servidor. */
export function validatePhone(val: string): ValidationResult {
  return telefonoValido(val) ? { valid: true } : { valid: false, message: MENSAJE_TELEFONO };
}

/** Cédula o RIF venezolano (V, E, J, G, P o C + 5 a 10 dígitos). Mismas reglas que el servidor. */
export function validateCedula(val: string): ValidationResult {
  return cedulaValida(val) ? { valid: true } : { valid: false, message: MENSAJE_CEDULA };
}

/** Generic minimum-length text validator */
export function validateMinLength(val: string, min: number, fieldName = 'Campo'): ValidationResult {
  if (val.trim().length < min) {
    return { valid: false, message: `${fieldName} debe tener al menos ${min} caracteres` };
  }
  return { valid: true };
}

/** Peso máximo por defecto de la tarifa (tarifas.peso_max_kg); el servidor valida el de la tarifa vigente. */
export const PESO_MAX_KG = 25;

/** "2,5" o "2.5" → 2.5. Acepta coma decimal (teclado en español). */
function parseDecimal(val: string): number {
  const t = val.trim();
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}

export function validatePeso(val: string): ValidationResult {
  if (!val.trim()) return { valid: true }; // peso is optional
  const n = parseDecimal(val);
  if (isNaN(n) || n <= 0) {
    return { valid: false, message: 'El peso debe ser un número mayor que 0' };
  }
  if (n > PESO_MAX_KG) {
    return {
      valid: false,
      message: `El peso máximo es ${PESO_MAX_KG} kg. Para paquetes más pesados, habla con la cooperativa.`,
    };
  }
  return { valid: true };
}

/** Validates a positive numeric currency value */
export function validateMonto(val: string): ValidationResult {
  if (!val.trim()) return { valid: true }; // optional
  const n = parseDecimal(val);
  if (isNaN(n) || n < 0) {
    return { valid: false, message: 'El valor debe ser un número positivo' };
  }
  return { valid: true };
}

/**
 * SEC-03: Simple double-submit prevention.
 * Returns a wrapped async function that ignores calls while already running.
 *
 * @example
 * const handleSubmit = preventDoubleSubmit(async () => { ... });
 */
export function preventDoubleSubmit<T>(fn: () => Promise<T>): () => Promise<T | void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      return await fn();
    } finally {
      running = false;
    }
  };
}
