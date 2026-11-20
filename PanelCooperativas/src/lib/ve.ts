// ─── Cédula, teléfono y contraseña ───────────────────────────────────────────
// La fuente es shared/ve.ts (copiada en ./ve.generated.ts por shared/generar.mjs).
// Este módulo conserva los nombres de siempre para el panel. Espejo de
// `normalizar_cedula` / `normalizar_telefono` (SQL): mismas reglas en la base, la
// app y el panel. Para el RIF de una cooperativa (J-12345678-9) usar lib/rif.ts.

export {
  LETRAS_CEDULA,
  LETRAS_PERSONA,
  LETRAS_PASAJERO,
  LETRAS_ENCOMIENDA,
  LETRAS_TITULAR,
  CEDULA_MAX_DIGITOS,
  mascaraCedulaNumero,
  editarCedulaNumero,
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
  editarTelefono,
  mostrarTelefono,
  CEDULA_PLACEHOLDER,
  CEDULA_EJEMPLO,
  TELEFONO_PLACEHOLDER,
  TELEFONO_EJEMPLO,
  CEDULA_ERROR,
  TELEFONO_ERROR,
  CLAVE_MINIMO,
  CLAVE_AYUDA,
  CLAVE_ERROR,
} from "./ve.generated";
export type { LetraCedula } from "./ve.generated";
