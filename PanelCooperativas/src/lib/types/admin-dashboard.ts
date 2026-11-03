import { formatBs, formatNumeroVE, formatUsd } from "@/lib/dinero";

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
  /** Incidencias ALERTA_AMARILLA abiertas o en proceso (más de 72 h en tránsito). */
  alertas_amarillas_abiertas: number;
  solicitudes_pendientes: number;
  /** Los mismos conteos de ayer (hora de Venezuela) para el delta; null si la consulta falló. */
  ayer: {
    encomiendas: number | null;
    boletos: number | null;
    ingresos: IngresosResumen;
    comisiones: IngresosResumen;
  };
  /** true si falló la consulta de encomiendas o boletos de hoy (no se muestra un 0 engañoso). */
  error_encomiendas?: boolean;
  error_boletos?: boolean;
  /** true si falló el conteo correspondiente (se muestra "—", no un 0 engañoso). */
  error_cooperativas?: boolean;
  error_alertas?: boolean;
  error_solicitudes?: boolean;
};

// ─── Delta frente a ayer (#54, AD-06) ───────────────────────────────────────

export type DeltaKPI = {
  /** "▲ 12 % vs. ayer", "▼ 3 % vs. ayer", "Igual que ayer", "Sin datos de ayer". */
  texto: string;
  /** "subió 12 % respecto a ayer". */
  accesible: string;
  tendencia: "sube" | "baja" | "igual" | "sin_datos";
};

/** Compara el valor de hoy con el de ayer. `ayer` null = no hay dato de ayer. */
export function calcularDelta(hoy: number | null | undefined, ayer: number | null | undefined): DeltaKPI {
  if (hoy === null || hoy === undefined || ayer === null || ayer === undefined || !Number.isFinite(hoy) || !Number.isFinite(ayer)) {
    return { texto: "Sin datos de ayer", accesible: "sin datos de ayer para comparar", tendencia: "sin_datos" };
  }
  if (ayer === 0) {
    if (hoy === 0) return { texto: "Igual que ayer", accesible: "igual que ayer", tendencia: "igual" };
    // Sin base para un porcentaje: se dice cuánto fue ayer.
    return { texto: "▲ Ayer: 0", accesible: "subió respecto a ayer, que fue 0", tendencia: "sube" };
  }
  const pct = Math.round(((hoy - ayer) / ayer) * 100);
  if (pct === 0) return { texto: "Igual que ayer", accesible: "igual que ayer", tendencia: "igual" };
  const abs = formatNumeroVE(Math.abs(pct), 0);
  return pct > 0
    ? { texto: `▲ ${abs} % vs. ayer`, accesible: `subió ${abs} % respecto a ayer`, tendencia: "sube" }
    : { texto: `▼ ${abs} % vs. ayer`, accesible: `bajó ${abs} % respecto a ayer`, tendencia: "baja" };
}

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
