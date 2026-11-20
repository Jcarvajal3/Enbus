// ─── Mostrar datos guardados ─────────────────────────────────────────────────
// Un solo lugar para leer teléfono, cédula y RIF guardados (Specs/03_Web_Panel_Cooperativas/
// Flujos_Taquilla_y_Formatos.md §1). Construido sobre `formatTelefono`, `formatCedula` y
// `normalizeRif`; nada de helpers locales duplicados en cada pantalla.

import { formatCedula, formatTelefono } from "@/lib/ve";
import { isValidRif, normalizeRif } from "@/lib/rif";

/** Lo que se muestra cuando no hay dato. */
export const SIN_DATO = "—";

/** "0414-123.45.67"; si no es un teléfono venezolano válido, el texto guardado; sin dato, "—". */
export function telefonoOGuion(v: string | null | undefined): string {
  if (!v || !v.trim()) return SIN_DATO;
  const f = formatTelefono(v);
  return f === SIN_DATO ? v.trim() : f;
}

/**
 * Cédula ("V-30.000.001") o RIF ("J-12345678-9"); si no se reconoce, el texto guardado;
 * sin dato o "PENDIENTE…", "—".
 */
export function documentoOGuion(v: string | null | undefined): string {
  if (!v || !v.trim() || v.trim().toUpperCase().startsWith("PENDIENTE")) return SIN_DATO;
  if (/^[JGC]/i.test(v.trim()) && isValidRif(v)) return normalizeRif(v) ?? v;
  const c = formatCedula(v);
  return c === SIN_DATO ? (normalizeRif(v) ?? v.trim()) : c;
}
