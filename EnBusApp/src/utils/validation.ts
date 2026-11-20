/**
 * SEC-01: Input sanitization and validation utilities.
 *
 * Centralising these here means:
 *   1. Validation logic is testable independently of UI components.
 *   2. Consistent rules across all forms (nueva encomienda, perfil, etc.).
 *   3. Single place to tighten rules (e.g. regex for cedula) in the future.
 */

import { cedulaValida, telefonoValido, CEDULA_ERROR, TELEFONO_ERROR, formatCedula, formatTelefono } from './ve.generated';
import { leerMonto } from './dinero.generated';

// ─── Sanitizers ───────────────────────────────────────────────────────────────

/** Strip leading/trailing whitespace and collapse internal runs of spaces */
export const sanitizeText = (val: string) => val.trim().replace(/\s{2,}/g, ' ');

/** Remove all non-digit characters — useful for phone/cedula normalization */
export const digitsOnly = (val: string) => val.replace(/\D/g, '');

/** Cap a string to a maximum length to prevent oversized DB inserts */
export const maxLength = (val: string, max: number) => val.slice(0, max);

// ─── Cédula y teléfono venezolanos ────────────────────────────────────────────
//
// La fuente es shared/ve.ts (copiada en ./ve.generated.ts por shared/generar.mjs),
// la misma que usan el panel y la landing. Espejo exacto de `normalizar_cedula` /
// `normalizar_telefono` de la base: lo que la app acepta es lo que el servidor
// acepta. Los marcadores `PENDIENTE-<id>` (alta con Google sin cédula ni teléfono)
// cuentan como vacíos.

export {
  LETRAS_CEDULA,
  normalizarCedula,
  formatCedula,
  cedulaParaGuardar,
  separarCedula,
  OPERADORAS_MOVILES,
  normalizarTelefono,
  formatTelefono,
  telefonoParaGuardar,
  telefonoWhatsApp,
  mascaraTelefono,
  mostrarTelefono,
  editarTelefono,
  mascaraCedulaNumero,
  editarCedulaNumero,
  CEDULA_MAX_DIGITOS,
  LETRAS_PERSONA,
  LETRAS_PASAJERO,
  LETRAS_ENCOMIENDA,
  LETRAS_TITULAR,
  TELEFONO_EJEMPLO,
  CEDULA_EJEMPLO,
  CEDULA_PLACEHOLDER,
  TELEFONO_PLACEHOLDER,
  CEDULA_ERROR,
  TELEFONO_ERROR,
} from './ve.generated';
export type { LetraCedula } from './ve.generated';
export { cedulaValida, telefonoValido };
export { leerMonto, editarMonto, MONTO_PLACEHOLDER } from './dinero.generated';

/**
 * Teléfono guardado listo para mostrar: "0414-123.45.67". Un fijo u otro valor que no
 * pase la validación se muestra tal cual (nunca "—" si hay algo escrito).
 */
export function telefonoLegible(v: string | null | undefined): string {
  const crudo = (v ?? '').trim();
  if (!crudo || /^pendiente/i.test(crudo)) return '';
  const f = formatTelefono(crudo);
  return f === '—' ? crudo : f;
}

/** Cédula o RIF guardado listo para mostrar ("V-12.345.678", "J-12345678-9"); si no se reconoce, tal cual. */
export function cedulaLegible(v: string | null | undefined): string {
  const crudo = (v ?? '').trim();
  if (!crudo || /^pendiente/i.test(crudo)) return '';
  const f = formatCedula(crudo);
  return f === '—' ? crudo : f;
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

export const MENSAJE_CEDULA = CEDULA_ERROR;
export const MENSAJE_TELEFONO = TELEFONO_ERROR;

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

/**
 * Lee un número decimal escrito como en Venezuela ("2,5", "1.250,50", "12.5") con el
 * lector único de `shared` (`leerMonto`): null si no es un número mayor que 0 con
 * hasta 2 decimales. Vale para pesos y montos.
 */
export function leerDecimal(val: string | null | undefined, opciones?: { permitirCero?: boolean }): number | null {
  return leerMonto(val, opciones);
}

export function validatePeso(val: string): ValidationResult {
  if (!val.trim()) return { valid: true }; // peso is optional
  const n = leerDecimal(val);
  if (n === null) {
    return { valid: false, message: 'Escribe el peso en kg, por ejemplo 2,5.' };
  }
  if (n > PESO_MAX_KG) {
    return {
      valid: false,
      message: `El peso máximo es ${PESO_MAX_KG} kg. Para paquetes más pesados, habla con la cooperativa.`,
    };
  }
  return { valid: true };
}

/** Valida un monto opcional (vacío es válido; 0 sí). */
export function validateMonto(val: string): ValidationResult {
  if (!val.trim()) return { valid: true };
  if (leerDecimal(val, { permitirCero: true }) === null) {
    return { valid: false, message: 'Escribe un monto válido, por ejemplo 50 o 1.250,00.' };
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
