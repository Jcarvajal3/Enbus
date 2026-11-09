// Pruebas del catálogo de estados y ciudades de shared/ve.ts y de la equivalencia de
// claves entre SQL (`normalizar_localidad`), el panel y la app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESTADOS_VE, ciudadVE, estadoVE, formatCiudad, normalizarCiudad } from "../ve.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");

// ─── normalizar_localidad (SQL), leída de su definición vigente ─────────────

/** El cuerpo de la última `CREATE OR REPLACE FUNCTION public.normalizar_localidad` de las migraciones. */
function definicionSql(): string {
  const dir = "supabase/migrations";
  const archivos = readdirSync(join(RAIZ, dir)).filter((f) => f.endsWith(".sql")).sort();
  let cuerpo = "";
  for (const f of archivos) {
    const sql = leer(`${dir}/${f}`);
    const re = /FUNCTION\s+public\.normalizar_localidad\s*\(\s*p\s+text\s*\)[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
    for (const m of sql.matchAll(re)) cuerpo = m[1];
  }
  assert.ok(cuerpo, "no se encontró normalizar_localidad en supabase/migrations");
  return cuerpo;
}

/**
 * Réplica en JS de `normalizar_localidad`, armada con lo que dice el SQL (las letras de
 * `translate` y los alias del CASE): si la migración cambia, la réplica cambia con ella.
 * Se exige además la forma conocida de la función para no comparar contra otra cosa.
 */
function replicaSql(): (p: string | null) => string | null {
  const cuerpo = definicionSql();
  const tr = cuerpo.match(/translate\(\s*btrim\(coalesce\(p, ''\)\),\s*'([^']*)',\s*'([^']*)'\)/);
  assert.ok(tr, "normalizar_localidad ya no usa translate(btrim(coalesce(p, '')), …): revisa la réplica");
  const [de, a] = [Array.from(tr[1]), Array.from(tr[2])];
  assert.equal(de.length, a.length);
  assert.match(cuerpo, /regexp_replace\([\s\S]*'\[_\[:space:\]\]\+', ' ', 'g'\)/);
  assert.match(cuerpo, /ELSE replace\(x\.s, ' ', '_'\)/);
  const alias = new Map<string, string>();
  for (const m of cuerpo.matchAll(/WHEN x\.s = '([^']+)' THEN '([^']+)'/g)) alias.set(m[1], m[2]);
  assert.ok(alias.size >= 2, "normalizar_localidad sin alias: revisa la réplica");

  // btrim(text) sin segundo argumento solo quita espacios; [:space:] incluye tabs y saltos.
  const btrim = (s: string) => s.replace(/^ +| +$/g, "");
  return (p) => {
    if (p === null || btrim(p) === "") return null;
    const traducido = Array.from(btrim(p))
      .map((c) => {
        const i = de.indexOf(c);
        return i >= 0 ? a[i] : c;
      })
      .join("");
    const s = btrim(traducido.toLowerCase().replace(/[_\s]+/g, " "));
    return alias.get(s) ?? s.replace(/ /g, "_");
  };
}

const normalizarLocalidad = replicaSql();

/** normalizar_localidad devuelve NULL para vacío; normalizarCiudad, ''. */
const sql = (v: string) => normalizarLocalidad(v) ?? "";

const MUESTRAS = [
  "Socopó",
  "SOCOPO",
  "socopo",
  "San Juan de los Morros",
  "san_juan_de_los_morros",
  "SAN JUAN DE LOS MORROS",
  "san_juan",
  "Puerto La Cruz",
  "puerto_la_cruz",
  "  Puerto   la  Cruz ",
  "Ciudad Bolívar",
  "CIUDAD BOLIVAR",
  "ciudad_bolivar",
  "San Fernando de Apure",
  "san_fernando",
  "Mérida",
  "MÉRIDA",
  "Táriba",
  "Cúa",
  "Maturín",
  "Carúpano",
  "Boconó",
  "La Asunción",
  "San Cristóbal",
  "Lechería",
  "El Vigía",
  "Peña",
  "Cañaveral",
  "PEÑALVER",
  "Güigüe",
  "",
  "   ",
];

test("normalizarCiudad = normalizar_localidad (SQL) en ciudades con tilde, ñ y compuestas", () => {
  for (const v of MUESTRAS) assert.equal(normalizarCiudad(v), sql(v), `"${v}"`);
  assert.equal(normalizarCiudad("Socopó"), "socopo");
  assert.equal(normalizarCiudad("San Juan de los Morros"), "san_juan");
  assert.equal(normalizarCiudad("Puerto La Cruz"), "puerto_la_cruz");
  assert.equal(normalizarCiudad("Ciudad Bolívar"), "ciudad_bolivar");
  assert.equal(normalizarCiudad("Peña"), "pena");
  assert.equal(normalizarCiudad("Güigüe"), "guigue");
});

test("catálogo: claves = normalizar_localidad del nombre, y vuelta al nombre", () => {
  assert.equal(ESTADOS_VE.length, 24);
  const claves = new Set<string>();
  for (const e of ESTADOS_VE) {
    assert.equal(e.clave, normalizarCiudad(e.nombre));
    assert.equal(e.clave, sql(e.nombre), e.nombre);
    assert.equal(formatCiudad(e.clave), e.nombre);
    assert.ok(e.ciudades.length > 0, `${e.nombre} sin ciudades`);
    for (const c of e.ciudades) {
      assert.equal(c.clave, normalizarCiudad(c.nombre));
      assert.equal(c.clave, sql(c.nombre), c.nombre);
      // La app guarda el nombre legible y consulta con su clave: tiene que volver igual.
      assert.equal(formatCiudad(c.clave), c.nombre);
      assert.equal(normalizarCiudad(formatCiudad(c.clave)), c.clave);
      assert.ok(!claves.has(c.clave), `ciudad repetida: ${c.clave}`);
      claves.add(c.clave);
    }
  }
});

test("catálogo: Socopó y las ciudades compuestas están, con su estado", () => {
  assert.equal(ciudadVE("socopo")?.ciudad.nombre, "Socopó");
  assert.equal(ciudadVE("Socopó")?.estado.nombre, "Barinas");
  assert.equal(ciudadVE("San Juan de los Morros")?.ciudad.clave, "san_juan");
  assert.equal(ciudadVE("san_juan")?.estado.clave, "guarico");
  assert.equal(ciudadVE("puerto_la_cruz", "anzoategui")?.ciudad.nombre, "Puerto La Cruz");
  assert.equal(ciudadVE("puerto_la_cruz", "Zulia"), null);
  assert.equal(ciudadVE("Ciudad Bolívar")?.estado.nombre, "Bolívar");
  assert.equal(ciudadVE("San Fernando de Apure")?.ciudad.clave, "san_fernando");
  assert.equal(ciudadVE("Táriba")?.ciudad.clave, "tariba");
  assert.equal(ciudadVE("No Existe"), null);
  assert.equal(ciudadVE(""), null);
  assert.equal(estadoVE("DISTRITO CAPITAL")?.clave, "distrito_capital");
  assert.equal(estadoVE("la_guaira")?.nombre, "La Guaira");
  assert.equal(estadoVE("Vargas"), null);
});

test("catálogo: incluye todas las ciudades que la app y el panel ofrecían antes", () => {
  // Lista fija de la app (EnBusApp/src/utils/venezuela.ts) y claves del panel
  // (PanelCooperativas/src/lib/data/venezuela.ts) antes de unificarlas.
  const app = [
    "Caracas", "Valencia", "Puerto Cabello", "Maracay", "La Victoria", "Barquisimeto", "Carora",
    "Maracaibo", "Cabimas", "Ciudad Ojeda", "Barcelona", "Puerto La Cruz", "El Tigre",
    "Ciudad Guayana", "Ciudad Bolívar", "San Cristóbal", "San Antonio del Táchira", "Mérida",
    "El Vigía", "Coro", "Punto Fijo", "Cumaná", "Carúpano", "Maturín", "Porlamar", "La Asunción",
    "Barinas", "Acarigua", "Guanare", "San Juan de los Morros", "Valle de la Pascua",
    "San Fernando de Apure", "San Carlos", "San Felipe", "Chivacoa", "Valera", "Trujillo",
    "Maiquetía", "Catia La Mar", "Los Teques", "Guatire", "Cúa",
  ];
  const panel = [
    "puerto_ayacucho", "barcelona", "puerto_la_cruz", "lecheria", "el_tigre", "san_fernando",
    "maracay", "turmero", "cagua", "la_victoria", "barinas", "socopo", "ciudad_bolivar",
    "puerto_ordaz", "san_felix", "upata", "valencia", "puerto_cabello", "guacara", "san_diego",
    "san_carlos", "tinaquillo", "tucupita", "caracas", "coro", "punto_fijo", "san_juan",
    "valle_de_la_pascua", "calabozo", "barquisimeto", "cabudare", "carora", "merida", "el_vigia",
    "tovar", "los_teques", "guarenas", "guatire", "charallave", "maturin", "punta_de_mata",
    "porlamar", "la_asuncion", "pampatar", "guanare", "acarigua", "araure", "cumana", "carupano",
    "san_cristobal", "rubio", "valera", "trujillo", "bocono", "la_guaira", "maiquetia",
    "catia_la_mar", "san_felipe", "chivacoa", "maracaibo", "cabimas", "ciudad_ojeda", "machiques",
  ];
  for (const c of app) assert.ok(ciudadVE(c), `falta ${c} (app)`);
  for (const c of panel) assert.ok(ciudadVE(c), `falta ${c} (panel)`);
  // Claves mal escritas del panel antiguo, corregidas (migración 20261109000007).
  assert.equal(ciudadVE("tario"), null);
  assert.equal(ciudadVE("yritagua"), null);
  assert.equal(ciudadVE("guadualito"), null);
  assert.ok(ciudadVE("tariba") && ciudadVE("yaritagua") && ciudadVE("guasdualito"));
});

test("panel y app usan normalizarCiudad y el catálogo compartido", () => {
  const app = leer("EnBusApp/src/utils/venezuela.ts");
  assert.match(app, /from '\.\/ve\.generated'/);
  assert.match(app, /ESTADOS_VE/);
  assert.match(app, /return normalizarCiudad\(ciudad\);/);
  const panel = leer("PanelCooperativas/src/lib/data/venezuela.ts");
  assert.match(panel, /from "@\/lib\/ve\.generated"/);
  assert.match(panel, /ESTADOS_VE/);
  assert.match(leer("PanelCooperativas/src/lib/ciudades.ts"), /normalizarCiudad[^\n]*from "\.\/ve\.generated"/);
});
