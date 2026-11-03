// ─── Dinero: formato único de montos ─────────────────────────────────────────
// La fuente es shared/dinero.ts (copiada en ./dinero.generated.ts por
// shared/generar.mjs), la misma que usan el panel y la landing. No editar aquí.

import type { TasaRef } from './dinero.generated';

export {
  formatNumeroVE,
  formatBs,
  formatUsd,
  fechaTasaCorta,
  usdABs,
  formatMoney,
} from './dinero.generated';
export type { TasaRef, MonedaPago, MontoFormateado } from './dinero.generated';

// ─── Solo en la app (no forma parte del contrato compartido) ────────────────

/**
 * `TasaRef` a partir de columnas sueltas (`pagos.tasa_bcv`, `pagos.tasa_bcv_fecha`
 * o la respuesta de una RPC). Null si falta alguno de los dos datos.
 */
export function tasaRefDe(tasa?: number | string | null, fecha?: string | null): TasaRef | null {
  const t = typeof tasa === 'string' ? Number(tasa) : tasa;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 && typeof fecha === 'string' && fecha
    ? { tasa: t, fecha: fecha.slice(0, 10) }
    : null;
}
