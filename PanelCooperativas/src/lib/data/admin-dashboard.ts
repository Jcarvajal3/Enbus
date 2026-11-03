import { createClient } from "@/lib/supabase/server";
import { fechaVE, hoyVE, rangoDiaVE, sumarDiasVE } from "@/lib/fechas";
import {
  DashboardKPIs,
  DailyActivity,
  TopCooperativa,
  RutaPopular,
  IncidenciaReciente,
  CooperativaBalance,
  resumirIngresos,
} from "../types/admin-dashboard";

/** Inicio (ISO) del día de hace `dias` días en Venezuela. */
function inicioHaceDiasVE(dias: number): string {
  return rangoDiaVE(sumarDiasVE(hoyVE(), -dias)).desde;
}

/**
 * KPIs del día (hora de Venezuela). `tasaHoy` (Bs por USD) convierte a Bs los
 * pagos anteriores a la fase 2, que no guardan `monto_bs`.
 */
export async function fetchDashboardKPIs(tasaHoy: number | null = null): Promise<DashboardKPIs> {
  const supabase = await createClient();
  const { desde: hoyInicio, hasta: hoyFin } = rangoDiaVE(hoyVE());

  const [
    encomiendasRes,
    boletosRes,
    pagosRes,
    cooperativasRes,
    alertasRes,
    solicitudesRes,
  ] = await Promise.all([
    // 1. Encomiendas recibidas hoy
    supabase
      .from("encomiendas")
      .select("id", { count: "exact", head: true })
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin),

    // 2. Boletos vendidos hoy
    supabase
      .from("boletos")
      .select("id", { count: "exact", head: true })
      .eq("estado", "PAGADO")
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin),

    // 3. Pagos verificados hoy (por verificado_at: un pago registrado ayer y aprobado hoy
    //    es ingreso de hoy): ingresos (USD + Bs) y comisión de su cooperativa
    supabase
      .from("pagos")
      .select("monto, monto_bs, cooperativa:cooperativas!cooperativa_id(comision_porcentaje)")
      .eq("verificado", true)
      .gte("verificado_at", hoyInicio)
      .lte("verificado_at", hoyFin),

    // 4. Cooperativas activas
    supabase
      .from("cooperativas")
      .select("id", { count: "exact", head: true })
      .eq("estado", "ACTIVA"),

    // 5. Alertas amarillas abiertas
    supabase
      .from("incidencias")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "ALERTA_AMARILLA")
      .eq("estado", "ABIERTA"),

    // 6. Solicitudes pendientes
    supabase
      .from("cooperativas")
      .select("id", { count: "exact", head: true })
      .eq("estado", "PENDIENTE"),
  ]);

  // Log any Supabase errors without crashing the dashboard
  if (encomiendasRes.error) console.error("[fetchDashboardKPIs] encomiendas:", encomiendasRes.error);
  if (boletosRes.error) console.error("[fetchDashboardKPIs] boletos:", boletosRes.error);
  if (pagosRes.error) console.error("[fetchDashboardKPIs] pagos:", pagosRes.error);
  if (cooperativasRes.error) console.error("[fetchDashboardKPIs] cooperativas:", cooperativasRes.error);
  if (alertasRes.error) console.error("[fetchDashboardKPIs] alertas:", alertasRes.error);
  if (solicitudesRes.error) console.error("[fetchDashboardKPIs] solicitudes:", solicitudesRes.error);

  // Each pago row has a nested cooperativa object with comision_porcentaje
  type PagoConCooperativa = {
    monto: number | string;
    monto_bs: number | string | null;
    cooperativa: { comision_porcentaje: number | string } | null;
  };
  const pagos = (pagosRes.data ?? []) as unknown as PagoConCooperativa[];

  // Si la consulta falla, el KPI muestra "—" y un aviso en vez de un 0 engañoso.
  const errorPagos = Boolean(pagosRes.error);
  const ingresos_hoy = { ...resumirIngresos(pagos, tasaHoy), error: errorPagos };
  const comisiones_hoy = {
    ...resumirIngresos(pagos, tasaHoy, (p) => Number(p.cooperativa?.comision_porcentaje ?? 0) / 100),
    error: errorPagos,
  };

  return {
    encomiendas_hoy: encomiendasRes.count ?? 0,
    boletos_hoy: boletosRes.count ?? 0,
    ingresos_brutos_hoy: ingresos_hoy.usd,
    ingresos_hoy,
    comisiones_estimadas_hoy: comisiones_hoy.usd,
    comisiones_hoy,
    cooperativas_activas: cooperativasRes.count ?? 0,
    alertas_amarillas_abiertas: alertasRes.count ?? 0,
    solicitudes_pendientes: solicitudesRes.count ?? 0,
  };
}

export async function fetchActivityLast30Days(): Promise<DailyActivity[]> {
  const supabase = await createClient();
  const hoy = hoyVE();
  const startUTC = inicioHaceDiasVE(29);

  // Only select created_at — the minimal payload needed for grouping
  const [encomiendasRes, boletosRes] = await Promise.all([
    supabase
      .from("encomiendas")
      .select("created_at")
      .gte("created_at", startUTC)
      .limit(5000), // safety cap; at 5k/day avg this covers 30 days comfortably
    supabase
      .from("boletos")
      .select("created_at")
      .eq("estado", "PAGADO")
      .gte("created_at", startUTC)
      .limit(5000),
  ]);

  if (encomiendasRes.error) console.error("[fetchActivityLast30Days] encomiendas:", encomiendasRes.error);
  if (boletosRes.error) console.error("[fetchActivityLast30Days] boletos:", boletosRes.error);

  const activityMap: Record<string, { fecha: string; encomiendas: number; boletos: number }> = {};

  // Initialize map with last 30 days in Venezuela (ensures all days appear even with 0 activity)
  for (let i = 29; i >= 0; i--) {
    const dateStr = sumarDiasVE(hoy, -i);
    activityMap[dateStr] = { fecha: dateStr, encomiendas: 0, boletos: 0 };
  }

  encomiendasRes.data?.forEach((item) => {
    const dateStr = fechaVE(item.created_at);
    if (activityMap[dateStr]) activityMap[dateStr].encomiendas++;
  });

  boletosRes.data?.forEach((item) => {
    const dateStr = fechaVE(item.created_at);
    if (activityMap[dateStr]) activityMap[dateStr].boletos++;
  });

  return Object.values(activityMap).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function fetchTop5Cooperativas(): Promise<TopCooperativa[]> {
  const supabase = await createClient();
  const startUTC = inicioHaceDiasVE(30);

  const [cooperativasRes, encomiendasRes, boletosRes] = await Promise.all([
    supabase.from("cooperativas").select("id, nombre"),
    supabase
      .from("encomiendas")
      .select("cooperativa_id")
      .gte("created_at", startUTC)
      .limit(10000),
    supabase
      .from("boletos")
      .select("cooperativa_id")
      .eq("estado", "PAGADO")
      .gte("created_at", startUTC)
      .limit(10000),
  ]);

  if (cooperativasRes.error) console.error("[fetchTop5Cooperativas] cooperativas:", cooperativasRes.error);
  if (encomiendasRes.error) console.error("[fetchTop5Cooperativas] encomiendas:", encomiendasRes.error);
  if (boletosRes.error) console.error("[fetchTop5Cooperativas] boletos:", boletosRes.error);

  const counts: Record<string, number> = {};
  encomiendasRes.data?.forEach((item) => {
    if (item.cooperativa_id) counts[item.cooperativa_id] = (counts[item.cooperativa_id] ?? 0) + 1;
  });
  boletosRes.data?.forEach((item) => {
    if (item.cooperativa_id) counts[item.cooperativa_id] = (counts[item.cooperativa_id] ?? 0) + 1;
  });

  return (cooperativasRes.data ?? [])
    .map((c) => ({
      cooperativa_id: c.id,
      nombre: c.nombre,
      total_transacciones: counts[c.id] ?? 0,
    }))
    .sort((a, b) => b.total_transacciones - a.total_transacciones)
    .slice(0, 5);
}

export async function fetchRutasPopulares(): Promise<RutaPopular[]> {
  const supabase = await createClient();
  const startUTC = inicioHaceDiasVE(30);

  const { data: encomiendas, error } = await supabase
    .from("encomiendas")
    .select("ciudad_origen, ciudad_destino")
    .gte("created_at", startUTC)
    .limit(10000);

  if (error) console.error("[fetchRutasPopulares]:", error);

  const routeCounts: Record<string, number> = {};
  encomiendas?.forEach((item) => {
    if (item.ciudad_origen && item.ciudad_destino) {
      const capitalize = (s: string) => s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase();
      const routeName = `${capitalize(item.ciudad_origen)} → ${capitalize(item.ciudad_destino)}`;
      routeCounts[routeName] = (routeCounts[routeName] ?? 0) + 1;
    }
  });

  return Object.entries(routeCounts)
    .map(([ruta_nombre, total]) => ({ ruta_nombre, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

export async function fetchIncidenciasRecientes(): Promise<IncidenciaReciente[]> {
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
  const supabase = await createClient();

  // Only fetch unpaid cycles — avoids loading full historical data
  const { data, error } = await supabase
    .from("cooperativas")
    .select(`
      id,
      nombre,
      comision_porcentaje,
      comisiones_ciclo(monto_comision, pagado)
    `);

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
      const monto_pendiente = unpaidCycles.reduce((sum, cc) => sum + Number(cc.monto_comision), 0);
      return {
        cooperativa_id: c.id,
        nombre: c.nombre,
        comision_porcentaje: Number(c.comision_porcentaje),
        monto_pendiente,
        ciclos_impagos: unpaidCycles.length,
      };
    })
    .sort((a, b) => b.monto_pendiente - a.monto_pendiente);
}
