// ─── Cédula y teléfono venezolanos ───────────────────────────────────────────
// La fuente es shared/ve.ts (copiada en ./ve.generated.ts por shared/generar.mjs).
// Este módulo conserva los nombres de siempre para el panel. Espejo de
// `normalizar_cedula` / `normalizar_telefono` (SQL): mismas reglas en la base, la
// app y el panel. Para el RIF de una cooperativa (J-12345678-9) usar lib/rif.ts.

export {
  LETRAS_CEDULA,
  normalizarCedula,
  cedulaValida,
  formatCedula,
  cedulaParaGuardar,
  separarCedula,
  OPERADORAS_MOVILES,
  normalizarTelefono,
  telefonoValido,
  formatTelefono,
  telefonoParaGuardar,
  telefonoWhatsApp,
  mascaraTelefono,
  CEDULA_PLACEHOLDER,
  TELEFONO_PLACEHOLDER,
  CEDULA_ERROR,
  TELEFONO_ERROR,
} from "./ve.generated";
export type { LetraCedula } from "./ve.generated";
