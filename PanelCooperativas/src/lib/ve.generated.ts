// GENERADO por shared/generar.mjs — no editar a mano. Fuente: shared/ve.ts

// ─── Formatos venezolanos (fuente única) ─────────────────────────────────────
// Cédula, teléfono, RIF, ciudades, fechas en hora de Venezuela y duraciones.
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

/** Nombres con tildes o minúsculas internas, por clave sin tildes (con espacios). */
const NOMBRES_CIUDAD: Record<string, string> = {
  merida: "Mérida",
  falcon: "Falcón",
  bolivar: "Bolívar",
  tachira: "Táchira",
  anzoategui: "Anzoátegui",
  guarico: "Guárico",
  "nueva esparta": "Nueva Esparta",
  "la guaira": "La Guaira",
  maturin: "Maturín",
  cumana: "Cumaná",
  carupano: "Carúpano",
  bocono: "Boconó",
  tariba: "Táriba",
  socopo: "Socopó",
  cua: "Cúa",
  "san fernando": "San Fernando de Apure",
  "san juan": "San Juan de los Morros",
  "puerto la cruz": "Puerto La Cruz",
  lecheria: "Lechería",
  "ciudad bolivar": "Ciudad Bolívar",
  "san felix": "San Félix",
  "valle de la pascua": "Valle de la Pascua",
  "el vigia": "El Vigía",
  "punta de mata": "Punta de Mata",
  "la asuncion": "La Asunción",
  "san cristobal": "San Cristóbal",
  "san antonio del tachira": "San Antonio del Táchira",
  maiquetia: "Maiquetía",
  "catia la mar": "Catia La Mar",
  "ocumare del tuy": "Ocumare del Tuy",
  "santa teresa del tuy": "Santa Teresa del Tuy",
};

/**
 * Nombre legible de una ciudad o estado: "merida" → "Mérida", "puerto_la_cruz" → "Puerto La Cruz",
 * "san_juan" → "San Juan de los Morros", "VALENCIA" → "Valencia"; '' si está vacía.
 */
export function formatCiudad(v: string | null | undefined): string {
  const clave = normalizarCiudad(v);
  if (!clave) return "";
  const conocido = NOMBRES_CIUDAD[clave.replace(/_/g, " ")];
  if (conocido) return conocido;
  return (v ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)([a-zà-ÿ])/g, (_m, espacio: string, letra: string) => espacio + letra.toUpperCase());
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

/** Fecha y hora legibles en Venezuela, p. ej. "03/10/2026, 2:30 p. m.". */
export function formatFechaHoraVE(valor: string | number | Date): string {
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  const p = partesVE(d);
  return `${fechaCorta(d)}, ${hora12(p.hora, p.minuto)}`;
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
  const semana = DIAS_CORTOS[new Date(Date.UTC(Number(y), Number(m) - 1, Number(dd))).getUTCDay()];
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
