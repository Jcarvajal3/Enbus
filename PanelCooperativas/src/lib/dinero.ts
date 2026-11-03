// ─── Dinero: formato único de montos ─────────────────────────────────────────
// La fuente es shared/dinero.ts (copiada en ./dinero.generated.ts por
// shared/generar.mjs), la misma que usan la app y la landing. No editar aquí.

export {
  formatNumeroVE,
  formatBs,
  formatUsd,
  fechaTasaCorta,
  usdABs,
  formatMoney,
} from "./dinero.generated";
export type { TasaRef, MonedaPago, MontoFormateado } from "./dinero.generated";
