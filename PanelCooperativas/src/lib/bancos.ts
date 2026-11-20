// ─── Bancos de Venezuela (códigos SUDEBAN) ───────────────────────────────────
// La fuente es shared/bancos.ts (copiada en ./bancos.generated.ts por shared/generar.mjs), la
// misma lista que usa la app. El texto que se guarda es el de `etiquetaBanco`
// ("0134 · Banesco"); "Otro banco" va siempre al final. No editar la lista aquí.

export {
  BANCOS_VE,
  OTRO_BANCO,
  OPCIONES_BANCO,
  etiquetaBanco,
  buscarBancos,
  buscarBanco,
  mostrarBanco,
} from "./bancos.generated";
export type { BancoVE } from "./bancos.generated";
