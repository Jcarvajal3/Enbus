// ─── Fechas en hora de Venezuela ─────────────────────────────────────────────
// Venezuela usa UTC-4 fijo (sin horario de verano). Estos helpers no dependen
// de la zona horaria del servidor ni del navegador: evitan el desfase de "hoy"
// después de las 20:00 que produce `new Date().toISOString().slice(0, 10)`.
// Las fechas de día viajan como 'YYYY-MM-DD' y las horas como 'HH:mm'.

export const ZONA_VE = "America/Caracas";
const OFFSET_VE = "-04:00";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}(:\d{2})?$/;

const formatterISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_VE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const formatterFecha = new Intl.DateTimeFormat("es-VE", {
  timeZone: ZONA_VE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatterHora = new Intl.DateTimeFormat("es-VE", {
  timeZone: ZONA_VE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Convierte un ISO, timestamp, Date o 'YYYY-MM-DD' en Date (un día suelto se toma al mediodía en Venezuela). */
function aDate(valor: string | number | Date): Date {
  if (valor instanceof Date) return valor;
  if (typeof valor === "string" && FECHA_RE.test(valor)) {
    return new Date(`${valor}T12:00:00${OFFSET_VE}`);
  }
  return new Date(valor);
}

/** Fecha 'YYYY-MM-DD' de un instante, vista en Venezuela (por defecto, ahora). */
export function fechaVE(valor: string | number | Date = new Date()): string {
  const partes = formatterISO.formatToParts(aDate(valor));
  const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
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
    : formatterFecha.format(d);
}

/** Hora legible en Venezuela, p. ej. "2:30 p. m.". Acepta un ISO, Date o una hora 'HH:mm'. */
export function formatHoraVE(valor: string | number | Date): string {
  if (typeof valor === "string" && HORA_RE.test(valor)) {
    // Hora suelta (columna `time`): se formatea sin convertir de zona.
    valor = `2000-01-01T${valor.length === 5 ? `${valor}:00` : valor}${OFFSET_VE}`;
  }
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  return formatterHora.format(d);
}

/** Fecha y hora legibles en Venezuela, p. ej. "03/10/2026, 2:30 p. m.". */
export function formatFechaHoraVE(valor: string | number | Date): string {
  const d = aDate(valor);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatterFecha.format(d)}, ${formatterHora.format(d)}`;
}
