"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { METODOS_PAGO_COMISION, type GenerarCicloInput, type CicloPreview, type MetodoPagoComision } from "@/lib/types/admin-comisiones";
import { fechaHoraVEaISO, hoyVE, rangoDiaVE } from "@/lib/fechas";
import { humanizeError } from "@/lib/errores";
import { requireSuperAdmin, esUuid } from "@/lib/data/admin-auth";
import { ESTADOS_CON_VENTAS } from "@/lib/data/admin-comisiones";
import {
  aCentavos,
  deCentavos,
  esFechaValida,
  leerTodas,
  porcentajeCentavos,
  rpcNoDisponible,
} from "@/lib/data/admin-consultas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Período máximo de un ciclo (un año). */
const MAX_DIAS_PERIODO = 366;

/** Pagos que se leen como mucho en el respaldo sin RPC; más que eso es un error, no un total recortado. */
const MAX_PAGOS_RESPALDO = 200_000;

/** Error con un texto ya pensado para el usuario (humanizeError lo cambiaría por uno genérico). */
class ErrorParaUsuario extends Error {}

function mensajeError(err: unknown, accion: string): string {
  return err instanceof ErrorParaUsuario ? err.message : humanizeError(err, accion);
}

type Totales = { boletos: number; encomiendas: number }; // centavos

type FilaPagoComision = {
  cooperativa_id: string;
  monto: number | string;
  boleto_id: string | null;
  encomienda_id: string | null;
  boleto: { estado: string } | { estado: string }[] | null;
  encomienda: { estado: string } | { estado: string }[] | null;
};

function uno<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

/**
 * Ventas (USD de referencia, en centavos) de cada cooperativa en el período: pagos
 * APROBADOS en esas fechas (por `verificado_at`, hora de Venezuela: un pago
 * registrado el último día y aprobado al siguiente entra en el ciclo siguiente y
 * no se pierde), sin boletos cancelados ni encomiendas canceladas.
 *
 * Usa `fn_admin_totales_comision` (suma en Postgres) si existe; si no, lee todas
 * las páginas de pagos (PostgREST corta en 1000 filas: sumar solo la primera
 * página daba comisiones de menos).
 */
async function totalesPorCooperativa(
  supabase: Supabase,
  periodoInicio: string,
  periodoFin: string,
  cooperativaId: string | null
): Promise<Map<string, Totales>> {
  const totales = new Map<string, Totales>();

  const rpc = await supabase.rpc("fn_admin_totales_comision", {
    p_desde: periodoInicio,
    p_hasta: periodoFin,
    p_cooperativa_id: cooperativaId,
  });
  if (!rpc.error) {
    for (const fila of (rpc.data ?? []) as { cooperativa_id: string; total_boletos: number | string; total_encomiendas: number | string }[]) {
      totales.set(fila.cooperativa_id, {
        boletos: aCentavos(fila.total_boletos),
        encomiendas: aCentavos(fila.total_encomiendas),
      });
    }
    return totales;
  }
  if (!rpcNoDisponible(rpc.error)) throw rpc.error;

  const desde = rangoDiaVE(periodoInicio).desde;
  const hasta = rangoDiaVE(periodoFin).hasta;
  const { filas, truncado } = await leerTodas<FilaPagoComision>(
    (d, h) => {
      let q = supabase
        .from("pagos")
        .select(
          "cooperativa_id, monto, boleto_id, encomienda_id, boleto:boletos!pagos_boleto_id_fkey(estado), encomienda:encomiendas!pagos_encomienda_id_fkey(estado)"
        )
        .eq("verificado", true)
        .gte("verificado_at", desde)
        .lte("verificado_at", hasta);
      if (cooperativaId) q = q.eq("cooperativa_id", cooperativaId);
      return q.order("id", { ascending: true }).range(d, h) as unknown as PromiseLike<{ data: FilaPagoComision[] | null; error: unknown }>;
    },
    { maxFilas: MAX_PAGOS_RESPALDO }
  );
  if (truncado) {
    throw new ErrorParaUsuario("Hay demasiados pagos en ese período para calcularlo aquí. Elige un período más corto.");
  }

  for (const p of filas) {
    const t = totales.get(p.cooperativa_id) ?? { boletos: 0, encomiendas: 0 };
    const monto = aCentavos(p.monto);
    if (p.boleto_id) {
      const boleto = uno(p.boleto);
      if (boleto && boleto.estado !== "CANCELADO") t.boletos += monto;
    } else if (p.encomienda_id) {
      const encomienda = uno(p.encomienda);
      if (encomienda && encomienda.estado !== "CANCELADA") t.encomiendas += monto;
    }
    totales.set(p.cooperativa_id, t);
  }
  return totales;
}

/** Valida el período y la cooperativa. Devuelve el mensaje de error o null. */
function validarEntrada(input: GenerarCicloInput | null | undefined, { paraGenerar }: { paraGenerar: boolean }): string | null {
  const periodo_inicio = input?.periodo_inicio;
  const periodo_fin = input?.periodo_fin;
  if (!periodo_inicio || !periodo_fin) return "Las fechas de inicio y fin son obligatorias.";
  if (!esFechaValida(periodo_inicio) || !esFechaValida(periodo_fin)) {
    return "Las fechas no tienen un formato válido. Elígelas de nuevo en el calendario.";
  }
  if (periodo_inicio > periodo_fin) return "La fecha de inicio no puede ser posterior a la fecha de fin.";
  const dias = (Date.parse(periodo_fin) - Date.parse(periodo_inicio)) / 86_400_000 + 1;
  if (dias > MAX_DIAS_PERIODO) return "El período no puede ser mayor a un año. Elige fechas más cercanas.";
  // Un ciclo que incluye hoy congelaría un total incompleto (las ventas de lo que
  // queda del día no entrarían en ningún ciclo: el siguiente se solaparía).
  if (paraGenerar && periodo_fin >= hoyVE()) {
    return "El período tiene que terminar antes de hoy: las ventas de hoy todavía no están completas.";
  }
  if (input?.cooperativa_id !== "all" && !esUuid(input?.cooperativa_id)) {
    return "Elige una cooperativa de la lista.";
  }
  return null;
}

/** Cálculo compartido por la vista previa y la generación (sin verificar permisos). */
async function calcularPreviews(supabase: Supabase, input: GenerarCicloInput): Promise<CicloPreview[] | { error: string }> {
  const { periodo_inicio, periodo_fin, cooperativa_id } = input;
  const unaCooperativa = cooperativa_id !== "all" ? cooperativa_id : null;

  // 1. Cooperativas a procesar: activas, suspendidas o desactivadas (siguen debiendo
  // la comisión de lo que vendieron antes de la suspensión).
  let cooperativas: { id: string; nombre: string; comision_porcentaje: number; estado: string }[];
  if (unaCooperativa) {
    const { data: coop, error } = await supabase
      .from("cooperativas")
      .select("id, nombre, comision_porcentaje, estado")
      .eq("id", unaCooperativa)
      .maybeSingle();
    if (error) throw error;
    if (!coop) return { error: "La cooperativa seleccionada no existe." };
    cooperativas = [{ ...coop, comision_porcentaje: Number(coop.comision_porcentaje) }];
  } else {
    const { data: coops, error } = await supabase
      .from("cooperativas")
      .select("id, nombre, comision_porcentaje, estado")
      .in("estado", [...ESTADOS_CON_VENTAS])
      .order("nombre", { ascending: true });
    if (error) throw error;
    cooperativas = (coops ?? []).map((c) => ({ ...c, comision_porcentaje: Number(c.comision_porcentaje) }));
  }

  // 2. Ciclos que se solapan y ventas del período: una consulta cada uno para
  // todas las cooperativas (antes eran dos por cooperativa, en serie).
  const [solapadosRes, totales] = await Promise.all([
    (() => {
      let q = supabase
        .from("comisiones_ciclo")
        .select("cooperativa_id")
        .lte("periodo_inicio", periodo_fin)
        .gte("periodo_fin", periodo_inicio);
      if (unaCooperativa) q = q.eq("cooperativa_id", unaCooperativa);
      return q.limit(10_000);
    })(),
    totalesPorCooperativa(supabase, periodo_inicio, periodo_fin, unaCooperativa),
  ]);
  if (solapadosRes.error) throw solapadosRes.error;
  const solapados = new Set((solapadosRes.data ?? []).map((c) => c.cooperativa_id as string));

  const previews: CicloPreview[] = [];
  for (const coop of cooperativas) {
    const t = totales.get(coop.id) ?? { boletos: 0, encomiendas: 0 };
    // Una suspendida o desactivada sin ventas en el período no aporta nada a la lista.
    if (!unaCooperativa && coop.estado !== "ACTIVA" && t.boletos + t.encomiendas === 0) continue;
    previews.push({
      cooperativa_id: coop.id,
      cooperativa_nombre: coop.nombre,
      total_boletos: deCentavos(t.boletos),
      total_encomiendas: deCentavos(t.encomiendas),
      comision_porcentaje: coop.comision_porcentaje,
      monto_comision: deCentavos(porcentajeCentavos(t.boletos + t.encomiendas, coop.comision_porcentaje)),
      periodo_inicio,
      periodo_fin,
      se_solapa: solapados.has(coop.id),
    });
  }
  return previews;
}

/**
 * Previsualiza el cálculo de comisiones para el período y cooperativa(s) seleccionados,
 * sin guardar ningún cambio en la base de datos.
 */
export async function previewCiclosComision(input: GenerarCicloInput): Promise<{
  success: boolean;
  error?: string;
  previews?: CicloPreview[];
}> {
  try {
    await requireSuperAdmin();
    const invalido = validarEntrada(input, { paraGenerar: false });
    if (invalido) return { success: false, error: invalido };

    const supabase = await createClient();
    const resultado = await calcularPreviews(supabase, input);
    if ("error" in resultado) return { success: false, error: resultado.error };
    return { success: true, previews: resultado };
  } catch (err: unknown) {
    console.error("Error in previewCiclosComision:", err);
    return { success: false, error: mensajeError(err, "calcular la vista previa") };
  }
}

/**
 * Genera e inserta los ciclos de comisión en la base de datos para el período y cooperativa(s) seleccionados.
 * Los montos se recalculan en el servidor (no se aceptan los de la vista previa del cliente).
 */
export async function generarCiclosComision(input: GenerarCicloInput): Promise<{
  success: boolean;
  error?: string;
  summary?: {
    generated: string[];
    skippedOverlap: string[];
    skippedZeroSales: string[];
  };
}> {
  try {
    await requireSuperAdmin();
    const invalido = validarEntrada(input, { paraGenerar: true });
    if (invalido) return { success: false, error: invalido };

    const supabase = await createClient();
    const previews = await calcularPreviews(supabase, input);
    if ("error" in previews) return { success: false, error: previews.error };

    const summary = {
      generated: [] as string[],
      skippedOverlap: [] as string[],
      skippedZeroSales: [] as string[],
    };

    const inserts: {
      cooperativa_id: string;
      periodo_inicio: string;
      periodo_fin: string;
      total_boletos: number;
      total_encomiendas: number;
      comision_porcentaje: number;
      monto_comision: number;
      pagado: boolean;
    }[] = [];

    for (const p of previews) {
      if (p.se_solapa) {
        summary.skippedOverlap.push(p.cooperativa_nombre);
        // Si el usuario solicitó específicamente esta cooperativa, retornar error explícito
        if (input.cooperativa_id !== "all") {
          return {
            success: false,
            error: `Ya existe un ciclo de comisiones generado para ${p.cooperativa_nombre} en este período o que se solapa con él.`,
          };
        }
        continue;
      }

      if (p.total_boletos + p.total_encomiendas <= 0) {
        summary.skippedZeroSales.push(p.cooperativa_nombre);
        continue;
      }

      inserts.push({
        cooperativa_id: p.cooperativa_id,
        periodo_inicio: p.periodo_inicio,
        periodo_fin: p.periodo_fin,
        total_boletos: p.total_boletos,
        total_encomiendas: p.total_encomiendas,
        comision_porcentaje: p.comision_porcentaje,
        monto_comision: p.monto_comision,
        pagado: false,
      });

      summary.generated.push(p.cooperativa_nombre);
    }

    if (inserts.length > 0) {
      // Un solo INSERT: si uno choca con la restricción única, no se guarda ninguno.
      const { error: insertError } = await supabase.from("comisiones_ciclo").insert(inserts);
      if (insertError) throw insertError;
    }

    revalidatePath("/admin/comisiones");
    revalidatePath("/admin/dashboard");

    return { success: true, summary };
  } catch (err: unknown) {
    // Capturar violación de UNIQUE constraint (código PostgreSQL 23505)
    // que ocurriría en una race condition donde dos requests generan el mismo ciclo
    // simultáneamente y el segundo falla atómicamente en la DB.
    const pgError = err as { code?: string };
    if (pgError?.code === "23505" || pgError?.code === "23P01") {
      return {
        success: false,
        error: "Otro administrador generó uno de estos ciclos al mismo tiempo. Actualiza la página e intenta de nuevo.",
      };
    }
    console.error("Error in generarCiclosComision:", err);
    return { success: false, error: mensajeError(err, "generar los ciclos de comisiones") };
  }
}

/**
 * Registra el pago de un ciclo de comisiones: método, referencia (obligatoria salvo
 * en efectivo) y fecha en que pagó la cooperativa, con quién lo registró. Solo si el
 * ciclo sigue pendiente: si otro admin ya lo registró, no se sobrescribe.
 */
export async function marcarCicloComoPagado(
  cicloId: string,
  pago: { fecha: string; metodo: MetodoPagoComision; referencia?: string | null }
): Promise<{
  success: boolean;
  error?: string;
  campo?: "fecha" | "metodo" | "referencia";
}> {
  try {
    const user = await requireSuperAdmin();
    const supabase = await createClient();

    if (!esUuid(cicloId)) {
      return { success: false, error: "No encontramos el ciclo. Actualiza la página e intenta de nuevo." };
    }
    const fecha = (pago?.fecha ?? "").trim();
    const metodo = pago?.metodo;
    const referencia = (pago?.referencia ?? "").trim();
    if (!metodo || !METODOS_PAGO_COMISION.includes(metodo)) {
      return { success: false, error: "Elige cómo pagó la cooperativa.", campo: "metodo" };
    }
    if (metodo !== "EFECTIVO" && referencia.length < 4) {
      return { success: false, error: "Escribe la referencia del pago (mínimo 4 caracteres).", campo: "referencia" };
    }
    if (!esFechaValida(fecha) || fecha > hoyVE()) {
      return { success: false, error: "Elige la fecha en que la cooperativa pagó (no puede ser futura).", campo: "fecha" };
    }

    const { data: actualizados, error } = await supabase
      .from("comisiones_ciclo")
      .update({
        pagado: true,
        pagado_at: fechaHoraVEaISO(fecha, "12:00"),
        pago_metodo: metodo,
        pago_referencia: referencia ? referencia.slice(0, 80) : null,
        pago_registrado_por: user.id,
      })
      .eq("id", cicloId)
      .eq("pagado", false)
      .select("id");

    if (error) {
      console.error("Error registering ciclo payment:", error);
      return { success: false, error: humanizeError(error, "registrar el pago") };
    }
    if (!actualizados || actualizados.length === 0) {
      return { success: false, error: "Este ciclo ya tiene un pago registrado. Actualiza la página." };
    }

    revalidatePath("/admin/comisiones");
    revalidatePath("/admin/cooperativas", "layout");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (err: unknown) {
    console.error("Error in marcarCicloComoPagado:", err);
    return { success: false, error: humanizeError(err, "registrar el pago") };
  }
}
