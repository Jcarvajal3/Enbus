import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hoyVE, rangoDiaVE, sumarDiasVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { requireSuperAdmin } from "./admin-auth";
import { aCentavos, deCentavos, enLotes, leerTodas, rpcNoDisponible } from "./admin-consultas";
import {
  DashboardKPIs,
  DailyActivity,
  TopCooperativa,
  RutaPopular,
  IncidenciaReciente,
  CooperativaBalance,
  resumirIngresos,
} from "../types/admin-dashboard";

/**
 * Boletos vendidos: PAGADO y también USADO (ya embarcó). Contar solo PAGADO hacía
 * que el boleto de hoy desapareciera del conteo y del histórico al embarcar.
 */
const BOLETO_VENDIDO = ["PAGADO", "USADO"];

type PagoConCooperativa = {
  monto: number | string;
  monto_bs: number | string | null;
  cooperativa: { comision_porcentaje: number | string } | null;
};

/** Encomiendas, boletos y pagos verificados de un día (rango ISO en hora de Venezuela). */
async function actividadDelDia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rango: { desde: string; hasta: string },
  tasaHoy: number | null,
  etiqueta: string
) {
  const [encomiendasRes, boletosRes, pagosRes] = await Promise.all([
    supabase
      .from("encomiendas")
      .select("id", { count: "exact", head: true })
      .gte("created_at", rango.desde)
      .lte("created_at", rango.hasta),
    supabase
      .from("boletos")
      .select("id", { count: "exact", head: true })
      .in("estado", BOLETO_VENDIDO)
      .gte("created_at", rango.desde)
      .lte("created_at", rango.hasta),
    // Por verificado_at: un pago registrado ayer y aprobado hoy es ingreso de hoy.
    // Todas las páginas: PostgREST corta en 1000 filas y la suma saldría de menos.
    leerTodas<PagoConCooperativa>((desde, hasta) =>
      supabase
        .from("pagos")
        .select("monto, monto_bs, cooperativa:cooperativas!cooperativa_id(comision_porcentaje)")
        .eq("verificado", true)
        .gte("verificado_at", rango.desde)
        .lte("verificado_at", rango.hasta)
        .order("id", { ascending: true })
        .range(desde, hasta) as unknown as PromiseLike<{ data: PagoConCooperativa[] | null; error: unknown }>
    ).then(
      ({ filas, truncado }) => ({ filas, error: truncado ? new Error("Demasiados pagos en un día") : null }),
      (error: unknown) => ({ filas: [] as PagoConCooperativa[], error })
    ),
  ]);

  if (encomiendasRes.error) console.error(`[fetchDashboardKPIs] encomiendas (${etiqueta}):`, encomiendasRes.error);
  if (boletosRes.error) console.error(`[fetchDashboardKPIs] boletos (${etiqueta}):`, boletosRes.error);
  if (pagosRes.error) console.error(`[fetchDashboardKPIs] pagos (${etiqueta}):`, pagosRes.error);

  const pagos = pagosRes.error ? [] : pagosRes.filas;
  const errorPagos = Boolean(pagosRes.error);
  return {
    encomiendas: encomiendasRes.error ? null : encomiendasRes.count ?? 0,
    boletos: boletosRes.error ? null : boletosRes.count ?? 0,
    ingresos: { ...resumirIngresos(pagos, tasaHoy), error: errorPagos },
    comisiones: {
      ...resumirIngresos(pagos, tasaHoy, (p) => Number(p.cooperativa?.comision_porcentaje ?? 0) / 100),
      error: errorPagos,
    },
  };
}

/**
 * KPIs de hoy y de ayer (hora de Venezuela) para el delta de cada tarjeta.
 * `tasaHoy` (Bs por USD) convierte a Bs los pagos anteriores a la fase 2, que no
 * guardan `monto_bs`.
 */
export async function fetchDashboardKPIs(tasaHoy: number | null = null): Promise<DashboardKPIs> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const hoy = hoyVE();

  const [deHoy, deAyer, cooperativasRes, alertasRes, solicitudesRes] = await Promise.all([
    actividadDelDia(supabase, rangoDiaVE(hoy), tasaHoy, "hoy"),
    actividadDelDia(supabase, rangoDiaVE(sumarDiasVE(hoy, -1)), tasaHoy, "ayer"),
    supabase.from("cooperativas").select("id", { count: "exact", head: true }).eq("estado", "ACTIVA"),
    // Más de 72 h en tránsito sin resolver (abiertas o en proceso), como el enlace del Resumen.
    supabase
      .from("incidencias")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "ALERTA_AMARILLA")
      .in("estado", ["ABIERTA", "EN_PROCESO"]),
    supabase.from("cooperativas").select("id", { count: "exact", head: true }).eq("estado", "PENDIENTE"),
  ]);

  if (cooperativasRes.error) console.error("[fetchDashboardKPIs] cooperativas:", cooperativasRes.error);
  if (alertasRes.error) console.error("[fetchDashboardKPIs] alertas:", alertasRes.error);
  if (solicitudesRes.error) console.error("[fetchDashboardKPIs] solicitudes:", solicitudesRes.error);

  return {
    encomiendas_hoy: deHoy.encomiendas ?? 0,
    boletos_hoy: deHoy.boletos ?? 0,
    error_encomiendas: deHoy.encomiendas === null,
    error_boletos: deHoy.boletos === null,
    ingresos_brutos_hoy: deHoy.ingresos.usd,
    ingresos_hoy: deHoy.ingresos,
    comisiones_estimadas_hoy: deHoy.comisiones.usd,
    comisiones_hoy: deHoy.comisiones,
    cooperativas_activas: cooperativasRes.count ?? 0,
    alertas_amarillas_abiertas: alertasRes.count ?? 0,
    solicitudes_pendientes: solicitudesRes.count ?? 0,
    error_cooperativas: Boolean(cooperativasRes.error),
    error_alertas: Boolean(alertasRes.error),
    error_solicitudes: Boolean(solicitudesRes.error),
    ayer: deAyer,
  };
}

// ─── Actividad de los últimos 30 días ────────────────────────────────────────
// Con `fn_admin_dashboard_actividad` (conteos agrupados en Postgres, una sola
// petición) si la base la tiene. Si no, respaldo: conteos por día con HEAD
// (exactos) y, para el top y las rutas, leer las filas en páginas con un tope.
// Antes se leía con `.limit(5000/10000)`, que PostgREST corta en 1000 filas:
// con más de 1000 movimientos al mes las gráficas salían mal sin ningún aviso.

const DIAS_ACTIVIDAD = 30;
/** Tope de filas del respaldo para el top y las rutas (encima de esto, aproximado). */
const MAX_FILAS_RESPALDO = 20_000;

type AgregadosActividad = {
  actividad: DailyActivity[];
  topCooperativas: TopCooperativa[];
  rutas: RutaPopular[];
};

type RespuestaRpcActividad = {
  actividad?: { fecha: string; encomiendas: number; boletos: number }[];
  top_cooperativas?: { cooperativa_id: string; nombre: string; total: number }[];
  rutas?: { ciudad_origen: string; ciudad_destino: string; total: number }[];
};

function diasActividad(): string[] {
  const hoy = hoyVE();
  return Array.from({ length: DIAS_ACTIVIDAD }, (_, i) => sumarDiasVE(hoy, i - (DIAS_ACTIVIDAD - 1)));
}

function nombreRuta(origen: string, destino: string): string {
  return `${formatCiudad(origen)} → ${formatCiudad(destino)}`;
}

/** Una sola vez por petición aunque la pidan las tres gráficas. */
const obtenerAgregadosActividad = cache(async (): Promise<AgregadosActividad> => {
  await requireSuperAdmin();
  const supabase = await createClient();

  const rpc = await supabase.rpc("fn_admin_dashboard_actividad", { p_dias: DIAS_ACTIVIDAD });
  if (!rpc.error && rpc.data) {
    const r = rpc.data as RespuestaRpcActividad;
    const porDia = new Map((r.actividad ?? []).map((d) => [d.fecha, d]));
    return {
      actividad: diasActividad().map((fecha) => ({
        fecha,
        encomiendas: Number(porDia.get(fecha)?.encomiendas ?? 0),
        boletos: Number(porDia.get(fecha)?.boletos ?? 0),
      })),
      topCooperativas: (r.top_cooperativas ?? []).map((c) => ({
        cooperativa_id: c.cooperativa_id,
        nombre: c.nombre,
        total_transacciones: Number(c.total ?? 0),
      })),
      rutas: (r.rutas ?? []).map((x) => ({ ruta_nombre: nombreRuta(x.ciudad_origen, x.ciudad_destino), total: Number(x.total ?? 0) })),
    };
  }
  if (rpc.error && !rpcNoDisponible(rpc.error)) console.error("[dashboard] fn_admin_dashboard_actividad:", rpc.error);

  const dias = diasActividad();
  const desde = rangoDiaVE(dias[0]).desde;

  // 1. Actividad por día: dos conteos HEAD por día (exactos, sin traer filas).
  const actividad = await enLotes(dias, 10, async (fecha) => {
    const rango = rangoDiaVE(fecha);
    const [enc, bol] = await Promise.all([
      supabase.from("encomiendas").select("id", { count: "exact", head: true }).gte("created_at", rango.desde).lte("created_at", rango.hasta),
      supabase
        .from("boletos")
        .select("id", { count: "exact", head: true })
        .in("estado", BOLETO_VENDIDO)
        .gte("created_at", rango.desde)
        .lte("created_at", rango.hasta),
    ]);
    if (enc.error) console.error("[fetchActivityLast30Days] encomiendas:", enc.error);
    if (bol.error) console.error("[fetchActivityLast30Days] boletos:", bol.error);
    return { fecha, encomiendas: enc.count ?? 0, boletos: bol.count ?? 0 };
  });

  // 2. Top de cooperativas y rutas: filas mínimas, todas las páginas hasta el tope.
  type FilaEnc = { cooperativa_id: string | null; ciudad_origen: string | null; ciudad_destino: string | null };
  const vacio = { filas: [] as never[], truncado: false };
  const [cooperativasRes, encomiendas, boletos] = await Promise.all([
    supabase.from("cooperativas").select("id, nombre").not("estado", "in", "(PENDIENTE,RECHAZADA)"),
    leerTodas<FilaEnc>(
      (d, h) =>
        supabase
          .from("encomiendas")
          .select("cooperativa_id, ciudad_origen, ciudad_destino")
          .gte("created_at", desde)
          .order("id", { ascending: true })
          .range(d, h) as unknown as PromiseLike<{ data: FilaEnc[] | null; error: unknown }>,
      { maxFilas: MAX_FILAS_RESPALDO }
    ).catch((error: unknown) => {
      console.error("[dashboard] encomiendas 30 días:", error);
      return vacio;
    }),
    leerTodas<{ cooperativa_id: string | null }>(
      (d, h) =>
        supabase
          .from("boletos")
          .select("cooperativa_id")
          .in("estado", BOLETO_VENDIDO)
          .gte("created_at", desde)
          .order("id", { ascending: true })
          .range(d, h) as unknown as PromiseLike<{ data: { cooperativa_id: string | null }[] | null; error: unknown }>,
      { maxFilas: MAX_FILAS_RESPALDO }
    ).catch((error: unknown) => {
      console.error("[dashboard] boletos 30 días:", error);
      return vacio;
    }),
  ]);
  if (cooperativasRes.error) console.error("[fetchTop5Cooperativas] cooperativas:", cooperativasRes.error);
  if (encomiendas.truncado || boletos.truncado) {
    console.warn(`[dashboard] Más de ${MAX_FILAS_RESPALDO} filas en 30 días: el top y las rutas son aproximados. Aplica fn_admin_dashboard_actividad.`);
  }

  const counts: Record<string, number> = {};
  const routeCounts: Record<string, number> = {};
  for (const e of encomiendas.filas) {
    if (e.cooperativa_id) counts[e.cooperativa_id] = (counts[e.cooperativa_id] ?? 0) + 1;
    if (e.ciudad_origen && e.ciudad_destino) {
      const ruta = nombreRuta(e.ciudad_origen, e.ciudad_destino);
      routeCounts[ruta] = (routeCounts[ruta] ?? 0) + 1;
    }
  }
  for (const b of boletos.filas) {
    if (b.cooperativa_id) counts[b.cooperativa_id] = (counts[b.cooperativa_id] ?? 0) + 1;
  }

  return {
    actividad,
    topCooperativas: (cooperativasRes.data ?? [])
      .map((c) => ({ cooperativa_id: c.id as string, nombre: c.nombre as string, total_transacciones: counts[c.id] ?? 0 }))
      .sort((a, b) => b.total_transacciones - a.total_transacciones)
      .slice(0, 5),
    rutas: Object.entries(routeCounts)
      .map(([ruta_nombre, total]) => ({ ruta_nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
  };
});

export async function fetchActivityLast30Days(): Promise<DailyActivity[]> {
  return (await obtenerAgregadosActividad()).actividad;
}

export async function fetchTop5Cooperativas(): Promise<TopCooperativa[]> {
  return (await obtenerAgregadosActividad()).topCooperativas;
}

export async function fetchRutasPopulares(): Promise<RutaPopular[]> {
  return (await obtenerAgregadosActividad()).rutas;
}

export async function fetchIncidenciasRecientes(): Promise<IncidenciaReciente[]> {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("incidencias")
    .select(`
      id,
      tipo,
      estado,
      created_at,
      encomienda:encomiendas!encomienda_id(tracking_id),
      reportado_por_profile:profiles!reportado_por(nombre_completo)
    `)
    .neq("estado", "RESUELTA")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) console.error("[fetchIncidenciasRecientes]:", error);

  // Local types matching the Supabase join shape (FK relations infer as array; cast via unknown)
  type EncomiendaJoin = { tracking_id: string } | null;
  type ProfileJoin = { nombre_completo: string } | null;

  return (data ?? []).map((item) => {
    const encomienda = item.encomienda as unknown as EncomiendaJoin;
    const reporter = item.reportado_por_profile as unknown as ProfileJoin;
    return {
      id: item.id,
      tipo: item.tipo,
      estado: item.estado,
      created_at: item.created_at,
      encomienda_tracking_id: encomienda?.tracking_id ?? null,
      reportado_por_nombre: reporter?.nombre_completo ?? null,
    };
  });
}

export async function fetchCooperativasConBalance(): Promise<CooperativaBalance[]> {
  await requireSuperAdmin();
  const supabase = await createClient();

  // Solo los ciclos impagos (filtro sobre el embed): no se trae todo el historial.
  const { data, error } = await supabase
    .from("cooperativas")
    .select(`
      id,
      nombre,
      comision_porcentaje,
      comisiones_ciclo(monto_comision, pagado)
    `)
    .eq("comisiones_ciclo.pagado", false);

  if (error) console.error("[fetchCooperativasConBalance]:", error);

  type CicloJoin = { monto_comision: string; pagado: boolean };
  type CooperativaRow = {
    id: string;
    nombre: string;
    comision_porcentaje: string;
    comisiones_ciclo: CicloJoin[];
  };

  return ((data ?? []) as CooperativaRow[])
    .map((c) => {
      const unpaidCycles = c.comisiones_ciclo?.filter((cc) => !cc.pagado) ?? [];
      // En centavos enteros: sumar floats acumula error.
      const centavos = unpaidCycles.reduce((sum, cc) => sum + aCentavos(cc.monto_comision), 0);
      return {
        cooperativa_id: c.id,
        nombre: c.nombre,
        comision_porcentaje: Number(c.comision_porcentaje),
        monto_pendiente: deCentavos(centavos),
        ciclos_impagos: unpaidCycles.length,
      };
    })
    .sort((a, b) => b.monto_pendiente - a.monto_pendiente);
}
