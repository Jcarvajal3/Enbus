// GENERADO por shared/generar.mjs — no editar a mano. Fuente: shared/bancos.ts

// ─── Bancos de Venezuela (códigos SUDEBAN, fuente única) ─────────────────────
// Lista única para la app (pago de boletos y encomiendas), el panel (taquilla, cobro de
// encomiendas, métodos de pago, reembolsos) y la landing. El texto que se guarda es el de
// `etiquetaBanco` ("0134 · Banesco"); "Otro banco" va siempre al final de las opciones.
//
// TS puro, sin imports. `node shared/generar.mjs` lo copia como `bancos.generated.ts`.
// No editar las copias.

export type BancoVE = {
  /** Código SUDEBAN (los 4 primeros dígitos de la cuenta). */
  readonly codigo: string;
  readonly nombre: string;
  /** Otros nombres con los que la gente lo busca o lo escribe ("Bicentenario", "BNC"). */
  readonly alias: readonly string[];
};

/**
 * Lista canónica SUDEBAN, sin duplicados ni métodos que no son bancos (Zelle, PayPal). Los
 * más usados primero; el resto por código. BOD se fusionó con BNC y Bicentenario es hoy el
 * Banco Digital de los Trabajadores: quedan como alias para que la búsqueda los encuentre.
 */
export const BANCOS_VE: readonly BancoVE[] = [
  { codigo: "0102", nombre: "Banco de Venezuela", alias: ["BDV"] },
  { codigo: "0134", nombre: "Banesco", alias: [] },
  { codigo: "0105", nombre: "Mercantil", alias: [] },
  { codigo: "0108", nombre: "BBVA Provincial", alias: ["Provincial", "BBVA"] },
  { codigo: "0191", nombre: "BNC Banco Nacional de Crédito", alias: ["BNC", "Nacional de Crédito", "BOD"] },
  { codigo: "0104", nombre: "Venezolano de Crédito", alias: [] },
  { codigo: "0114", nombre: "Bancaribe", alias: [] },
  { codigo: "0115", nombre: "Banco Exterior", alias: ["Exterior"] },
  { codigo: "0128", nombre: "Banco Caroní", alias: ["Caroní"] },
  { codigo: "0137", nombre: "Sofitasa", alias: [] },
  { codigo: "0138", nombre: "Banco Plaza", alias: ["Plaza"] },
  { codigo: "0146", nombre: "Bangente", alias: [] },
  { codigo: "0151", nombre: "BFC Banco Fondo Común", alias: ["BFC", "Fondo Común"] },
  { codigo: "0156", nombre: "100% Banco", alias: ["100 Banco"] },
  { codigo: "0157", nombre: "DelSur", alias: ["Del Sur"] },
  { codigo: "0163", nombre: "Banco del Tesoro", alias: ["Tesoro"] },
  { codigo: "0166", nombre: "Banco Agrícola de Venezuela", alias: ["Agrícola"] },
  { codigo: "0168", nombre: "Bancrecer", alias: [] },
  { codigo: "0169", nombre: "R4 Banco Microfinanciero", alias: ["R4", "Mi Banco", "Mibanco"] },
  { codigo: "0171", nombre: "Banco Activo", alias: ["Activo"] },
  { codigo: "0172", nombre: "Bancamiga", alias: [] },
  { codigo: "0173", nombre: "Banco Internacional de Desarrollo", alias: ["BID", "Internacional de Desarrollo"] },
  { codigo: "0174", nombre: "Banplus", alias: [] },
  {
    codigo: "0175",
    nombre: "Banco Digital de los Trabajadores",
    alias: ["Bicentenario", "Banco Bicentenario", "BDT", "Trabajadores"],
  },
  { codigo: "0177", nombre: "BANFANB", alias: ["Banco de la Fuerza Armada", "Fuerza Armada"] },
  { codigo: "0178", nombre: "N58 Banco Digital", alias: ["N58"] },
];

export const OTRO_BANCO = "Otro banco";

/** "0134 · Banesco": la forma en que se guarda y se muestra un banco. */
export function etiquetaBanco(b: { readonly codigo: string; readonly nombre: string }): string {
  return `${b.codigo} · ${b.nombre}`;
}

/** Opciones para un select o datalist: todos los bancos y "Otro banco" al final. */
export const OPCIONES_BANCO: readonly string[] = [...BANCOS_VE.map(etiquetaBanco), OTRO_BANCO];

/** Minúsculas, sin tildes y con espacios simples: para comparar y buscar. */
function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Búsqueda mientras se escribe: cada palabra de `consulta` debe aparecer (sin tildes ni
 * mayúsculas) en el código, el nombre o algún alias. Vacía → todos. Primero los que
 * empiezan por lo escrito (código o nombre), luego el resto en el orden de la lista.
 * "banes" → Banesco; "0134" → Banesco; "bicentenario" → Banco Digital de los Trabajadores.
 */
export function buscarBancos(consulta: string | null | undefined): BancoVE[] {
  const q = plano(consulta ?? "");
  if (!q) return [...BANCOS_VE];
  const palabras = q.split(" ");
  const coinciden = BANCOS_VE.filter((b) => {
    const pajar = plano(`${b.codigo} ${b.nombre} ${b.alias.join(" ")}`);
    return palabras.every((p) => pajar.includes(p));
  });
  const empieza = (b: BancoVE) => b.codigo.startsWith(q) || plano(b.nombre).startsWith(q) ? 0 : 1;
  // Array.prototype.sort es estable: dentro de cada grupo se conserva el orden de la lista.
  return coinciden.sort((a, b) => empieza(a) - empieza(b));
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
  return BANCOS_VE.find((b) => plano(b.nombre) === t || b.alias.some((a) => plano(a) === t)) ?? null;
}

/** Texto legible de un banco guardado (normaliza nombres sueltos a "0134 · Banesco"). */
export function mostrarBanco(texto: string | null | undefined): string {
  if (!texto) return "";
  const banco = buscarBanco(texto);
  return banco ? etiquetaBanco(banco) : texto;
}
