"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { codigoEB, humanizeError, parseDetalleEB } from "@/lib/errores";
import type { ResultadoHorario } from "@/lib/types/horarios";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)(:00)?$/;
const CAPACIDAD_MAX = 80;

export type CampoHorario = "ruta" | "hora" | "dias" | "capacidad" | "desde" | "hasta";

export type ResultadoGuardarHorario =
  | { success: true; data: ResultadoHorario; error?: undefined; campo?: undefined }
  | { success?: undefined; data?: undefined; error: string; campo?: CampoHorario; codigo?: string };

export type EntradaHorario = {
  /** Sin id se crea; con id se edita. */
  id?: string;
  rutaId: string;
  /** 'HH:mm' */
  hora: string;
  /** 0 = domingo … 6 = sábado. */
  dias: number[];
  capacidad: number;
  /** 'YYYY-MM-DD' */
  desde: string;
  /** 'YYYY-MM-DD' o "" (sin fin). */
  hasta: string;
};

const CAMPOS: readonly string[] = ["ruta", "hora", "dias", "capacidad", "desde", "hasta"];

function falloRpc(error: unknown, accion: string) {
  const detalle = parseDetalleEB(error);
  const campo = typeof detalle.campo === "string" && CAMPOS.includes(detalle.campo) ? (detalle.campo as CampoHorario) : undefined;
  return { error: humanizeError(error, accion), campo, codigo: codigoEB(error) ?? undefined };
}

/** Normaliza lo que devuelve la RPC (jsonb) a `ResultadoHorario`. */
function leerResultado(data: unknown): ResultadoHorario {
  const d = (data ?? {}) as Partial<ResultadoHorario>;
  return {
    id: String(d.id ?? ""),
    creadas: Number(d.creadas ?? 0),
    quitadas: Number(d.quitadas ?? 0),
    movidas: Number(d.movidas ?? 0),
    sin_unidad_por_choque: Number(d.sin_unidad_por_choque ?? 0),
    conservadas: Array.isArray(d.conservadas) ? d.conservadas : [],
    hasta: typeof d.hasta === "string" ? d.hasta : null,
  };
}

function refrescar() {
  revalidatePath("/cooperativas/rutas");
  revalidatePath("/cooperativas/viajes");
  revalidatePath("/cooperativas/dashboard");
}

async function esAdmin(): Promise<string | null> {
  const user = await getUserProfile();
  if (!user) return "Tu sesión expiró. Inicia sesión de nuevo.";
  if (user.role !== "admin_cooperativa" || !user.cooperativa_id) {
    return "Solo el administrador de la cooperativa puede gestionar los horarios.";
  }
  return null;
}

/** Crea o edita un horario y deja las salidas al día (fn_guardar_horario). */
export async function guardarHorario(entrada: EntradaHorario): Promise<ResultadoGuardarHorario> {
  const sinPermiso = await esAdmin();
  if (sinPermiso) return { error: sinPermiso };

  if (entrada.id !== undefined && !UUID_RE.test(entrada.id)) {
    return { error: "No encontramos ese horario. Actualiza la página." };
  }
  if (!UUID_RE.test(entrada.rutaId ?? "")) return { error: "Elige la ruta del horario.", campo: "ruta" };
  if (!HORA_RE.test(entrada.hora ?? "")) return { error: "Elige la hora de salida.", campo: "hora" };
  const dias = [...new Set(entrada.dias ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (dias.length === 0) return { error: "Elige al menos un día de la semana.", campo: "dias" };
  const capacidad = Number(entrada.capacidad);
  if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > CAPACIDAD_MAX) {
    return { error: `La capacidad debe estar entre 1 y ${CAPACIDAD_MAX} asientos.`, campo: "capacidad" };
  }
  if (!FECHA_RE.test(entrada.desde ?? "")) return { error: "Elige desde qué día vale el horario.", campo: "desde" };
  const hasta = entrada.hasta ? entrada.hasta : null;
  if (hasta && !FECHA_RE.test(hasta)) return { error: "Revisa la fecha final.", campo: "hasta" };
  if (hasta && hasta < entrada.desde) return { error: "La fecha final no puede ser anterior a la inicial.", campo: "hasta" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_guardar_horario", {
    p_id: entrada.id ?? null,
    p_ruta_id: entrada.rutaId,
    p_hora_salida: `${entrada.hora.slice(0, 5)}:00`,
    p_dias: dias,
    p_capacidad: capacidad,
    p_vigente_desde: entrada.desde,
    p_vigente_hasta: hasta,
  });
  if (error) {
    console.error("[guardarHorario] Error:", error);
    return falloRpc(error, entrada.id ? "actualizar el horario" : "crear el horario");
  }

  refrescar();
  return { success: true, data: leerResultado(data) };
}

/** Activa o desactiva un horario (fn_cambiar_estado_horario). */
export async function cambiarEstadoHorario(horarioId: string, activo: boolean): Promise<ResultadoGuardarHorario> {
  const sinPermiso = await esAdmin();
  if (sinPermiso) return { error: sinPermiso };
  if (!UUID_RE.test(horarioId ?? "")) return { error: "No encontramos ese horario. Actualiza la página." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cambiar_estado_horario", {
    p_id: horarioId,
    p_activo: activo === true,
  });
  if (error) {
    console.error("[cambiarEstadoHorario] Error:", error);
    return falloRpc(error, activo ? "activar el horario" : "desactivar el horario");
  }

  refrescar();
  return { success: true, data: leerResultado(data) };
}
