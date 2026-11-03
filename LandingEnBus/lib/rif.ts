// ─── RIF venezolano ──────────────────────────────────────────────────────────
// Acepta el RIF como lo escriba la persona ("j123456789", "J-12345678-9",
// "J 12.345.678-9") y lo normaliza al formato oficial "J-12345678-9".
// Letras válidas: J (jurídica), G (gobierno), V (venezolano), E (extranjero),
// P (pasaporte), C (comunal). No se valida el dígito verificador.
// Archivo duplicado en PanelCooperativas/src/lib/rif.ts y LandingEnBus/lib/rif.ts:
// mantener ambas copias idénticas.

export const RIF_PLACEHOLDER = "J-12345678-9";

export const RIF_AYUDA =
  "Escribe la letra (J, G, V, E, P o C) y los 9 números de tu RIF, con o sin guiones. Ejemplo: J-12345678-9.";

export const RIF_ERROR =
  "El RIF no es válido. Debe tener una letra (J, G, V, E, P o C) y 9 números, por ejemplo J-12345678-9.";

const RIF_RE = /^([JGVEPC])(\d{8})(\d)$/;

/** Devuelve el RIF en formato "J-12345678-9", o null si no es un RIF válido. */
export function normalizeRif(input: string | null | undefined): string | null {
  if (!input) return null;
  const limpio = input.toUpperCase().replace(/[\s.\-_/]/g, "");
  const m = limpio.match(RIF_RE);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** true si el texto se puede normalizar a un RIF válido. */
export function isValidRif(input: string | null | undefined): boolean {
  return normalizeRif(input) !== null;
}
