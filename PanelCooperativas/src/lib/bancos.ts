// ─── Bancos de Venezuela (códigos SUDEBAN) ───────────────────────────────────
// Lista única para el panel (venta en taquilla, cobro de encomiendas, métodos
// de pago). El texto que se guarda es el de `etiquetaBanco` ("0134 · Banesco"),
// el mismo formato que usa la app; "Otro banco" va siempre al final.

export type BancoVE = {
  codigo: string;
  nombre: string;
  /** Nombres anteriores o abreviados, para búsquedas ("Bicentenario", "BNC"). */
  alias?: string[];
};

export const BANCOS_VE: BancoVE[] = [
  { codigo: "0102", nombre: "Banco de Venezuela", alias: ["BDV"] },
  { codigo: "0134", nombre: "Banesco" },
  { codigo: "0105", nombre: "Mercantil" },
  { codigo: "0108", nombre: "BBVA Provincial", alias: ["Provincial", "BBVA"] },
  // BOD se fusionó con BNC: los pagos viejos con "BOD" se reconocen como BNC.
  { codigo: "0191", nombre: "BNC Banco Nacional de Crédito", alias: ["BNC", "Nacional de Crédito", "BOD"] },
  { codigo: "0104", nombre: "Venezolano de Crédito" },
  { codigo: "0114", nombre: "Bancaribe" },
  { codigo: "0115", nombre: "Banco Exterior", alias: ["Exterior"] },
  { codigo: "0128", nombre: "Banco Caroní", alias: ["Caroní"] },
  { codigo: "0137", nombre: "Sofitasa" },
  { codigo: "0138", nombre: "Banco Plaza", alias: ["Plaza"] },
  { codigo: "0146", nombre: "Bangente" },
  { codigo: "0151", nombre: "BFC Banco Fondo Común", alias: ["BFC", "Fondo Común"] },
  { codigo: "0156", nombre: "100% Banco" },
  { codigo: "0157", nombre: "DelSur", alias: ["Del Sur"] },
  { codigo: "0163", nombre: "Banco del Tesoro", alias: ["Tesoro"] },
  { codigo: "0166", nombre: "Banco Agrícola de Venezuela", alias: ["Agrícola"] },
  { codigo: "0168", nombre: "Bancrecer" },
  { codigo: "0169", nombre: "R4 Banco Microfinanciero", alias: ["R4", "Mi Banco", "Mibanco"] },
  { codigo: "0171", nombre: "Banco Activo", alias: ["Activo"] },
  { codigo: "0172", nombre: "Bancamiga" },
  { codigo: "0173", nombre: "Banco Internacional de Desarrollo", alias: ["BID", "Internacional de Desarrollo"] },
  { codigo: "0174", nombre: "Banplus" },
  { codigo: "0175", nombre: "Banco Digital de los Trabajadores", alias: ["Bicentenario", "Banco Bicentenario", "BDT"] },
  { codigo: "0177", nombre: "BANFANB", alias: ["Banco de la Fuerza Armada"] },
  { codigo: "0178", nombre: "N58 Banco Digital", alias: ["N58"] },
];

export const OTRO_BANCO = "Otro banco";

/** "0134 · Banesco" */
export function etiquetaBanco(b: Pick<BancoVE, "codigo" | "nombre">): string {
  return `${b.codigo} · ${b.nombre}`;
}

/** Opciones para un select o datalist: todos los bancos y "Otro banco" al final. */
export const OPCIONES_BANCO: string[] = [...BANCOS_VE.map(etiquetaBanco), OTRO_BANCO];

function plano(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Banco a partir de lo que esté guardado o escrito: código ("0134"), etiqueta
 * ("0134 · Banesco"), nombre o alias ("bicentenario"). null si no se reconoce.
 */
export function buscarBanco(texto: string | null | undefined): BancoVE | null {
  if (!texto) return null;
  const codigo = texto.match(/\b(\d{4})\b/)?.[1];
  if (codigo) {
    const porCodigo = BANCOS_VE.find((b) => b.codigo === codigo);
    if (porCodigo) return porCodigo;
  }
  const t = plano(texto.replace(/^\d{4}\s*·\s*/, ""));
  if (!t) return null;
  return (
    BANCOS_VE.find((b) => plano(b.nombre) === t || b.alias?.some((a) => plano(a) === t)) ?? null
  );
}

/** Texto legible de un banco guardado (normaliza nombres sueltos a "0134 · Banesco"). */
export function mostrarBanco(texto: string | null | undefined): string {
  if (!texto) return "";
  const banco = buscarBanco(texto);
  return banco ? etiquetaBanco(banco) : texto;
}
