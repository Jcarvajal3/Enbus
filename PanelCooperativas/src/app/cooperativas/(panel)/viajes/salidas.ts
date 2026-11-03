// ─── Salidas recurrentes (#52, PC-44) ────────────────────────────────────────
// Función pura: la usan el formulario "Programar viaje" (resumen en vivo) y la
// server action guardarViaje, así lo que se anuncia es exactamente lo que se crea.
// Fechas 'YYYY-MM-DD' y hora 'HH:mm' en hora de Venezuela.

import { fechaHoraVEaISO, fechaVE, formatFechaCalendario, formatHoraVE, sumarDiasVE } from "@/lib/fechas";

/** Días de la semana en el orden del formulario. `dow` = getUTCDay() (0 = domingo). */
export const DIAS_SEMANA = [
  { valor: "L", corto: "Lun", nombre: "Lunes", dow: 1 },
  { valor: "M", corto: "Mar", nombre: "Martes", dow: 2 },
  { valor: "Mi", corto: "Mié", nombre: "Miércoles", dow: 3 },
  { valor: "J", corto: "Jue", nombre: "Jueves", dow: 4 },
  { valor: "V", corto: "Vie", nombre: "Viernes", dow: 5 },
  { valor: "S", corto: "Sáb", nombre: "Sábado", dow: 6 },
  { valor: "D", corto: "Dom", nombre: "Domingo", dow: 0 },
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number]["valor"];

export const MAX_SALIDAS = 120;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}(:\d{2})?$/;

export type CampoSalidas = "dias" | "desde" | "hasta" | "hora";

export type PlanSalidas =
  | {
      ok: true;
      /** ISO de cada salida, en orden. */
      salidas: string[];
      desde: string;
      hasta: string;
      hora: string;
    }
  | { ok: false; error: string; campo: CampoSalidas };

/** Día de la semana de una fecha 'YYYY-MM-DD' (calendario puro, sin zona horaria). */
function dowDe(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "lunes", "lunes ni martes", "lunes, martes ni jueves". */
function listaNi(nombres: string[]): string {
  const n = nombres.map((x) => x.toLowerCase());
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} ni ${n[n.length - 1]}`;
}

/**
 * Salidas que se crearán con los días elegidos entre `desde` y `hasta` (ambos
 * incluidos) a la hora `hora`. Las que ya pasaron (`ahora`) no se cuentan.
 */
export function planificarSalidas(p: {
  dias: readonly string[];
  desde: string;
  hasta: string;
  hora: string;
  ahora?: Date;
}): PlanSalidas {
  const dias = DIAS_SEMANA.filter((d) => p.dias.includes(d.valor));
  if (!FECHA_RE.test(p.desde ?? "")) return { ok: false, error: "Elige la fecha de inicio.", campo: "desde" };
  if (!FECHA_RE.test(p.hasta ?? "")) return { ok: false, error: "Elige la fecha final.", campo: "hasta" };
  if (p.hasta < p.desde) {
    return { ok: false, error: "La fecha final debe ser igual o posterior a la inicial.", campo: "hasta" };
  }
  if (!HORA_RE.test(p.hora ?? "")) return { ok: false, error: "Elige la hora de salida.", campo: "hora" };
  if (dias.length === 0) return { ok: false, error: "Elige al menos un día.", campo: "dias" };

  const dows = new Set<number>(dias.map((d) => d.dow));
  const ahora = (p.ahora ?? new Date()).getTime();
  const salidas: string[] = [];
  let hayEnRango = false;
  try {
    // Comparar 'YYYY-MM-DD' como texto equivale a comparar fechas.
    for (let fecha = p.desde; fecha <= p.hasta; fecha = sumarDiasVE(fecha, 1)) {
      if (!dows.has(dowDe(fecha))) continue;
      hayEnRango = true;
      const iso = fechaHoraVEaISO(fecha, p.hora);
      if (new Date(iso).getTime() <= ahora) continue;
      salidas.push(iso);
      // Se corta antes de recorrer años enteros: con 121 ya sabemos que se pasa.
      if (salidas.length > MAX_SALIDAS) break;
    }
  } catch {
    return { ok: false, error: "Revisa las fechas y la hora de salida: alguna no es válida.", campo: "desde" };
  }

  if (!hayEnRango) {
    return { ok: false, error: `No hay ningún ${listaNi(dias.map((d) => d.nombre))} entre esas fechas.`, campo: "dias" };
  }
  if (salidas.length === 0) {
    return { ok: false, error: "Todas esas salidas ya pasaron. Elige fechas desde hoy en adelante.", campo: "desde" };
  }
  if (salidas.length > MAX_SALIDAS) {
    return { ok: false, error: `Programa como máximo ${MAX_SALIDAS} salidas a la vez.`, campo: "hasta" };
  }
  return { ok: true, salidas, desde: p.desde, hasta: p.hasta, hora: p.hora };
}

/** "Se crearán 24 salidas entre el 05/10 y el 31/10 a las 7:00 a. m." (fechas de la primera y la última). */
export function resumenSalidas(plan: Extract<PlanSalidas, { ok: true }>): string {
  const corta = (iso: string) => formatFechaCalendario(fechaVE(iso)).slice(0, 5);
  const primera = plan.salidas[0];
  const ultima = plan.salidas[plan.salidas.length - 1];
  const hora = formatHoraVE(primera);
  const n = plan.salidas.length;
  if (n === 1) return `Se creará 1 salida el ${corta(primera)} a las ${hora}.`;
  return `Se crearán ${n} salidas entre el ${corta(primera)} y el ${corta(ultima)} a las ${hora}.`;
}

/** Texto del botón: "Programar 24 salidas" / "Programar 1 salida". */
export function textoBotonSalidas(plan: PlanSalidas): string {
  if (!plan.ok) return "Programar salidas";
  return plan.salidas.length === 1 ? "Programar 1 salida" : `Programar ${plan.salidas.length} salidas`;
}
