// ─────────────────────────────────────────────────────────────────────────────
// Horario de atención de una sucursal, por día de la semana.
//
// Se guarda dos veces en `sucursales`:
//   - `horario_semana` (jsonb): la estructura, para volver a editarla en el panel.
//   - `horario` (text): el texto que genera `horarioATexto`, que es lo que muestra la app
//     ("Lun a vie 7:00 a. m. – 6:00 p. m. · Sáb 8:00 a. m. – 12:00 p. m. · Dom cerrado").
// Módulo puro (sin React ni Supabase) para poder probarlo aislado.
// La forma la valida también un CHECK en SQL (migración 20261109000002).
// ─────────────────────────────────────────────────────────────────────────────

export const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
export type DiaSemana = (typeof DIAS)[number];

/** Un turno: "HH:MM" en 24 h. `cierra` puede ser "24:00" (medianoche) o menor que `abre` (cierra al día siguiente). */
export interface Tramo {
  abre: string;
  cierra: string;
}

/** Día sin turnos = cerrado. Con dos turnos = horario partido (p. ej. cierra al mediodía). */
export interface HorarioSemana {
  v: 1;
  dias: Record<DiaSemana, Tramo[]>;
}

export const DIA_CORTO: Record<DiaSemana, string> = {
  lun: "Lun", mar: "Mar", mie: "Mié", jue: "Jue", vie: "Vie", sab: "Sáb", dom: "Dom",
};

export const DIA_LARGO: Record<DiaSemana, string> = {
  lun: "Lunes", mar: "Martes", mie: "Miércoles", jue: "Jueves", vie: "Viernes", sab: "Sábado", dom: "Domingo",
};

export const DIAS_LABORABLES: readonly DiaSemana[] = ["lun", "mar", "mie", "jue", "vie"];

/** Turnos por día (dos alcanzan para el horario partido). */
export const MAX_TRAMOS = 2;

/**
 * Tope del texto en `sucursales.horario`. El generado nunca pasa de ~420 caracteres
 * (7 días distintos con dos turnos); el texto libre antiguo se cortaba en 120.
 */
export const MAX_TEXTO_HORARIO = 500;

/** Más de esto ya se lee largo en la app (se muestra en una línea pequeña que se parte). */
export const TEXTO_HORARIO_LARGO = 120;

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MEDIANOCHE = "24:00";

// ─── Horas ───────────────────────────────────────────────────────────────────

/** "07:30" → 450; "24:00" → 1440; inválida → null. */
export function aMinutos(hora: string): number | null {
  if (hora === MEDIANOCHE) return 24 * 60;
  if (!HORA_RE.test(hora)) return null;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** 450 → "07:30" (1440 → "24:00"). */
export function deMinutos(min: number): string {
  if (min >= 24 * 60) return MEDIANOCHE;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "07:00" → "7:00 a. m."; "12:00" → "12:00 p. m."; "00:00" y "24:00" → "12:00 a. m.". */
export function hora12(hora: string): string {
  const min = aMinutos(hora);
  if (min === null) return hora;
  const enDia = min % (24 * 60);
  const h = Math.floor(enDia / 60);
  const m = enDia % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

/**
 * Opciones de los selectores de hora, cada `paso` minutos desde las 12:00 a. m.
 * Con `paraCierre` se agrega "24:00" (medianoche) al final.
 */
export function opcionesHora(paso = 30, paraCierre = false): { value: string; label: string }[] {
  const opciones: { value: string; label: string }[] = [];
  for (let min = 0; min < 24 * 60; min += paso) {
    const value = deMinutos(min);
    opciones.push({ value, label: hora12(value) });
  }
  if (paraCierre) opciones.push({ value: MEDIANOCHE, label: "12:00 a. m. (medianoche)" });
  return opciones;
}

/** Cierra al día siguiente (p. ej. 6:00 p. m. – 2:00 a. m.). */
export function cruzaMedianoche(t: Tramo): boolean {
  const abre = aMinutos(t.abre);
  const cierra = aMinutos(t.cierra);
  return abre !== null && cierra !== null && cierra < abre;
}

// ─── Construcción ────────────────────────────────────────────────────────────

export function tramo(abre: string, cierra: string): Tramo {
  return { abre, cierra };
}

/** Horario con los mismos turnos en los días indicados y el resto cerrado. */
export function horarioCon(dias: readonly DiaSemana[], tramos: Tramo[]): HorarioSemana {
  const resultado = horarioCerrado();
  for (const d of dias) resultado.dias[d] = tramos.map((t) => ({ ...t }));
  return resultado;
}

export function horarioCerrado(): HorarioSemana {
  return { v: 1, dias: { lun: [], mar: [], mie: [], jue: [], vie: [], sab: [], dom: [] } };
}

/** Copia los turnos de `origen` a los días `destinos` (sin tocar los demás). */
export function copiarDia(h: HorarioSemana, origen: DiaSemana, destinos: readonly DiaSemana[]): HorarioSemana {
  const dias = { ...h.dias };
  for (const d of destinos) dias[d] = h.dias[origen].map((t) => ({ ...t }));
  return { v: 1, dias };
}

export function conDia(h: HorarioSemana, dia: DiaSemana, tramos: Tramo[]): HorarioSemana {
  return { v: 1, dias: { ...h.dias, [dia]: tramos } };
}

export interface PresetHorario {
  id: string;
  label: string;
  crear: () => HorarioSemana;
}

export const PRESETS_HORARIO: readonly PresetHorario[] = [
  {
    id: "lun-vie",
    label: "Lun a vie, 8 a. m. – 5 p. m.",
    crear: () => horarioCon(DIAS_LABORABLES, [tramo("08:00", "17:00")]),
  },
  {
    id: "lun-sab",
    label: "Lun a sáb, 7 a. m. – 6 p. m.",
    crear: () => horarioCon(["lun", "mar", "mie", "jue", "vie", "sab"], [tramo("07:00", "18:00")]),
  },
  {
    id: "todos",
    label: "Todos los días, 6 a. m. – 8 p. m.",
    crear: () => horarioCon(DIAS, [tramo("06:00", "20:00")]),
  },
  {
    id: "24h",
    label: "24 horas",
    crear: () => horarioCon(DIAS, [tramo("00:00", MEDIANOCHE)]),
  },
];

/** Con lo que arranca el editor cuando la sucursal no tenía horario por días. */
export function horarioInicial(): HorarioSemana {
  return PRESETS_HORARIO[1].crear();
}

// ─── Validación ──────────────────────────────────────────────────────────────

/** Error legible de un día, o null si está bien. */
export function errorDia(dia: DiaSemana, tramos: Tramo[]): string | null {
  const nombre = DIA_LARGO[dia];
  if (tramos.length > MAX_TRAMOS) return `${nombre}: máximo ${MAX_TRAMOS} turnos.`;
  let finAnterior: number | null = null;
  for (let i = 0; i < tramos.length; i++) {
    const abre = aMinutos(tramos[i].abre);
    const cierra = aMinutos(tramos[i].cierra);
    if (abre === null || abre >= 24 * 60 || cierra === null) return `${nombre}: elige la hora de apertura y de cierre.`;
    if (abre === cierra) return `${nombre}: la hora de cierre debe ser distinta a la de apertura.`;
    if (finAnterior !== null && abre < finAnterior) {
      return `${nombre}: el segundo turno debe empezar después de que termine el primero.`;
    }
    if (cierra < abre) {
      // Cierra al día siguiente: solo puede ser el último turno.
      if (i < tramos.length - 1) return `${nombre}: solo el último turno puede cerrar después de medianoche.`;
      finAnterior = null;
    } else {
      finAnterior = cierra;
    }
  }
  return null;
}

/** Primer error del horario completo, o null. */
export function errorHorario(h: HorarioSemana): string | null {
  for (const d of DIAS) {
    const e = errorDia(d, h.dias[d]);
    if (e) return e;
  }
  return null;
}

/**
 * Valida y limpia un horario que llega de afuera (formulario, JSON de la base).
 * Quita claves sobrantes y pasa el cierre "00:00" a "24:00" (medianoche).
 */
export function normalizarHorario(
  valor: unknown
): { ok: true; data: HorarioSemana } | { ok: false; error: string } {
  const invalido = { ok: false as const, error: "El horario no es válido. Vuelve a elegir los días y las horas." };
  if (!valor || typeof valor !== "object") return invalido;
  const dias = (valor as { dias?: unknown }).dias;
  if (!dias || typeof dias !== "object") return invalido;

  const limpio = horarioCerrado();
  for (const d of DIAS) {
    const lista = (dias as Record<string, unknown>)[d];
    if (lista === undefined || lista === null) continue;
    if (!Array.isArray(lista)) return invalido;
    const tramos: Tramo[] = [];
    for (const t of lista) {
      if (!t || typeof t !== "object") return invalido;
      const { abre, cierra } = t as { abre?: unknown; cierra?: unknown };
      if (typeof abre !== "string" || typeof cierra !== "string") return invalido;
      tramos.push({ abre, cierra: cierra === "00:00" ? MEDIANOCHE : cierra });
    }
    const error = errorDia(d, tramos);
    if (error) return { ok: false, error };
    limpio.dias[d] = tramos;
  }
  return { ok: true, data: limpio };
}

/** Lee `sucursales.horario_semana` sin fallar si viene mal: null si no sirve. */
export function leerHorario(valor: unknown): HorarioSemana | null {
  if (valor === null || valor === undefined) return null;
  const r = normalizarHorario(valor);
  return r.ok ? r.data : null;
}

// ─── Texto para la app ───────────────────────────────────────────────────────

function es24Horas(tramos: Tramo[]): boolean {
  return tramos.length === 1 && tramos[0].abre === "00:00" && tramos[0].cierra === MEDIANOCHE;
}

/** "7:00 a. m. – 6:00 p. m." · "24 horas" · "cerrado". */
export function textoTramos(tramos: Tramo[]): string {
  if (tramos.length === 0) return "cerrado";
  if (es24Horas(tramos)) return "24 horas";
  return tramos.map((t) => `${hora12(t.abre)} – ${hora12(t.cierra)}`).join(" y ");
}

/**
 * Días de un grupo: tres o más seguidos se resumen ("Lun a vie"), el resto se nombra
 * ("Sáb y dom", "Lun, mié y vie", "Lun a mié y sáb"). La semana empieza el lunes.
 */
export function textoDias(dias: readonly DiaSemana[]): string {
  const indices = DIAS.map((d, i) => (dias.includes(d) ? i : -1)).filter((i) => i >= 0);
  const partes: string[] = [];
  let i = 0;
  while (i < indices.length) {
    let j = i;
    while (j + 1 < indices.length && indices[j + 1] === indices[j] + 1) j++;
    const largo = j - i + 1;
    if (largo >= 3) {
      partes.push(`${DIA_CORTO[DIAS[indices[i]]]} a ${DIA_CORTO[DIAS[indices[j]]]}`);
    } else {
      for (let k = i; k <= j; k++) partes.push(DIA_CORTO[DIAS[indices[k]]]);
    }
    i = j + 1;
  }
  const texto = partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  // Solo la primera palabra con mayúscula: "Lun a mié y vie".
  return texto.charAt(0) + texto.slice(1).toLowerCase();
}

/**
 * Texto compacto para la app. Agrupa los días con el mismo horario (aunque no sean
 * seguidos), ordena los grupos por su primer día y deja los cerrados al final:
 *   "Lun a vie 7:00 a. m. – 6:00 p. m. · Sáb 8:00 a. m. – 12:00 p. m. · Dom cerrado"
 *   "Todos los días 24 horas" · "Cerrado todos los días"
 */
export function horarioATexto(h: HorarioSemana): string {
  const grupos = new Map<string, { dias: DiaSemana[]; tramos: Tramo[] }>();
  for (const d of DIAS) {
    const tramos = h.dias[d] ?? [];
    const clave = JSON.stringify(tramos.map((t) => [t.abre, t.cierra]));
    const grupo = grupos.get(clave);
    if (grupo) grupo.dias.push(d);
    else grupos.set(clave, { dias: [d], tramos });
  }
  // Los días cerrados van al final aunque empiecen antes ("Vie y sáb … · Lun a jue y dom cerrado").
  const lista = [...grupos.values()].sort((a, b) => Number(a.tramos.length === 0) - Number(b.tramos.length === 0));
  if (lista.length === 1) {
    const { tramos } = lista[0];
    return tramos.length === 0 ? "Cerrado todos los días" : `Todos los días ${textoTramos(tramos)}`;
  }
  return lista.map((g) => `${textoDias(g.dias)} ${textoTramos(g.tramos)}`).join(" · ");
}

/** Igualdad por contenido (para saber si hay cambios o si un preset está aplicado). */
export function mismoHorario(a: HorarioSemana | null, b: HorarioSemana | null): boolean {
  if (!a || !b) return a === b;
  return DIAS.every((d) => JSON.stringify(a.dias[d]) === JSON.stringify(b.dias[d]));
}
