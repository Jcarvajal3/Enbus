import { formatBs, formatUsd } from "@/lib/dinero";

export type DashboardKPIs = {
  encomiendas_hoy: number;
  boletos_hoy: number;
  /** Σ pagos.monto verificados hoy (USD de referencia). */
  ingresos_brutos_hoy: number;
  /** Ingresos de hoy en Bs: Σ coalesce(monto_bs, monto × tasa de hoy). */
  ingresos_hoy: IngresosResumen;
  /** Comisiones estimadas de hoy (USD de referencia). */
  comisiones_estimadas_hoy: number;
  /** Comisiones estimadas de hoy en Bs (misma regla que los ingresos). */
  comisiones_hoy: IngresosResumen;
  cooperativas_activas: number;
  alertas_amarillas_abiertas: number;
  solicitudes_pendientes: number;
};

export type DailyActivity = {
  fecha: string;       // YYYY-MM-DD
  encomiendas: number;
  boletos: number;
};

export type TopCooperativa = {
  cooperativa_id: string;
  nombre: string;
  total_transacciones: number;
};

export type RutaPopular = {
  ruta_nombre: string;
  total: number;
};

export type IncidenciaReciente = {
  id: string;
  tipo: string;
  encomienda_tracking_id: string | null;
  reportado_por_nombre: string | null;
  estado: string;
  created_at: string;
};

export type CooperativaBalance = {
  cooperativa_id: string;
  nombre: string;
  comision_porcentaje: number;
  /** USD de referencia. */
  monto_pendiente: number;
  ciclos_impagos: number;
};

// ─── Ingresos en Bs con la tasa de cada pago ────────────────────────────────
// `pagos.monto` es el USD de referencia y `pagos.monto_bs` los Bs cobrados a la
// tasa de ese pago. Los pagos anteriores a la fase 2 no tienen `monto_bs`: se
// convierten con la tasa de hoy (aproximado).

export type IngresosResumen = {
  /** Σ monto (USD de referencia). */
  usd: number;
  /** Σ coalesce(monto_bs, monto × tasa de hoy). null si faltan Bs y no hay tasa. */
  bs: number | null;
  /** Pagos sin `monto_bs` convertidos con la tasa de hoy. */
  convertidosConTasaHoy: number;
  /** Cantidad de pagos sumados. */
  pagos: number;
  /** true si la consulta de pagos falló (para no mostrar un 0 engañoso). */
  error?: boolean;
};

type FilaPago = { monto: number | string | null; monto_bs?: number | string | null };

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Suma pagos en USD y en Bs. `factor` permite sumar una fracción de cada pago
 * (p. ej. la comisión: `pct / 100`), con un factor por fila.
 */
export function resumirIngresos<T extends FilaPago>(
  pagos: T[] | null | undefined,
  tasaHoy: number | null,
  factor: (pago: T) => number = () => 1
): IngresosResumen {
  let usd = 0;
  let bs = 0;
  let faltanBs = false;
  let convertidosConTasaHoy = 0;
  const tasa = tasaHoy && Number.isFinite(tasaHoy) && tasaHoy > 0 ? tasaHoy : null;

  for (const pago of pagos ?? []) {
    const f = factor(pago);
    const montoUsd = Number(pago.monto ?? 0) * f;
    usd += montoUsd;
    const montoBs = pago.monto_bs === null || pago.monto_bs === undefined ? NaN : Number(pago.monto_bs);
    if (Number.isFinite(montoBs)) {
      bs += montoBs * f;
    } else if (tasa) {
      bs += montoUsd * tasa;
      convertidosConTasaHoy++;
    } else {
      faltanBs = true;
    }
  }

  return {
    usd: redondear(usd),
    bs: faltanBs ? null : redondear(bs),
    convertidosConTasaHoy,
    pagos: pagos?.length ?? 0,
  };
}

/** Texto de un total de ingresos: "Bs 1.250,00" + "≈ USD 12,40 · a la tasa de cada pago". */
export function formatIngresos(r: IngresosResumen): { principal: string; secundario: string } {
  if (r.error) {
    return { principal: "—", secundario: "No pudimos cargar los pagos. Recarga la página." };
  }
  if (r.bs === null) {
    return { principal: formatUsd(r.usd), secundario: "Sin tasa BCV para convertir a Bs" };
  }
  return {
    principal: formatBs(r.bs),
    secundario:
      r.pagos === 0
        ? "Sin pagos verificados"
        : `≈ ${formatUsd(r.usd)} · a la tasa de cada pago${r.convertidosConTasaHoy > 0 ? " (los antiguos, a la de hoy)" : ""}`,
  };
}
