// GENERADO por shared/generar.mjs — no editar a mano. Fuente: shared/ve.ts

// ─── Formatos venezolanos (fuente única) ─────────────────────────────────────
// Cédula, teléfono, RIF, contraseña, ciudades (y el catálogo de estados y ciudades), fechas en
// hora de Venezuela y duraciones.
// Espejo de `normalizar_cedula`, `normalizar_telefono` y `normalizar_localidad`
// (SQL, migración 20260719000001): lo que aceptan la app, el panel y la landing es
// lo que acepta la base. Los marcadores `PENDIENTE-<id>` (perfiles creados con
// Google sin cédula ni teléfono) cuentan como vacíos.
//
// TS puro: sin imports, sin `\p{…}` ni lookbehind (Hermes). `node shared/generar.mjs`
// lo copia como `ve.generated.ts` en los tres proyectos: no editar las copias.

// ─── Cédula (persona) ────────────────────────────────────────────────────────

export const LETRAS_CEDULA = ["V", "E", "J", "G", "P", "C"] as const;
export type LetraCedula = (typeof LETRAS_CEDULA)[number];

const LETRA_CEDULA_RE = /^[VEJGPC]$/;

/** "v-12.345.678" → "V12345678"; "12345678" → "V12345678"; inválida o 'PENDIENTE…' → null. */
export function normalizarCedula(v: string | null | undefined): string | null {
  const limpio = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpio.startsWith("PENDIENTE")) return null;
  if (!/^[VEJGPC]?[0-9]+$/.test(limpio)) return null;
  const numeros = limpio.replace(/[^0-9]/g, "").replace(/^0+/, "");
  if (numeros.length < 5 || numeros.length > 10) return null;
  const letra = LETRA_CEDULA_RE.test(limpio.charAt(0)) ? limpio.charAt(0) : "V";
  return `${letra}${numeros}`;
}

/** true si la cédula (o RIF de persona) se puede normalizar. */
export function cedulaValida(v: string): boolean {
  return normalizarCedula(v) !== null;
}

/**
 * "V12345678" → "V-12.345.678"; RIF de 9 dígitos (J, G, C) → "J-12345678-9", también con
 * ceros a la izquierda ("J000123456" → "J-00012345-6", que `normalizarCedula` acorta a
 * "J123456" para comparar); inválida → "—".
 */
export function formatCedula(v: string | null | undefined): string {
  const n = normalizarCedula(v);
  if (!n) return "—";
  const letra = n.charAt(0);
  const numeros = n.slice(1);
  if (letra === "J" || letra === "G" || letra === "C") {
    // Los ceros a la izquierda son parte del RIF: se formatea con los dígitos tal como se escribieron.
    const digitos = (v ?? "").replace(/[^0-9]/g, "");
    if (digitos.length === 9) return `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}`;
  }
  return `${letra}-${numeros.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** → "V-12345678": forma única en que se guarda una cédula; null si no es válida. */
export function cedulaParaGuardar(v: string | null | undefined): string | null {
  const n = normalizarCedula(v);
  return n ? `${n.charAt(0)}-${n.slice(1)}` : null;
}

/**
 * Separa letra y número para un campo de cédula con chips de letra:
 * "v-12.345.678" → { letra: 'V', numero: '12345678' }; "12345678" → letra 'V'.
 * El número son solo dígitos (máx. 10), tal como se escribieron (sin validar).
 */
export function separarCedula(v: string | null | undefined): { letra: LetraCedula; numero: string } {
  const limpio = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpio.startsWith("PENDIENTE")) return { letra: "V", numero: "" };
  const primera = limpio.charAt(0);
  const letra = (LETRA_CEDULA_RE.test(primera) ? primera : "V") as LetraCedula;
  return { letra, numero: limpio.replace(/[^0-9]/g, "").slice(0, 10) };
}

export const CEDULA_PLACEHOLDER = "V-12345678";
export const CEDULA_ERROR = "Escribe la cédula con su letra, por ejemplo V-12345678.";

// ─── Teléfono ────────────────────────────────────────────────────────────────

export const OPERADORAS_MOVILES = ["0412", "0414", "0416", "0422", "0424", "0426"] as const;

/** "0414-123.45.67", "+58 414 1234567", "4141234567" → "4141234567"; inválido o 'PENDIENTE…' → null. */
export function normalizarTelefono(v: string | null | undefined): string | null {
  const texto = v ?? "";
  if (texto.trim().toUpperCase().startsWith("PENDIENTE")) return null;
  let d = texto.replace(/[^0-9]/g, "");
  if (d.length === 12 && d.startsWith("58")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[24][0-9]{9}$/.test(d) ? d : null;
}

/** true si es un teléfono venezolano (móvil 04xx o fijo 02xx). */
export function telefonoValido(v: string): boolean {
  return normalizarTelefono(v) !== null;
}

/** "4141234567" → "0414-123.45.67"; inválido → "—". */
export function formatTelefono(v: string | null | undefined): string {
  const n = normalizarTelefono(v);
  if (!n) return "—";
  return `0${n.slice(0, 3)}-${n.slice(3, 6)}.${n.slice(6, 8)}.${n.slice(8)}`;
}

/** → "0414-1234567": forma única en que se guarda un teléfono; null si no es válido. */
export function telefonoParaGuardar(v: string | null | undefined): string | null {
  const n = normalizarTelefono(v);
  return n ? `0${n.slice(0, 3)}-${n.slice(3)}` : null;
}

/** Teléfono para enlaces wa.me: "584141234567", o null si no es válido. */
export function telefonoWhatsApp(v: string | null | undefined): string | null {
  const n = normalizarTelefono(v);
  return n ? `58${n}` : null;
}

/**
 * Máscara progresiva mientras se escribe: "0414" → "0414-", "04141234" → "0414-123.4",
 * "04141234567" → "0414-123.45.67". Acepta "+58 414…" / "58414…" y "414…" (añade el 0).
 * Nunca pasa de 11 dígitos. Para guardar usar `telefonoParaGuardar`.
 */
export function mascaraTelefono(entrada: string): string {
  let d = (entrada ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("58")) d = d.slice(2);
  // "+58 414…" y "414…" → "0414…"; "+58 0414…" no duplica el 0.
  if (d.length > 0 && d.charAt(0) !== "0") d = `0${d}`;
  d = d.slice(0, 11);
  if (d.length < 4) return d;
  let salida = `${d.slice(0, 4)}-${d.slice(4, 7)}`;
  if (d.length > 7) salida += `.${d.slice(7, 9)}`;
  if (d.length > 9) salida += `.${d.slice(9, 11)}`;
  return salida;
}

export const TELEFONO_PLACEHOLDER = "0414-1234567";
export const TELEFONO_ERROR = "Escribe un teléfono venezolano, por ejemplo 0414-1234567.";

// ─── RIF de cooperativa ──────────────────────────────────────────────────────
// Acepta el RIF como lo escriba la persona ("j123456789", "J-12345678-9",
// "J 12.345.678-9") y lo normaliza al formato oficial "J-12345678-9".
// Letras válidas: J (jurídica), G (gobierno), V (venezolano), E (extranjero),
// P (pasaporte), C (comunal). `normalizeRif` no exige el dígito verificador (para no
// rechazar RIF reales por una tabla incompleta); `rifDigitoValido` lo comprueba aparte.
// Los ejemplos usan un RIF con el dígito verificador correcto (J-12345678-4).

export const RIF_PLACEHOLDER = "J-12345678-4";

export const RIF_AYUDA =
  "Escribe la letra (J, G, V, E, P o C) y los 9 números de tu RIF, con o sin guiones. Ejemplo: J-12345678-4.";

export const RIF_ERROR =
  "El RIF no es válido. Debe tener una letra (J, G, V, E, P o C) y 9 números, por ejemplo J-12345678-4.";

export const RIF_DIGITO_ERROR =
  "El último número del RIF (dígito verificador) no coincide. Revisa que esté bien escrito.";

const RIF_RE = /^([JGVEPC])(\d{8})(\d)$/;

/** Devuelve el RIF en formato "J-12345678-9", o null si no es un RIF válido. */
export function normalizeRif(input: string | null | undefined): string | null {
  if (!input) return null;
  const limpio = input.toUpperCase().replace(/[\s.\-_/]/g, "");
  const m = limpio.match(RIF_RE);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** true si el texto se puede normalizar a un RIF válido. */
export function isValidRif(input: string | null | undefined): boolean {
  return normalizeRif(input) !== null;
}

// ─── Contraseña ──────────────────────────────────────────────────────────────
// Misma regla en la app, el panel y Supabase Auth (`minimum_password_length`).

export const CLAVE_MINIMO = 8;
/** Ayuda fija bajo el campo (nunca en el marcador). */
export const CLAVE_AYUDA = "Mínimo 8 caracteres.";
/** Error cuando la contraseña es más corta que `CLAVE_MINIMO`. */
export const CLAVE_ERROR = "Usa al menos 8 caracteres.";
/** Valor de la letra en el cálculo del SENIAT. C (comunal) no tiene un valor documentado. */
const VALOR_LETRA_RIF: Record<string, number> = { V: 1, E: 2, J: 3, P: 4, G: 5 };
const PESOS_RIF = [3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Dígito verificador (módulo 11 del SENIAT) de un RIF: "J-12345678" o "J-12345678-?" → 4.
 * null si el texto no tiene letra y 8 números, o si la letra es C (sin tabla oficial).
 */
export function digitoVerificadorRif(input: string | null | undefined): number | null {
  const limpio = (input ?? "").toUpperCase().replace(/[\s.\-_/]/g, "");
  const m = limpio.match(/^([JGVEPC])(\d{8})\d?$/);
  if (!m) return null;
  const valorLetra = VALOR_LETRA_RIF[m[1]];
  if (valorLetra === undefined) return null;
  let suma = valorLetra * 4;
  for (let i = 0; i < 8; i++) suma += Number(m[2].charAt(i)) * PESOS_RIF[i];
  const digito = 11 - (suma % 11);
  return digito >= 10 ? 0 : digito;
}

/**
 * true si el RIF es válido y su último número coincide con el dígito verificador.
 * Un RIF C (comunal) se acepta con cualquier dígito: no hay tabla oficial para calcularlo.
 */
export function rifDigitoValido(input: string | null | undefined): boolean {
  const rif = normalizeRif(input);
  if (!rif) return false;
  const esperado = digitoVerificadorRif(rif);
  return esperado === null || Number(rif.charAt(rif.length - 1)) === esperado;
}

// ─── Ciudades ────────────────────────────────────────────────────────────────

const TILDES: Record<string, string> = {
  Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U", Ñ: "N",
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
};

/** Nombres largos que las rutas guardan abreviados (igual que normalizar_localidad). */
const ALIAS_LOCALIDAD: Record<string, string> = {
  "san fernando de apure": "san_fernando",
  "san juan de los morros": "san_juan",
};

/**
 * Clave de comparación, igual que `normalizar_localidad` (SQL):
 * "Puerto La Cruz" → "puerto_la_cruz", "San Juan de los Morros" → "san_juan",
 * "MÉRIDA" → "merida"; '' si está vacía.
 */
export function normalizarCiudad(v: string | null | undefined): string {
  const base = (v ?? "")
    .trim()
    .replace(/[ÁÉÍÓÚÜÑáéíóúüñ]/g, (c) => TILDES[c] ?? c)
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
  if (!base) return "";
  return ALIAS_LOCALIDAD[base] ?? base.replace(/ /g, "_");
}

// ─── Catálogo de estados y ciudades ──────────────────────────────────────────
// Fuente única de las ciudades que se ofrecen al crear rutas y sucursales (panel), al
// elegir origen y destino (app) y de sus nombres legibles (`formatCiudad`). La clave
// de cada estado y ciudad se calcula con `normalizarCiudad` (= `normalizar_localidad`
// de SQL): es lo que guardan `rutas`, `sucursales` y `encomiendas`
// ("socopo", "san_juan", "puerto_la_cruz"). Para añadir una ciudad basta con
// escribir su nombre aquí y ejecutar `node shared/generar.mjs`.
//
// La clave de una ciudad es única en todo el país (la app la busca sin el estado).

/** Ciudad del catálogo: `clave` = normalizarCiudad(nombre) ("socopo"), `nombre` legible ("Socopó"). */
export type CiudadVE = { readonly clave: string; readonly nombre: string };

/** Estado del catálogo con sus ciudades (la capital primero). */
export type EstadoVE = { readonly clave: string; readonly nombre: string; readonly ciudades: readonly CiudadVE[] };

/** Nombre del estado → nombres de sus ciudades, la capital primero. */
const CATALOGO_FUENTE: readonly (readonly [string, readonly string[]])[] = [
  ["Amazonas", ["Puerto Ayacucho", "San Fernando de Atabapo", "Maroa", "San Carlos de Río Negro"]],
  [
    "Anzoátegui",
    [
      "Barcelona", "Puerto La Cruz", "Lechería", "El Tigre", "Anaco", "San José de Guanipa", "Cantaura",
      "Clarines", "Puerto Píritu", "Aragua de Barcelona", "Boca de Uchire",
    ],
  ],
  ["Apure", ["San Fernando de Apure", "Guasdualito"]],
  [
    "Aragua",
    [
      "Maracay", "Turmero", "Cagua", "La Victoria", "Las Tejerías", "Villa de Cura", "Palo Negro", "San Mateo",
      "Choroní", "Ocumare de la Costa",
    ],
  ],
  [
    "Barinas",
    ["Barinas", "Socopó", "Ciudad Bolivia", "Santa Bárbara de Barinas", "Barinitas", "Sabaneta", "Barrancas"],
  ],
  [
    "Bolívar",
    [
      "Ciudad Bolívar", "Ciudad Guayana", "Puerto Ordaz", "San Félix", "Upata", "Santa Elena de Uairén",
      "Caicara del Orinoco", "El Callao", "Tumeremo", "Guasipati", "El Manteco",
    ],
  ],
  [
    "Carabobo",
    ["Valencia", "Puerto Cabello", "Guacara", "San Diego", "Los Guayos", "Naguanagua", "Morón", "Bejuma"],
  ],
  ["Cojedes", ["San Carlos", "Tinaquillo", "Tinaco", "El Baúl", "Las Vegas", "El Pao"]],
  ["Delta Amacuro", ["Tucupita", "Curiapo", "Pedernales", "Casacoima"]],
  ["Distrito Capital", ["Caracas"]],
  [
    "Falcón",
    [
      "Coro", "Punto Fijo", "Tucacas", "Chichiriviche", "Dabajuro", "Churuguara", "Puerto Cumarebo", "Adícora",
      "Yaracal", "San Juan de los Cayos",
    ],
  ],
  [
    "Guárico",
    [
      "San Juan de los Morros", "Valle de la Pascua", "Calabozo", "Zaraza", "Altagracia de Orituco", "El Sombrero",
      "Camaguán", "San José de Guaribe", "Ortiz",
    ],
  ],
  ["La Guaira", ["La Guaira", "Maiquetía", "Catia La Mar", "Macuto", "Caraballeda", "Naiguatá", "Chuspa"]],
  [
    "Lara",
    ["Barquisimeto", "Cabudare", "Carora", "Quíbor", "El Tocuyo", "Sarare", "Duaca", "Cubiro", "Siquisique"],
  ],
  [
    "Mérida",
    [
      "Mérida", "El Vigía", "Tovar", "Ejido", "Santa Cruz de Mora", "Timotes", "Bailadores", "Apartaderos",
      "Mucuchíes", "La Azulita", "Zea",
    ],
  ],
  [
    "Miranda",
    [
      "Los Teques", "Guarenas", "Guatire", "Charallave", "Cúa", "Ocumare del Tuy", "Santa Teresa del Tuy",
      "Río Chico", "Cúpira", "Caucagua", "San Antonio de los Altos",
    ],
  ],
  [
    "Monagas",
    [
      "Maturín", "Punta de Mata", "Quiriquire", "Caripito", "Temblador", "Caicara de Maturín",
      "San Antonio de Maturín",
    ],
  ],
  ["Nueva Esparta", ["Porlamar", "La Asunción", "Pampatar", "Juan Griego", "San Juan Bautista", "Boca de Pozo"]],
  ["Portuguesa", ["Guanare", "Acarigua", "Araure", "Biscucuy", "Turén", "Ospino", "Píritu", "Boconoíto"]],
  ["Sucre", ["Cumaná", "Carúpano", "Río Caribe", "Güiria", "Cariaco", "San Antonio del Golfo", "Irapa"]],
  [
    "Táchira",
    [
      "San Cristóbal", "Táriba", "Rubio", "San Antonio del Táchira", "La Fría", "Colón", "La Grita", "El Piñal",
      "Ureña", "Capacho", "Bramón", "Seboruco",
    ],
  ],
  [
    "Trujillo",
    ["Valera", "Trujillo", "Boconó", "Sabana de Mendoza", "Isnotú", "Carache", "Pampán", "Escuque", "La Ceiba"],
  ],
  ["Yaracuy", ["San Felipe", "Yaritagua", "Chivacoa", "Nirgua", "Urachiche", "Aroa", "Guama"]],
  [
    "Zulia",
    [
      "Maracaibo", "Cabimas", "Ciudad Ojeda", "Machiques", "San Francisco", "Santa Rita", "Villa del Rosario",
      "San Timoteo", "Los Puertos de Altagracia", "Bachaquero", "Sinamaica", "Paraguachón",
    ],
  ],
];

/**
 * Los 24 estados de Venezuela con sus ciudades, en orden alfabético:
 * `{ clave: "barinas", nombre: "Barinas", ciudades: [{ clave: "socopo", nombre: "Socopó" }, …] }`.
 */
export const ESTADOS_VE: readonly EstadoVE[] = CATALOGO_FUENTE.map(([nombre, ciudades]) => ({
  clave: normalizarCiudad(nombre),
  nombre,
  ciudades: ciudades.map((c) => ({ clave: normalizarCiudad(c), nombre: c })),
}));

/** El estado del catálogo por su clave o su nombre ("barinas", "Mérida", "DISTRITO CAPITAL"), o null. */
export function estadoVE(v: string | null | undefined): EstadoVE | null {
  const clave = normalizarCiudad(v);
  if (!clave) return null;
  for (const e of ESTADOS_VE) if (e.clave === clave) return e;
  return null;
}

/**
 * La ciudad del catálogo y su estado, por clave o nombre ("socopo", "Socopó",
 * "San Juan de los Morros"), o null si no está en el catálogo. Con `estado`, solo
 * busca en ese estado.
 */
export function ciudadVE(
  v: string | null | undefined,
  estado?: string | null
): { estado: EstadoVE; ciudad: CiudadVE } | null {
  const clave = normalizarCiudad(v);
  if (!clave) return null;
  const claveEstado = estado ? normalizarCiudad(estado) : "";
  for (const e of ESTADOS_VE) {
    if (claveEstado && e.clave !== claveEstado) continue;
    for (const c of e.ciudades) if (c.clave === clave) return { estado: e, ciudad: c };
  }
  return null;
}

/** Nombres legibles por clave ("san_juan" → "San Juan de los Morros"): estados y ciudades del catálogo. */
const NOMBRES_CIUDAD: Record<string, string> = {};
for (const e of ESTADOS_VE) {
  NOMBRES_CIUDAD[e.clave] = e.nombre;
  for (const c of e.ciudades) NOMBRES_CIUDAD[c.clave] = c.nombre;
}

/** Partículas que van en minúscula dentro de un nombre ("Valle de la Pascua"), salvo al inicio. */
const PARTICULAS_CIUDAD: Record<string, true> = { de: true, del: true, la: true, las: true, los: true, y: true };

/**
 * Nombre legible de una ciudad o estado: "merida" → "Mérida", "puerto_la_cruz" → "Puerto La Cruz",
 * "san_juan" → "San Juan de los Morros", "VALENCIA" → "Valencia"; '' si está vacía.
 * Sin nombre conocido: cada palabra con mayúscula inicial salvo de/del/la/las/los/y
 * ("SAN JOSE DE GUANIPA" → "San Jose de Guanipa"; "la_victoria" → "La Victoria").
 */
export function formatCiudad(v: string | null | undefined): string {
  const clave = normalizarCiudad(v);
  if (!clave) return "";
  const conocido = NOMBRES_CIUDAD[clave];
  if (conocido) return conocido;
  return (v ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((palabra, i) =>
      i > 0 && PARTICULAS_CIUDAD[palabra] ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1)
    )
    .join(" ");
}

/** "puerto_la_cruz → valencia" → "Puerto La Cruz → Valencia" */
export function formatRuta(ruta: string | null | undefined): string {
  if (!ruta) return "";
  return ruta
    .split("→")
    .map((parte) => formatCiudad(parte))
    .join(" → ");
}

/** true si las dos ciudades son la misma según `normalizar_localidad` (y ninguna está vacía). */
export function mismaCiudad(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarCiudad(a);
  return na !== "" && na === normalizarCiudad(b);
}

// ─── Terminales de pasajeros ─────────────────────────────────────────────────
// Terminales y paradas desde donde salen los buses, por ciudad del catálogo (fuente: la
// matriz nacional de terminales y paradas de noviembre de 2026). Al programar un viaje el
// panel ofrece los de la ciudad de origen de la ruta y luego los demás de su estado; el
// viaje guarda el `nombre` en `viajes.terminal_origen` y la app lo muestra tal cual.
// Para añadir uno basta con escribirlo aquí y ejecutar `node shared/generar.mjs`.

/** "terminal": con edificio (formal o parcial); "parada": punto de embarque sin terminal. */
export type TipoTerminalVE = "terminal" | "parada";

export type TerminalVE = {
  /** "terminal_la_bandera": única en todo el país. */
  readonly clave: string;
  /** "Terminal La Bandera": lo que guarda el viaje y ve el pasajero. */
  readonly nombre: string;
  readonly tipo: TipoTerminalVE;
  /** Clave de la ciudad del catálogo ("caracas"). */
  readonly ciudad: string;
  /** Clave del estado ("distrito_capital"). */
  readonly estado: string;
};

/** Largo máximo del nombre de un terminal (= CHECK de `viajes.terminal_origen`). */
export const TERMINAL_MAX = 120;

/**
 * Nombre de la ciudad del catálogo → sus terminales, los de más infraestructura primero.
 * "T" = "Terminal de <ciudad>", "P" = "Parada de <ciudad>"; otro texto es el nombre completo
 * (empieza por "Terminal" si es un terminal; si no, es una parada).
 */
const TERMINALES_FUENTE: readonly (readonly [string, readonly string[]])[] = [
  // Distrito Capital (Petare y el Distribuidor Metropolitano son de Miranda, pero se viaja "desde Caracas")
  [
    "Caracas",
    [
      "Terminal La Bandera", "Terminal de Oriente", "Terminal Nuevo Circo", "Terminal Ruperto Lugo (Catia)",
      "Parada de Gato Negro", "Parada de Plaza Venezuela (Zona Rental)", "Parada de La Hoyada",
      "Parada de San Martín (frente a la Maternidad)", "Parada de Antímano (plaza Bolívar)",
      "Parada de El Paraíso (redoma de La India)", "Parada del Distribuidor Metropolitano",
      "Parada de Petare (bajo el elevado)",
    ],
  ],
  // Miranda
  ["Guatire", ["T"]],
  ["Guarenas", ["T"]],
  ["Ocumare del Tuy", ["Terminal de Ocumare del Tuy (Pasaje Los Indios)"]],
  ["Charallave", ["Terminal de Charallave (Don Simón Rodríguez)"]],
  ["Cúa", ["Terminal de Cúa (estación del ferrocarril)"]],
  ["Santa Teresa del Tuy", ["T"]],
  ["Río Chico", ["T"]],
  ["Cúpira", ["T"]],
  ["Caucagua", ["P"]],
  ["San Antonio de los Altos", ["Parada de San Antonio de los Altos (redoma La Rosaleda)"]],
  ["Los Teques", ["Parada de Los Teques (La Hoyada)"]],
  // La Guaira
  ["Maiquetía", ["Terminal de La Guaira (Maiquetía)"]],
  ["Catia La Mar", ["T"]],
  ["Macuto", ["Parada de Caribe (Macuto)"]],
  ["Caraballeda", ["Parada de Caraballeda (Los Corales)"]],
  ["Naiguatá", ["P"]],
  ["Chuspa", ["P"]],
  // Aragua
  ["Maracay", ["Terminal Central de Maracay"]],
  ["La Victoria", ["T"]],
  ["Turmero", ["T"]],
  ["Cagua", ["T"]],
  ["Las Tejerías", ["T"]],
  ["Villa de Cura", ["T"]],
  ["Palo Negro", ["Parada de Palo Negro (redoma)"]],
  ["Choroní", ["Parada de Choroní (malecón)"]],
  ["Ocumare de la Costa", ["Parada de Ocumare de la Costa (El Playón)"]],
  ["San Mateo", ["P"]],
  // Carabobo
  [
    "Valencia",
    ["Terminal Big Low Center", "Parada de Las Chimeneas", "Parada de Flor Amarillo", "Parada de Santa Rosa"],
  ],
  ["Puerto Cabello", ["T", "Parada de Patanemo"]],
  ["Guacara", ["T"]],
  ["Los Guayos", ["T"]],
  ["Morón", ["T"]],
  ["Naguanagua", ["Parada de Naguanagua (redoma de Guaparo)"]],
  ["Bejuma", ["P"]],
  // Cojedes
  ["San Carlos", ["T"]],
  ["Tinaquillo", ["T"]],
  ["Tinaco", ["P"]],
  ["El Baúl", ["P"]],
  ["Las Vegas", ["P"]],
  ["El Pao", ["P"]],
  // Guárico
  ["San Juan de los Morros", ["T"]],
  ["Calabozo", ["T"]],
  ["Valle de la Pascua", ["T"]],
  ["Zaraza", ["T"]],
  ["Altagracia de Orituco", ["T"]],
  ["El Sombrero", ["P"]],
  ["Camaguán", ["P"]],
  ["San José de Guaribe", ["P"]],
  ["Ortiz", ["P"]],
  // Zulia
  ["Maracaibo", ["Terminal de Maracaibo", "Parada de La Curva de Molina", "Parada de Los Haticos"]],
  ["Ciudad Ojeda", ["T"]],
  ["Cabimas", ["T"]],
  ["Santa Rita", ["T"]],
  ["Machiques", ["T"]],
  ["Villa del Rosario", ["T"]],
  ["San Timoteo", ["T"]],
  ["Los Puertos de Altagracia", ["T"]],
  ["San Francisco", ["Parada de San Francisco (sector Plazuela)"]],
  ["Bachaquero", ["P"]],
  ["Sinamaica", ["P"]],
  ["Paraguachón", ["P"]],
  // Falcón
  ["Coro", ["T"]],
  ["Punto Fijo", ["Terminal de Punto Fijo (Alí Primera)"]],
  ["Tucacas", ["T"]],
  ["Chichiriviche", ["T"]],
  ["Dabajuro", ["T"]],
  ["Churuguara", ["T"]],
  ["Puerto Cumarebo", ["P"]],
  ["Adícora", ["P"]],
  ["Yaracal", ["P"]],
  ["San Juan de los Cayos", ["P"]],
  // Lara
  ["Barquisimeto", ["T", "Parada del centro de Barquisimeto (Mercabar)"]],
  ["Quíbor", ["T"]],
  ["El Tocuyo", ["T"]],
  ["Carora", ["T"]],
  ["Sarare", ["T"]],
  ["Duaca", ["P"]],
  ["Cubiro", ["P"]],
  ["Siquisique", ["P"]],
  // Yaracuy
  ["San Felipe", ["T"]],
  ["Yaritagua", ["T", "Parada de Yaritagua (distribuidor)"]],
  ["Chivacoa", ["T"]],
  ["Nirgua", ["T"]],
  ["Urachiche", ["P"]],
  ["Aroa", ["P"]],
  ["Guama", ["P"]],
  // Táchira
  ["San Cristóbal", ["T"]],
  ["San Antonio del Táchira", ["T"]],
  ["La Fría", ["T"]],
  ["Colón", ["T"]],
  ["Táriba", ["T"]],
  ["Rubio", ["T"]],
  ["La Grita", ["T"]],
  ["El Piñal", ["Parada de El Piñal (Troncal 5)"]],
  ["Ureña", ["P"]],
  ["Capacho", ["P"]],
  ["Bramón", ["P"]],
  ["Seboruco", ["P"]],
  // Mérida
  ["Mérida", ["T"]],
  ["El Vigía", ["T"]],
  ["Tovar", ["T"]],
  ["Santa Cruz de Mora", ["T"]],
  ["Timotes", ["T"]],
  ["Ejido", ["Parada de Ejido (El Llano)"]],
  ["Bailadores", ["P"]],
  ["Apartaderos", ["Parada de Apartaderos (Pico El Águila)"]],
  ["Mucuchíes", ["P"]],
  ["La Azulita", ["P"]],
  ["Zea", ["P"]],
  // Trujillo
  ["Valera", ["T"]],
  ["Trujillo", ["T"]],
  ["Boconó", ["T"]],
  ["Sabana de Mendoza", ["T"]],
  ["Isnotú", ["P"]],
  ["Carache", ["P"]],
  ["Pampán", ["P"]],
  ["Escuque", ["P"]],
  ["La Ceiba", ["P"]],
  // Barinas
  ["Barinas", ["T", "Parada de Torunos"]],
  ["Ciudad Bolivia", ["T"]],
  ["Santa Bárbara de Barinas", ["T"]],
  ["Socopó", ["T"]],
  ["Barinitas", ["P"]],
  ["Sabaneta", ["P"]],
  ["Barrancas", ["P"]],
  // Portuguesa
  ["Acarigua", ["Terminal de Acarigua-Araure"]],
  ["Guanare", ["T"]],
  ["Biscucuy", ["T"]],
  ["Turén", ["Parada de Turén (Villa Bruzual)"]],
  ["Ospino", ["P"]],
  ["Píritu", ["P"]],
  ["Boconoíto", ["Parada de San Genaro de Boconoíto"]],
  // Anzoátegui
  ["Puerto La Cruz", ["T"]],
  ["Barcelona", ["T"]],
  ["El Tigre", ["T"]],
  ["Anaco", ["T"]],
  ["San José de Guanipa", ["T"]],
  ["Clarines", ["T"]],
  ["Cantaura", ["P"]],
  ["Puerto Píritu", ["Parada de Puerto Píritu (Troncal 9)"]],
  ["Aragua de Barcelona", ["P"]],
  ["Boca de Uchire", ["P"]],
  // Sucre
  ["Cumaná", ["T"]],
  ["Carúpano", ["T"]],
  ["Río Caribe", ["T"]],
  ["Güiria", ["P"]],
  ["Cariaco", ["P"]],
  ["San Antonio del Golfo", ["P"]],
  ["Irapa", ["P"]],
  // Monagas
  ["Maturín", ["Terminal de Maturín"]],
  ["Punta de Mata", ["T"]],
  ["Quiriquire", ["T"]],
  ["Caripito", ["P"]],
  ["Temblador", ["P"]],
  ["Caicara de Maturín", ["P"]],
  ["San Antonio de Maturín", ["P"]],
  // Delta Amacuro
  ["Tucupita", ["T"]],
  ["Curiapo", ["P"]],
  ["Pedernales", ["P"]],
  ["Casacoima", ["P"]],
  // Bolívar
  ["Ciudad Bolívar", ["T"]],
  ["Puerto Ordaz", ["Terminal de Puerto Ordaz (Manuel Piar)"]],
  ["San Félix", ["T"]],
  ["Upata", ["T"]],
  ["Santa Elena de Uairén", ["T"]],
  ["Caicara del Orinoco", ["T"]],
  ["El Callao", ["P"]],
  ["Tumeremo", ["P"]],
  ["Guasipati", ["P"]],
  ["El Manteco", ["P"]],
  // Amazonas
  ["Puerto Ayacucho", ["T"]],
  ["San Fernando de Atabapo", ["P"]],
  ["Maroa", ["P"]],
  ["San Carlos de Río Negro", ["P"]],
  // Nueva Esparta
  ["Porlamar", ["T"]],
  ["Juan Griego", ["T"]],
  ["La Asunción", ["P"]],
  ["Pampatar", ["P"]],
  ["San Juan Bautista", ["P"]],
  ["Boca de Pozo", ["P"]],
];

/** Clave de un terminal: "Terminal Ruperto Lugo (Catia)" → "terminal_ruperto_lugo_catia"; '' si está vacío. */
export function claveTerminal(v: string | null | undefined): string {
  return normalizarCiudad(v)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Todos los terminales y paradas del catálogo, agrupados por ciudad:
 * `{ clave: "terminal_la_bandera", nombre: "Terminal La Bandera", tipo: "terminal", ciudad: "caracas", estado: "distrito_capital" }`.
 * Una ciudad que no esté en el catálogo deja `estado` vacío (lo vigilan las pruebas de shared/).
 */
export const TERMINALES_VE: readonly TerminalVE[] = TERMINALES_FUENTE.reduce<TerminalVE[]>(
  (lista, [nombreCiudad, terminales]) => {
    const enCatalogo = ciudadVE(nombreCiudad);
    for (const t of terminales) {
      const nombre = t === "T" ? `Terminal de ${nombreCiudad}` : t === "P" ? `Parada de ${nombreCiudad}` : t;
      lista.push({
        clave: claveTerminal(nombre),
        nombre,
        tipo: nombre.indexOf("Terminal") === 0 ? "terminal" : "parada",
        ciudad: normalizarCiudad(nombreCiudad),
        estado: enCatalogo ? enCatalogo.estado.clave : "",
      });
    }
    return lista;
  },
  []
);

/** El terminal del catálogo por su clave o su nombre ("terminal_la_bandera", "Terminal La Bandera"), o null. */
export function terminalVE(v: string | null | undefined): TerminalVE | null {
  const clave = claveTerminal(v);
  if (!clave) return null;
  for (const t of TERMINALES_VE) if (t.clave === clave) return t;
  return null;
}

/**
 * Terminales para salir de una ciudad: `ciudad`, los suyos; `estado`, los demás de su estado
 * (para ciudades sin terminal propio, como Lechería o Cabudare). `estado` solo hace falta si
 * la ciudad no está en el catálogo.
 */
export function terminalesParaSalir(
  ciudad: string | null | undefined,
  estado?: string | null
): { ciudad: TerminalVE[]; estado: TerminalVE[] } {
  const claveCiudad = normalizarCiudad(ciudad);
  const enCatalogo = claveCiudad ? ciudadVE(claveCiudad, estado) ?? ciudadVE(claveCiudad) : null;
  const claveEstado = enCatalogo ? enCatalogo.estado.clave : normalizarCiudad(estado);
  const propios: TerminalVE[] = [];
  const otros: TerminalVE[] = [];
  for (const t of TERMINALES_VE) {
    if (claveCiudad && t.ciudad === claveCiudad) propios.push(t);
    else if (claveEstado && t.estado === claveEstado) otros.push(t);
  }
  return { ciudad: propios, estado: otros };
}

// ─── Fechas en hora de Venezuela ─────────────────────────────────────────────
// Venezuela usa UTC-4 fijo (sin horario de verano) desde el 1 de mayo de 2016. Estos
// helpers no dependen de la zona horaria del servidor, del navegador ni del teléfono:
// evitan el desfase de "hoy" después de las 20:00 que produce
// `new Date().toISOString().slice(0, 10)`.
// Las fechas de día viajan como 'YYYY-MM-DD' y las horas como 'HH:mm'.
//
// Los formatos por defecto ("03/10/2026", "2:30 p. m.") se calculan a mano con el
// desfase fijo, sin Intl: así servidor (Node), navegador y Hermes producen exactamente
// el mismo texto (sin errores de hidratación por espacios distintos según la versión
// de ICU, ni dependencia del soporte de `timeZone` del motor). Solo `formatFechaVE` con
// `opciones` usa Intl. (Entre 2007-12-09 y 2016-05-01 Venezuela usó UTC-4:30: las horas
// de esas fechas antiguas salen corridas 30 minutos.)

export const ZONA_VE = "America/Caracas";
const OFFSET_VE = "-04:00";
const OFFSET_VE_MS = -4 * 60 * 60 * 1000;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/** Convierte un ISO, timestamp, Date o 'YYYY-MM-DD' en Date (un día suelto se toma al mediodía en Venezuela). */
function aDate(valor: string | number | Date): Date {
  if (valor instanceof Date) return valor;
  if (typeof valor === "string" && FECHA_RE.test(valor)) {
    return new Date(`${valor}T12:00:00${OFFSET_VE}`);
  }
  return new Date(valor);
}

const dos = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Partes de calendario y reloj de un instante válido, vistas en Venezuela (UTC-4). */
function partesVE(d: Date): { anio: number; mes: number; dia: number; hora: number; minuto: number } {
  const v = new Date(d.getTime() + OFFSET_VE_MS);
  return {
    anio: v.getUTCFullYear(),
    mes: v.getUTCMonth() + 1,
    dia: v.getUTCDate(),
    hora: v.getUTCHours(),
    minuto: v.getUTCMinutes(),
  };
}

const anio4 = (n: number) => String(n).padStart(4, "0");

/** 14, 30 → "2:30 p. m."; 0, 5 → "12:05 a. m." (mismo texto que Intl es-VE en Node). */
function hora12(hora: number, minuto: number): string {
  const h = hora % 12 === 0 ? 12 : hora % 12;
  return `${h}:${dos(minuto)} ${hora < 12 ? "a. m." : "p. m."}`;
}

/** "03/10/2026" de un instante válido. */
function fechaCorta(d: Date): string {
  const p = partesVE(d);
  return `${dos(p.dia)}/${dos(p.mes)}/${anio4(p.anio)}`;
}

/** Fecha 'YYYY-MM-DD' de un instante, vista en Venezuela (por defecto, ahora). Lanza RangeError si es inválido. */
export function fechaVE(valor: string | number | Date = new Date()): string {
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Fecha inválida: "${String(valor)}"`);
  const p = partesVE(d);
  return `${anio4(p.anio)}-${dos(p.mes)}-${dos(p.dia)}`;
}

/** Fecha de hoy en Venezuela, 'YYYY-MM-DD'. */
export function hoyVE(): string {
  return fechaVE();
}

/** Instante ISO (UTC) de una fecha y hora locales de Venezuela. Lanza RangeError si el formato es inválido. */
export function fechaHoraVEaISO(fecha: string, hora: string): string {
  if (!FECHA_RE.test(fecha) || !HORA_RE.test(hora)) {
    throw new RangeError(`Fecha u hora inválida: "${fecha}" "${hora}"`);
  }
  const segundos = hora.length === 5 ? `${hora}:00` : hora;
  const d = new Date(`${fecha}T${segundos}${OFFSET_VE}`);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Fecha u hora inválida: "${fecha}" "${hora}"`);
  }
  return d.toISOString();
}

/** Rango ISO que cubre el día local completo (00:00:00.000 a 23:59:59.999 en Venezuela). Usar con gte/lte. */
export function rangoDiaVE(fecha: string): { desde: string; hasta: string } {
  return {
    desde: fechaHoraVEaISO(fecha, "00:00:00"),
    hasta: new Date(new Date(fechaHoraVEaISO(fecha, "23:59:59")).getTime() + 999).toISOString(),
  };
}

/** Suma (o resta, con negativos) días a una fecha 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'. */
export function sumarDiasVE(fecha: string, dias: number): string {
  if (!FECHA_RE.test(fecha)) throw new RangeError(`Fecha inválida: "${fecha}"`);
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Fecha legible en Venezuela, p. ej. "03/10/2026". Acepta opciones de Intl para otros formatos. */
export function formatFechaVE(
  valor: string | number | Date,
  opciones?: Intl.DateTimeFormatOptions
): string {
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  return opciones
    ? new Intl.DateTimeFormat("es-VE", { timeZone: ZONA_VE, ...opciones }).format(d)
    : fechaCorta(d);
}

/** Hora legible en Venezuela, p. ej. "2:30 p. m.". Acepta un ISO, Date o una hora 'HH:mm'. */
export function formatHoraVE(valor: string | number | Date): string {
  if (typeof valor === "string" && HORA_RE.test(valor)) {
    // Hora suelta (columna `time`): se formatea sin convertir de zona.
    const hora = Number(valor.slice(0, 2));
    const minuto = Number(valor.slice(3, 5));
    const seg = valor.length > 5 ? Number(valor.slice(6, 8)) : 0;
    return hora > 23 || minuto > 59 || seg > 59 ? "" : hora12(hora, minuto);
  }
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  const p = partesVE(d);
  return hora12(p.hora, p.minuto);
}

/** Separador entre fecha y hora en todo EnBus: "03/11/2026 · 2:30 p. m.". */
const SEPARADOR_FECHA_HORA = " · ";

/** Fecha y hora legibles en Venezuela (tablas del panel), p. ej. "03/11/2026 · 2:30 p. m.". */
export function formatFechaHoraVE(valor: string | number | Date): string {
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  const p = partesVE(d);
  return `${fechaCorta(d)}${SEPARADOR_FECHA_HORA}${hora12(p.hora, p.minuto)}`;
}

/** Día y mes con hora (tablas del panel): "03/11 · 2:30 p. m.". Inválido → "". */
export function formatFechaHoraCortaVE(valor: string | number | Date): string {
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  const p = partesVE(d);
  return `${dos(p.dia)}/${dos(p.mes)}${SEPARADOR_FECHA_HORA}${hora12(p.hora, p.minuto)}`;
}

/**
 * Día de calendario (columna DATE, 'YYYY-MM-DD') como "04/10/2026" sin pasar por Date,
 * así nunca se corre un día por la zona horaria. Otro formato se devuelve tal cual.
 */
export function formatFechaCalendario(yyyyMmDd: string): string {
  const m = (yyyyMmDd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (yyyyMmDd ?? "");
}

const DIAS_CORTOS = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."];
const MESES_CORTOS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."];

/** Día de la semana ("mar.") de una fecha 'YYYY-MM-DD'. */
function diaSemanaCorto(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return DIAS_CORTOS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Día para el pasajero (app y landing): "mar. 3 nov."; con año si no es el actual:
 * "mar. 3 nov. 2025". Acepta ISO, timestamp, Date o 'YYYY-MM-DD' (sin correr de día).
 * Hecho a mano (sin Intl de fecha) para que Hermes, Node y el navegador coincidan. Inválido → "".
 */
export function formatDiaVE(valor: string | number | Date, ahora: Date = new Date()): string {
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  const dia = fechaVE(d);
  const [y, m, dd] = dia.split("-");
  const base = `${diaSemanaCorto(dia)} ${Number(dd)} ${MESES_CORTOS[Number(m) - 1]}`;
  return y === fechaVE(ahora).slice(0, 4) ? base : `${base} ${y}`;
}

/** Día y hora para el pasajero: "mar. 3 nov. · 2:30 p. m.". Inválido → "". */
export function formatDiaHoraVE(valor: string | number | Date, ahora: Date = new Date()): string {
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDiaVE(d, ahora)}${SEPARADOR_FECHA_HORA}${formatHoraVE(d)}`;
}

/** Primera letra en mayúscula para empezar una frase: "hoy" → "Hoy", "hace 5 min" → "Hace 5 min". */
export function capitalizarInicio(s: string): string {
  const texto = s ?? "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Tiempo relativo para listas: "hace un momento", "hace 5 min", "hace 2 h" (mismo día),
 * "ayer a las 8:30 p. m.", "vie. 04/10" (otro año: "vie. 04/10/2025"). Inválido → "".
 */
export function formatHaceTiempo(v: string | number | Date, ahora: Date = new Date()): string {
  const d = aDate(v);
  if (Number.isNaN(d.getTime())) return "";
  const segundos = Math.floor((ahora.getTime() - d.getTime()) / 1000);
  if (segundos >= -60 && segundos < 60) return "hace un momento";
  const dia = fechaVE(d);
  const hoy = fechaVE(ahora);
  if (segundos > 0) {
    if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
    if (dia === hoy) return `hace ${Math.floor(segundos / 3600)} h`;
    if (dia === sumarDiasVE(hoy, -1)) return `ayer a las ${formatHoraVE(d)}`;
  }
  const [y, m, dd] = dia.split("-");
  const semana = diaSemanaCorto(dia);
  return y === hoy.slice(0, 4) ? `${semana} ${dd}/${m}` : `${semana} ${dd}/${m}/${y}`;
}

/** Duración legible: 45 → "45 min", 510 → "8 h 30 min", 480 → "8 h". Inválida o negativa → "". */
export function formatDuracion(minutos: number): string {
  if (typeof minutos !== "number" || !Number.isFinite(minutos) || minutos < 0) return "";
  const total = Math.round(minutos);
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (h === 0) return `${min} min`;
  return min === 0 ? `${h} h` : `${h} h ${min} min`;
}
