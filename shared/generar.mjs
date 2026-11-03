#!/usr/bin/env node
// Genera los archivos *.generated.* de la app, el panel y la landing a partir de shared/.
//
//   node shared/generar.mjs            escribe los archivos que cambiaron
//   node shared/generar.mjs --check    no escribe nada; sale con 1 si alguno no coincide
//
// Node ≥ 18, sin dependencias. Ver shared/README.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SHARED = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(SHARED, "..");
const CHECK = process.argv.includes("--check");

const AVISO = "GENERADO por shared/generar.mjs — no editar a mano";

const leer = (ruta) => readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");

// ─── Tokens ──────────────────────────────────────────────────────────────────

const tokens = JSON.parse(leer(join(SHARED, "tokens.json")));

/** Quita las claves de documentación ("$descripcion", …). */
function sinMeta(obj) {
  const salida = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("$")) continue;
    salida[k] = v && typeof v === "object" && !Array.isArray(v) ? sinMeta(v) : v;
  }
  return salida;
}

/** Resuelve "{grupo.clave}" contra tokens.json (con cadenas de referencias). */
function resolver(valor, visto = []) {
  if (typeof valor !== "string") return valor;
  const m = valor.match(/^\{([a-z]+)\.([a-z0-9-]+)\}$/);
  if (!m) return valor;
  const ref = `${m[1]}.${m[2]}`;
  if (visto.includes(ref)) throw new Error(`Referencia circular en tokens.json: ${[...visto, ref].join(" → ")}`);
  const destino = tokens[m[1]]?.[m[2]];
  if (destino === undefined) throw new Error(`tokens.json: la referencia ${valor} no existe`);
  return resolver(destino, [...visto, ref]);
}

function resolverGrupo(grupo) {
  const salida = {};
  for (const [k, v] of Object.entries(sinMeta(grupo))) salida[k] = resolver(v);
  return salida;
}

const claro = resolverGrupo(tokens.claro);
const oscuro = resolverGrupo(tokens.oscuro);
const paleta = resolverGrupo(tokens.paleta);
const radio = sinMeta(tokens.radio);
const movimiento = sinMeta(tokens.movimiento);

const faltanEnOscuro = Object.keys(claro).filter((k) => !(k in oscuro));
const faltanEnClaro = Object.keys(oscuro).filter((k) => !(k in claro));
if (faltanEnOscuro.length || faltanEnClaro.length) {
  console.error("tokens.json: 'claro' y 'oscuro' deben tener las mismas claves.");
  if (faltanEnOscuro.length) console.error(`  faltan en oscuro: ${faltanEnOscuro.join(", ")}`);
  if (faltanEnClaro.length) console.error(`  faltan en claro: ${faltanEnClaro.join(", ")}`);
  process.exit(2);
}

const camel = (k) => k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const claveTS = (k) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k));

function objetoTS(obj, sangria = "  ", aCamel = false) {
  const lineas = Object.entries(obj).map(([k, v]) => {
    const clave = claveTS(aCamel ? camel(k) : k);
    const valor = v && typeof v === "object" ? objetoTS(v, sangria + "  ", aCamel) : JSON.stringify(v);
    return `${sangria}${clave}: ${valor},`;
  });
  return `{\n${lineas.join("\n")}\n${sangria.slice(2)}}`;
}

function bloqueCSS(selector, colores, extra = {}) {
  const lineas = [
    ...Object.entries(colores).map(([k, v]) => `  --${k}: ${v};`),
    ...Object.entries(extra).map(([k, v]) => `  --${k}: ${v};`),
  ];
  return `${selector} {\n${lineas.join("\n")}\n}\n`;
}

const extraWeb = {
  radius: `${radio.md}px`,
  ...Object.fromEntries(Object.entries(movimiento.duration).map(([k, v]) => [`duration-${k}`, `${v}ms`])),
};

const cabeceraCSS = `/* ${AVISO}. Fuente: shared/tokens.json */\n\n`;
const cssPanel = cabeceraCSS + bloqueCSS(":root", claro, extraWeb) + "\n" + bloqueCSS(".dark", oscuro);
const cssLanding = cabeceraCSS + bloqueCSS(":root", claro, extraWeb);

const tsApp =
  `// ${AVISO}. Fuente: shared/tokens.json\n` +
  `// La app no tiene modo oscuro: solo usa 'claro'. src/theme.ts toma de aquí \`palette\`, Radius y Motion.duration.\n\n` +
  `/** Paleta cruda de la app (theme.ts → palette). */\n` +
  `export const palette = ${objetoTS(paleta, "  ", true)} as const;\n\n` +
  `export const tokens = {\n` +
  `  claro: ${objetoTS(claro, "    ", true)},\n` +
  `  movimiento: ${objetoTS(movimiento, "    ")},\n` +
  `  radio: ${objetoTS(radio, "    ")},\n` +
  `} as const;\n`;

// ─── Copias de los módulos TS ────────────────────────────────────────────────

const copia = (nombre) =>
  `// ${AVISO}. Fuente: shared/${nombre}\n\n` + leer(join(SHARED, nombre));

const ve = copia("ve.ts");
const artefactos = copia("artefactos.ts");

const salidas = [
  ["EnBusApp/src/tokens.generated.ts", tsApp],
  ["EnBusApp/src/utils/ve.generated.ts", ve],
  ["EnBusApp/src/utils/artefactos.generated.ts", artefactos],
  ["PanelCooperativas/src/app/tokens.generated.css", cssPanel],
  ["PanelCooperativas/src/lib/ve.generated.ts", ve],
  ["PanelCooperativas/src/lib/artefactos.generated.ts", artefactos],
  ["LandingEnBus/app/tokens.generated.css", cssLanding],
  ["LandingEnBus/lib/ve.generated.ts", ve],
  ["LandingEnBus/lib/artefactos.generated.ts", artefactos],
];

// ─── Escribir o comprobar ────────────────────────────────────────────────────

const distintos = [];
for (const [rel, contenido] of salidas) {
  const ruta = join(RAIZ, rel);
  const actual = existsSync(ruta) ? leer(ruta) : null;
  if (actual === contenido) continue;
  distintos.push({ rel, motivo: actual === null ? "no existe" : "distinto" });
  if (!CHECK) {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, contenido, "utf8");
  }
}

if (CHECK) {
  if (distintos.length) {
    console.error(`Hay ${distintos.length} archivo(s) generado(s) desactualizado(s). Ejecuta: node shared/generar.mjs`);
    for (const d of distintos) console.error(`  ${d.rel} (${d.motivo})`);
    process.exit(1);
  }
  console.log(`OK: los ${salidas.length} archivos generados coinciden con shared/.`);
} else if (distintos.length) {
  for (const d of distintos) console.log(`escrito ${relative(RAIZ, join(RAIZ, d.rel))}`);
} else {
  console.log(`Sin cambios: los ${salidas.length} archivos generados ya estaban al día.`);
}
