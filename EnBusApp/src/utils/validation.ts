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

// ─── Validators ───────────────────────────────────────────────────────────────

export type ValidationResult = { valid: true } | { valid: false; message: string };

/** Validates a Venezuelan phone number (7–11 digits, optionally prefixed with +58 or 0) */
export function validatePhone(val: string): ValidationResult {
  const digits = digitsOnly(val);
  if (digits.length < 7 || digits.length > 11) {
    return { valid: false, message: 'El teléfono debe tener entre 7 y 11 dígitos' };
  }
  return { valid: true };
}

/** Validates a Venezuelan cédula or RIF (4–12 alphanumeric chars) */
export function validateCedula(val: string): ValidationResult {
  const clean = val.trim().replace(/[-\s]/g, '');
  if (clean.length < 4 || clean.length > 12) {
    return { valid: false, message: 'La cédula o RIF debe tener entre 4 y 12 caracteres' };
  }
  return { valid: true };
}

/** Generic minimum-length text validator */
export function validateMinLength(val: string, min: number, fieldName = 'Campo'): ValidationResult {
  if (val.trim().length < min) {
    return { valid: false, message: `${fieldName} debe tener al menos ${min} caracteres` };
  }
  return { valid: true };
}

/** Validates a positive numeric weight in kg */
export function validatePeso(val: string): ValidationResult {
  if (!val.trim()) return { valid: true }; // peso is optional
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) {
    return { valid: false, message: 'El peso debe ser un número positivo' };
  }
  if (n > 100) {
    return { valid: false, message: 'El peso máximo aceptado es 100 kg' };
  }
  return { valid: true };
}

/** Validates a positive numeric currency value */
export function validateMonto(val: string): ValidationResult {
  if (!val.trim()) return { valid: true }; // optional
  const n = parseFloat(val);
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
