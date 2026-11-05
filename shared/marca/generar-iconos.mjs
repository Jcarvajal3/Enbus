#!/usr/bin/env node
// Genera los iconos, el splash, los favicons y los iconos de PWA de EnBus a partir de
// shared/marca/eb.svg (D6 de Audits/fase5/fase5_spec.md).
//
//   node shared/marca/generar-iconos.mjs
//
// Sin dependencias del repo: usa el Playwright instalado de forma global (Chromium) para
// rasterizar con la fuente Onest, y escribe el .ico (PNG embebidos) a mano.
// Si falta Playwright o la fuente Onest-ExtraBold.ttf, falla con un mensaje claro: nunca genera
// iconos con otra letra.

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MARCA = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(MARCA, "..", "..");

function fallar(mensaje) {
  console.error(`\n✗ generar-iconos: ${mensaje}\n`);
  process.exit(1);
}

// ─── Entradas ────────────────────────────────────────────────────────────────

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  fallar("no encuentro Playwright. Instálalo de forma global (npm i -g playwright && npx playwright install chromium).");
}

const FUENTES = ["PanelCooperativas/public/fonts/Onest-ExtraBold.ttf", "LandingEnBus/public/fonts/Onest-ExtraBold.ttf"];
const rutaFuente = FUENTES.map((f) => join(RAIZ, f)).find((f) => existsSync(f));
if (!rutaFuente) fallar(`falta la fuente Onest-ExtraBold.ttf (busqué en ${FUENTES.join(", ")}).`);

const svg = readFileSync(join(MARCA, "eb.svg"), "utf8");

// Los colores del SVG deben ser los de tokens.json (primary y foreground = ink).
const tokens = JSON.parse(readFileSync(join(RAIZ, "shared/tokens.json"), "utf8"));
const AMARILLO = tokens.claro.primary.toUpperCase();
const TINTA = tokens.claro.foreground.toUpperCase();
if (!svg.toUpperCase().includes(`FILL="${AMARILLO}"`) || !svg.toUpperCase().includes(`FILL="${TINTA}"`)) {
  fallar(`eb.svg no usa los colores de tokens.json (primary ${AMARILLO}, foreground ${TINTA}).`);
}

// ─── Qué se genera ───────────────────────────────────────────────────────────
// forma: "bloque"  cuadrado con radio 30 % sobre transparente (favicons, PWA "any", splash)
//        "lleno"   cuadrado a sangre, sin radio (iOS y la máscara "maskable" ponen la forma)
//        "letras"  solo "EB" sobre transparente (primer plano y monocromo de Android)
//        "fondo"   solo el amarillo (fondo del icono adaptativo de Android)
// escala: tamaño del bloque (bloque) o de las letras (lleno, letras) respecto al lienzo.
//   Android adaptativo: lienzo 108 dp, visible 72 dp → letras a 72/108 para que se vean
//   al 42 % de lo visible, como en el bloque. Maskable: zona segura 80 % → 0,85.

const APP = "EnBusApp/assets/images";
const PANEL = "PanelCooperativas";
const LANDING = "LandingEnBus";

const PNG = [
  { ruta: `${APP}/icon.png`, lado: 1024, forma: "lleno" },
  { ruta: `${APP}/android-icon-foreground.png`, lado: 1024, forma: "letras", escala: 72 / 108 },
  { ruta: `${APP}/android-icon-background.png`, lado: 1024, forma: "fondo" },
  { ruta: `${APP}/android-icon-monochrome.png`, lado: 1024, forma: "letras", escala: 72 / 108 },
  // Android 12+ recorta el icono del splash en un círculo: el bloque al 60 % cabe entero.
  { ruta: `${APP}/splash-icon.png`, lado: 1024, forma: "bloque", escala: 0.6 },
  { ruta: `${APP}/favicon.png`, lado: 48, forma: "bloque" },

  { ruta: `${PANEL}/public/icon-192.png`, lado: 192, forma: "bloque" },
  { ruta: `${PANEL}/public/icon-512.png`, lado: 512, forma: "bloque" },
  { ruta: `${PANEL}/public/icon-maskable-512.png`, lado: 512, forma: "lleno", escala: 0.85 },
  { ruta: `${PANEL}/src/app/icon.png`, lado: 192, forma: "bloque" },
  { ruta: `${PANEL}/src/app/apple-icon.png`, lado: 180, forma: "lleno" },

  { ruta: `${LANDING}/app/icon.png`, lado: 192, forma: "bloque" },
  { ruta: `${LANDING}/app/apple-icon.png`, lado: 180, forma: "lleno" },
];

const ICO = [
  { ruta: `${PANEL}/src/app/favicon.ico`, lados: [16, 32, 48] },
  { ruta: `${LANDING}/app/favicon.ico`, lados: [16, 32, 48] },
];

// ─── Rasterizado ─────────────────────────────────────────────────────────────

const navegador = await chromium.launch().catch((e) =>
  fallar(`Playwright no pudo abrir Chromium (${e.message.split("\n")[0]}). Ejecuta: npx playwright install chromium`)
);
const pagina = await navegador.newPage({ deviceScaleFactor: 1 });
await pagina.setContent(
  `<!doctype html><html><head><style>html,body{margin:0;background:transparent}#lienzo{display:inline-block;line-height:0}</style></head><body><div id="lienzo"></div></body></html>`
);

const fuenteB64 = readFileSync(rutaFuente).toString("base64");
const cargada = await pagina.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const cara = new FontFace("Onest", bytes.buffer, { weight: "800" });
  try {
    await cara.load();
  } catch {
    return false;
  }
  document.fonts.add(cara);
  return document.fonts.check('800 42px "Onest"');
}, fuenteB64);
if (!cargada) fallar(`Chromium no pudo cargar ${relative(RAIZ, rutaFuente)}.`);

// ─── Ajuste óptico de tamaños pequeños ───────────────────────────────────────
// A 32 y 48 px, "EB" se coloca sobre la rejilla de píxeles: altura de mayúsculas y astas
// en píxeles enteros, borde izquierdo de cada letra en un píxel entero (nítido, sin
// medios píxeles grises). A 16 px ninguna letra cabe nítida, así que se dibuja "EB" a
// mano en la rejilla (7 px de alto, asta de 2 px), como hacen los favicons de marca.

const metricas = await pagina.evaluate(() => {
  const lienzo = document.createElement("canvas");
  lienzo.width = 1400;
  lienzo.height = 1200;
  const ctx = lienzo.getContext("2d");
  ctx.font = '800 1000px "Onest"';
  const eb = ctx.measureText("EB");
  const e = ctx.measureText("E");
  const b = ctx.measureText("B");
  // Grosor del asta de la E: fila entre el brazo medio y el inferior.
  ctx.fillText("E", 100, 1000);
  const fila = ctx.getImageData(0, 1000 - 170, 1400, 1).data;
  let ini = -1;
  let fin = -1;
  for (let i = 0; i < 1400; i++) {
    if (fila[i * 4 + 3] > 127) {
      if (ini < 0) ini = i;
      fin = i;
    }
  }
  return {
    alturaMayus: eb.actualBoundingBoxAscent / 1000,
    asta: (fin - ini + 1) / 1000,
    izqE: -e.actualBoundingBoxLeft / 1000,
    izqB: -b.actualBoundingBoxLeft / 1000,
    avanceE: e.width / 1000,
    kern: (eb.width - e.width - b.width) / 1000,
    derEB: eb.actualBoundingBoxRight / 1000,
  };
});

/** Atributos de #letras (en píxeles) para el bloque de `lado` px, encajados en la rejilla. */
function letrasEnRejilla(lado) {
  const m = metricas;
  const f0 = 0.42 * lado;
  const c0 = m.alturaMayus * f0;
  // Altura de mayúsculas entera cuyo grosor de asta quede más cerca de un entero.
  const candidatas = [Math.floor(c0), Math.ceil(c0)].map((c) => {
    const f = c / m.alturaMayus;
    const asta = m.asta * f;
    return { c, f, error: Math.abs(asta - Math.round(asta)) };
  });
  const { c, f } = candidatas.sort((a, b) => a.error - b.error || b.c - a.c)[0];
  const base = Math.floor(lado / 2 + c / 2); // medio píxel arriba si no cuadra: centro óptico
  let espacio = -0.004 * lado;
  const anchoTinta = (m.derEB - m.izqE) * f + espacio;
  const izquierda = Math.round(lado / 2 - anchoTinta / 2);
  const x = izquierda - m.izqE * f;
  const astaB = x + (m.avanceE + m.kern) * f + espacio + m.izqB * f;
  espacio += Math.round(astaB) - astaB;
  return { x, y: base, tamano: f, espacio };
}

/** "EB" dibujado a mano en una rejilla de 16 × 16 (filas 4–10, columnas 3–12). */
const EB_16 = [
  "XXXX.XXXX.",
  "XX...XX.XX",
  "XX...XX.XX",
  "XXX..XXXX.",
  "XX...XX.XX",
  "XX...XX.XX",
  "XXXX.XXXX.",
];

/** PNG de `lado` px de la marca en la forma pedida. */
async function rasterizar({ lado, forma, escala = 1 }) {
  const ajuste = forma === "bloque" && escala === 1 && lado > 16 && lado <= 64 ? letrasEnRejilla(lado) : null;
  const pixeles = forma === "bloque" && escala === 1 && lado === 16 ? EB_16 : null;
  await pagina.evaluate(
    ({ svg, lado, forma, escala, ajuste, pixeles }) => {
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      const raiz = doc.documentElement;
      raiz.setAttribute("width", String(lado));
      raiz.setAttribute("height", String(lado));
      const fondo = raiz.querySelector("#fondo");
      const letras = raiz.querySelector("#letras");
      const escalar = (el, k) => el.setAttribute("transform", `translate(50 50) scale(${k}) translate(-50 -50)`);
      const u = 100 / lado; // unidades del viewBox por píxel
      if (ajuste) {
        letras.setAttribute("x", String(ajuste.x * u));
        letras.setAttribute("y", String(ajuste.y * u));
        letras.setAttribute("font-size", String(ajuste.tamano * u));
        letras.setAttribute("letter-spacing", String(ajuste.espacio * u));
      }
      if (pixeles) {
        const ns = "http://www.w3.org/2000/svg";
        const grupo = doc.createElementNS(ns, "g");
        grupo.setAttribute("fill", letras.getAttribute("fill"));
        grupo.setAttribute("shape-rendering", "crispEdges");
        pixeles.forEach((fila, y) =>
          [...fila].forEach((p, x) => {
            if (p !== "X") return;
            const r = doc.createElementNS(ns, "rect");
            r.setAttribute("x", String((3 + x) * u));
            r.setAttribute("y", String((4 + y) * u));
            r.setAttribute("width", String(u));
            r.setAttribute("height", String(u));
            grupo.appendChild(r);
          })
        );
        letras.replaceWith(grupo);
      }
      if (forma === "bloque") {
        if (escala !== 1) {
          escalar(fondo, escala);
          escalar(letras, escala);
        }
      } else if (forma === "lleno") {
        fondo.setAttribute("rx", "0");
        fondo.setAttribute("ry", "0");
        if (escala !== 1) escalar(letras, escala);
      } else if (forma === "letras") {
        fondo.remove();
        if (escala !== 1) escalar(letras, escala);
      } else if (forma === "fondo") {
        fondo.setAttribute("rx", "0");
        fondo.setAttribute("ry", "0");
        letras.remove();
      }
      document.getElementById("lienzo").innerHTML = new XMLSerializer().serializeToString(raiz);
    },
    { svg, lado, forma, escala, ajuste, pixeles }
  );
  await pagina.evaluate(() => document.fonts.ready);
  return pagina.locator("#lienzo svg").screenshot({ omitBackground: true, type: "png" });
}

/** .ico con PNG embebidos (Vista+, todos los navegadores actuales). */
function escribirIco(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // tipo: icono
  cabecera.writeUInt16LE(imagenes.length, 4);
  const entradas = [];
  let desplazamiento = 6 + 16 * imagenes.length;
  for (const { lado, png } of imagenes) {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0); // ancho
    e.writeUInt8(lado >= 256 ? 0 : lado, 1); // alto
    e.writeUInt8(0, 2); // colores de paleta
    e.writeUInt8(0, 3); // reservado
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por píxel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += png.length;
    entradas.push(e);
  }
  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.png)]);
}

function guardar(ruta, datos) {
  const destino = join(RAIZ, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, datos);
  console.log(`  ${ruta}  (${(datos.length / 1024).toFixed(1)} KB)`);
}

try {
  console.log(`Marca EB → iconos (fuente: ${relative(RAIZ, rutaFuente)})`);
  for (const salida of PNG) guardar(salida.ruta, await rasterizar(salida));
  for (const { ruta, lados } of ICO) {
    const imagenes = [];
    for (const lado of lados) imagenes.push({ lado, png: await rasterizar({ lado, forma: "bloque" }) });
    guardar(ruta, escribirIco(imagenes));
  }
} finally {
  await navegador.close();
}
console.log("✓ Iconos generados.");
