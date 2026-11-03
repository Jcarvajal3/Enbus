// ─── RIF venezolano ──────────────────────────────────────────────────────────
// La fuente es shared/ve.ts (copiada en ./ve.generated.ts por shared/generar.mjs),
// la misma que usan el panel y la app. Acepta "j123456789", "J-12345678-9" o
// "J 12.345.678-9" y lo normaliza a "J-12345678-9" (sin validar el dígito verificador).

export { RIF_PLACEHOLDER, RIF_AYUDA, RIF_ERROR, normalizeRif, isValidRif } from "./ve.generated";

/** Ayuda corta bajo el campo (§2.4); `RIF_AYUDA`, más larga, queda para el error. */
export const RIF_AYUDA_CORTA = "Letra y 9 números, con o sin guiones.";
