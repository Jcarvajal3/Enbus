// GENERADO por shared/generar.mjs — no editar a mano. Fuente: shared/dinero.ts

// ─── Dinero: formato único de montos (fuente única) ─────────────────────────
// Precios de referencia en USD; el cobro se hace en bolívares a la tasa BCV del día.
// Formato venezolano hecho a mano (sin Intl) para que servidor, navegador y
// Hermes muestren exactamente lo mismo: "Bs 1.250,00" y "≈ USD 12,40 · BCV 02/10".
//
// TS puro, sin imports. `node shared/generar.mjs` lo copia como `dinero.generated.ts`
// en los tres proyectos; cada uno lo reexporta desde su `dinero.ts` (la app añade ahí
// `tasaRefDe`). No editar las copias.

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

// ─── Montos escritos a mano ──────────────────────────────────────────────────

/** Placeholder de un campo de monto. */
export const MONTO_PLACEHOLDER = "Ej. 1.250,00";

/** Máximo de dígitos enteros de un monto escrito (hasta 999.999.999.999,99). */
const MONTO_MAX_ENTEROS = 12;

/** Quita "Bs", "Bs.", "USD", "US$" y "$" al inicio o al final, y todo espacio. */
function sinMoneda(texto: string): string {
  return texto
    .replace(/[\s ]+/g, "")
    .replace(/^(?:bs\.?|usd|us\$|\$)/i, "")
    .replace(/(?:bs\.?|usd|us\$|\$)$/i, "");
}

/** Decimales de la tasa BCV (columna `numeric(14,4)`): leer con `leerMonto(t, { decimales: DECIMALES_TASA })`. */
export const DECIMALES_TASA = 4;

const ENTERO_CON_MILES_RE =/^[1-9]\d{0,2}(\.\d{3})+$/;

/**
 * Lee lo que una persona escribe como monto y lo devuelve como número, o `null` si no es
 * un monto válido. Convención venezolana: la coma es el decimal y el punto separa miles.
 *
 * | Texto | Resultado |
 * |---|---|
 * | "1.250,50", "1250,50", "1250,5" | 1250.5 |
 * | "1.250", "1.250.000" | 1250, 1250000 (punto seguido de exactamente 3 cifras = miles) |
 * | "12.5", "12.50", "1250.50" | 12.5, 12.5, 1250.5 (un punto con 1 o 2 cifras = decimal) |
 * | "12,5", ",5", "12," | 12.5, 0.5, 12 |
 * | "Bs 1.250,00", "$12", "USD 12,40", "12 Bs." | acepta prefijo o sufijo de moneda |
 * | "" , "abc", "-5", "+5" | null (sin signo) |
 * | "0,001", "12,345" | null (máximo 2 decimales) |
 * | "1,234.56" | null (formato estadounidense: no se admite; la coma es el decimal) |
 * | "1.25,50", "1..250" | null (puntos de miles mal puestos) |
 * | "0", "0,00" | null; con `permitirCero` → 0 |
 * | "36,4567" | null; con `decimales: 4` → 36.4567 (p. ej. la tasa BCV) |
 *
 * `decimales` (2 por defecto) solo amplía lo que se acepta tras la coma; un punto sigue
 * siendo decimal solo con 1 o 2 cifras ("36.456" son miles).
 *
 * Es el único lector de montos de la app y el panel (el servidor vuelve a validar).
 */
export function leerMonto(
  texto: string | null | undefined,
  opciones?: { permitirCero?: boolean; decimales?: number },
): number | null {
  const maxDecimales = opciones?.decimales ?? 2;
  const t = sinMoneda(texto ?? "");
  if (!t || !/^[0-9.,]+$/.test(t)) return null;

  let entero: string;
  let decimales = "";
  const coma = t.indexOf(",");
  if (coma >= 0) {
    // La coma es el decimal: solo una, y lo anterior son enteros (con miles bien puestos o sin ellos).
    const [parteEntera, parteDecimal, ...resto] = t.split(",");
    if (resto.length > 0) return null;
    if (parteEntera !== "" && !/^\d+$/.test(parteEntera) && !ENTERO_CON_MILES_RE.test(parteEntera)) return null;
    if (parteEntera === "" && parteDecimal === "") return null;
    entero = parteEntera.replace(/\./g, "") || "0";
    decimales = parteDecimal;
  } else if (ENTERO_CON_MILES_RE.test(t)) {
    entero = t.replace(/\./g, "");
  } else if (t.includes(".")) {
    // Un solo punto decimal con 1 o 2 cifras ("12.5", "1250.50").
    const m = /^(\d+)\.(\d{1,2})$/.exec(t);
    if (!m) return null;
    entero = m[1];
    decimales = m[2];
  } else {
    entero = t;
  }

  if (!/^\d*$/.test(decimales) || decimales.length > maxDecimales) return null;
  if (entero.replace(/^0+/, "").length > MONTO_MAX_ENTEROS) return null;
  const n = Number(decimales ? `${entero}.${decimales}` : entero);
  if (!Number.isFinite(n)) return null;
  return n > 0 || (n === 0 && opciones?.permitirCero) ? n : null;
}

/** true si `texto` sale de `previo` solo quitando caracteres (borrar), no al pegar otra cosa. */
function esBorrado(previo: string, texto: string): boolean {
  if (texto.length >= previo.length) return false;
  let i = 0;
  for (let j = 0; j < previo.length && i < texto.length; j++) {
    if (previo.charAt(j) === texto.charAt(i)) i++;
  }
  return i === texto.length;
}

/**
 * Edición de un campo de monto: aplica la máscara "1.250,50" mientras se escribe.
 * `anterior` es lo que mostraba el campo y `nuevo` lo que dejó el teclado.
 *
 * - Solo cuentan dígitos, "," y ".". Los puntos de miles los pone la máscara.
 * - La coma es el decimal (máx. 2 cifras). Un "." escrito al final ("1250.") o con 1–2
 *   cifras detrás ("12.5", pegado) se toma como coma decimal; un "." seguido de exactamente
 *   3 cifras, como miles. Con `decimalesMax` > 2, un solo "." con 1 a `decimalesMax` cifras
 *   (que no sean 3) también es decimal ("36.4567" → "36,4567"). Al borrar, los puntos siempre son miles.
 * - El texto puede quedar a medias ("12,", ",5" → "0,5"): para el valor, `leerMonto`.
 * - `decimalesMax` (2 por defecto) limita las cifras tras la coma; usar el mismo valor en `leerMonto`.
 */
export function editarMonto(
  anterior: string | null | undefined,
  nuevo: string | null | undefined,
  decimalesMax = 2,
): string {
  const previo = anterior ?? "";
  const texto = sinMoneda(nuevo ?? "").replace(/[^0-9.,]/g, "");
  if (!texto) return "";

  let entero: string;
  let decimales: string | null = null;
  const coma = texto.indexOf(",");
  if (coma >= 0) {
    entero = texto.slice(0, coma).replace(/\./g, "");
    decimales = texto.slice(coma + 1).replace(/[^0-9]/g, "");
  } else if (texto.includes(".") && !esBorrado(previo, texto)) {
    const ultimo = texto.lastIndexOf(".");
    const detras = texto.slice(ultimo + 1);
    const unSoloPunto = texto.indexOf(".") === ultimo;
    const esDecimal = unSoloPunto && detras.length >= 1 && detras.length <= Math.max(2, decimalesMax) && detras.length !== 3;
    if (detras === "" || esDecimal) {
      // Punto decimal escrito (o pegado): pasa a coma.
      entero = texto.slice(0, ultimo).replace(/\./g, "");
      decimales = detras;
    } else {
      entero = texto.replace(/\./g, "");
    }
  } else {
    entero = texto.replace(/\./g, "");
  }

  entero = entero.replace(/^0+(?=\d)/, "").slice(0, MONTO_MAX_ENTEROS);
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decimales === null) return conMiles;
  return `${conMiles || "0"},${decimales.slice(0, decimalesMax)}`;
}
