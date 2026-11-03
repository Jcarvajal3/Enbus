// ─── Dinero: formato único de montos (idéntico en app, panel y landing) ─────
// Precios de referencia en USD; el cobro se hace en bolívares a la tasa BCV del día.
// Formato venezolano hecho a mano (sin Intl) para que servidor, navegador y
// Hermes muestren exactamente lo mismo: "Bs 1.250,00" y "≈ USD 12,40 · BCV 02/10".

export type TasaRef = { tasa: number; fecha: string /* 'YYYY-MM-DD' */ };

export type MonedaPago = "VES" | "USD";

export type MontoFormateado = {
  /** Línea principal: "Bs 1.250,00" (o "USD 12,40" si se paga en dólares). */
  principal: string;
  /** Línea secundaria: "≈ USD 12,40 · BCV 02/10", o null si no hay nada que añadir. */
  secundario: string | null;
  /** Texto para lectores de pantalla: "1.250,00 bolívares, unos 12,40 dólares". */
  accesible: string;
};

function esNumero(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** 1250.5 -> "1.250,50". Separador de miles "." y decimal ",". Negativos con "-". */
export function formatNumeroVE(n: number, decimales = 2): string {
  const valor = esNumero(n) ? n : 0;
  const factor = 10 ** decimales;
  const abs = Math.round((Math.abs(valor) + Number.EPSILON) * factor) / factor;
  const [entero, dec] = abs.toFixed(decimales).split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = dec ? `${conMiles},${dec}` : conMiles;
  return valor < 0 && abs !== 0 ? `-${texto}` : texto;
}

/** "Bs 1.250,00" */
export function formatBs(n: number): string {
  return `Bs ${formatNumeroVE(n)}`;
}

/** "USD 12,40" */
export function formatUsd(n: number): string {
  return `USD ${formatNumeroVE(n)}`;
}

/** "2026-10-02" (o un ISO completo) -> "02/10". */
export function fechaTasaCorta(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha ?? "");
  return m ? `${m[3]}/${m[2]}` : fecha ?? "";
}

/** Conversión solo para mostrar: el monto que se cobra lo calcula el servidor. */
export function usdABs(usd: number, tasa: number): number {
  return Math.round((usd * tasa + Number.EPSILON) * 100) / 100;
}

/**
 * Formato de un monto según lo que se conozca:
 * - `moneda: 'USD'`: principal en USD; secundario "≈ Bs X · BCV dd/mm" si hay Bs o tasa.
 * - Con `bs`, o con `usd` y `tasa`: principal en Bs; secundario "≈ USD X · BCV dd/mm".
 * - Solo `usd` sin tasa: principal en USD; secundario "Se paga en Bs a la tasa BCV del día".
 */
export function formatMoney(a: {
  usd?: number | null;
  bs?: number | null;
  tasa?: TasaRef | null;
  moneda?: MonedaPago;
}): MontoFormateado {
  const tasa = a.tasa && esNumero(a.tasa.tasa) && a.tasa.tasa > 0 ? a.tasa : null;
  const bsDado = esNumero(a.bs) ? a.bs : null;
  const usdDado = esNumero(a.usd) ? a.usd : null;
  const usd = usdDado ?? (bsDado !== null && tasa ? Math.round((bsDado / tasa.tasa) * 100) / 100 : null);
  const bs = bsDado ?? (usdDado !== null && tasa ? usdABs(usdDado, tasa.tasa) : null);
  const sufijoTasa = tasa ? ` · BCV ${fechaTasaCorta(tasa.fecha)}` : "";

  // Pagado en dólares (Zelle o efectivo USD).
  if (a.moneda === "USD" && usd !== null) {
    return {
      principal: formatUsd(usd),
      secundario: bs !== null ? `≈ ${formatBs(bs)}${sufijoTasa}` : null,
      accesible:
        bs !== null
          ? `${formatNumeroVE(usd)} dólares, unos ${formatNumeroVE(bs)} bolívares`
          : `${formatNumeroVE(usd)} dólares`,
    };
  }

  // En bolívares (dato guardado o convertido con la tasa).
  if (bs !== null) {
    return {
      principal: formatBs(bs),
      secundario: usd !== null ? `≈ ${formatUsd(usd)}${sufijoTasa}` : null,
      accesible:
        usd !== null
          ? `${formatNumeroVE(bs)} bolívares, unos ${formatNumeroVE(usd)} dólares`
          : `${formatNumeroVE(bs)} bolívares`,
    };
  }

  // Solo el precio de referencia en USD, sin tasa.
  if (usd !== null) {
    return {
      principal: formatUsd(usd),
      secundario: "Se paga en Bs a la tasa BCV del día",
      accesible: `${formatNumeroVE(usd)} dólares, se paga en bolívares a la tasa BCV del día`,
    };
  }

  return { principal: "—", secundario: null, accesible: "Monto no disponible" };
}
