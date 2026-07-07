import { createClient } from "@/lib/supabase/server";
import {
  DashboardKPIs,
  DailyActivity,
  TopCooperativa,
  RutaPopular,
  IncidenciaReciente,
  CooperativaBalance,
} from "../types/admin-dashboard";

// Helper to get day range in Venezuela timezone (UTC-4)
function getVenezuelaDayRange(date: Date) {
  const tzOffset = -4 * 60; // Venezuela is UTC-4

  // Convert current time to Venezuela time
  const veTime = new Date(date.getTime() + (date.getTimezoneOffset() + tzOffset) * 60000);

  const startOfDay = new Date(veTime);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(veTime);
  endOfDay.setHours(23, 59, 59, 999);

  // Convert back to UTC for database queries
  const startUTC = new Date(startOfDay.getTime() - (date.getTimezoneOffset() + tzOffset) * 60000);
  const endUTC = new Date(endOfDay.getTime() - (date.getTimezoneOffset() + tzOffset) * 60000);

  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

export async function fetchDashboardKPIs(): Promise<DashboardKPIs> {
  const supabase = await createClient();
  const now = new Date();
  const { start: hoyInicio, end: hoyFin } = getVenezuelaDayRange(now);

  const [
    encomiendasRes,
    boletosRes,
    pagosRes,
    pagosComisionesRes,
    cooperativasRes,
    alertasRes,
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

    // 3. Ingresos brutos hoy
    supabase
      .from("pagos")
      .select("monto")
      .eq("verificado", true)
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin),

    // 4. Para comisiones estimadas: traer monto + comisión de la cooperativa relacionada
    supabase
      .from("pagos")
      .select("monto, cooperativa:cooperativas!cooperativa_id(comision_porcentaje)")
      .eq("verificado", true)
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin),

    // 5. Cooperativas activas
    supabase
      .from("cooperativas")
      .select("id", { count: "exact", head: true })
      .eq("estado", "ACTIVA"),

    // 6. Alertas amarillas abiertas
    supabase
      .from("incidencias")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "ALERTA_AMARILLA")
      .eq("estado", "ABIERTA"),
  ]);

  // Log any Supabase errors without crashing the dashboard
  if (encomiendasRes.error) console.error("[fetchDashboardKPIs] encomiendas:", encomiendasRes.error.message);
  if (boletosRes.error) console.error("[fetchDashboardKPIs] boletos:", boletosRes.error.message);
  if (pagosRes.error) console.error("[fetchDashboardKPIs] pagos:", pagosRes.error.message);
  if (pagosComisionesRes.error) console.error("[fetchDashboardKPIs] pagosComisiones:", pagosComisionesRes.error.message);
  if (cooperativasRes.error) console.error("[fetchDashboardKPIs] cooperativas:", cooperativasRes.error.message);
  if (alertasRes.error) console.error("[fetchDashboardKPIs] alertas:", alertasRes.error.message);

  const encomiendas_hoy = encomiendasRes.count ?? 0;
  const boletos_hoy = boletosRes.count ?? 0;
  const ingresos_brutos_hoy = pagosRes.data?.reduce((sum, p) => sum + Number(p.monto), 0) ?? 0;

  // Each pago row has a nested cooperativa object with comision_porcentaje
  type PagoConCooperativa = { monto: number; cooperativa: { comision_porcentaje: number } | null };
  const comisiones_estimadas_hoy = (pagosComisionesRes.data as PagoConCooperativa[] | null)?.reduce((sum, p) => {
    const pct = p.cooperativa?.comision_porcentaje ?? 0;
    return sum + (Number(p.monto) * Number(pct)) / 100;
  }, 0) ?? 0;

  const cooperativas_activas = cooperativasRes.count ?? 0;
  const alertas_amarillas_abiertas = alertasRes.count ?? 0;

  return {
    encomiendas_hoy,
    boletos_hoy,
    ingresos_brutos_hoy,
    comisiones_estimadas_hoy,
    cooperativas_activas,
    alertas_amarillas_abiertas,
  };
}

export async function fetchActivityLast30Days(): Promise<DailyActivity[]> {
  const supabase = await createClient();
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { start: startUTC } = getVenezuelaDayRange(thirtyDaysAgo);

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

  if (encomiendasRes.error) console.error("[fetchActivityLast30Days] encomiendas:", encomiendasRes.error.message);
  if (boletosRes.error) console.error("[fetchActivityLast30Days] boletos:", boletosRes.error.message);

  const tzOffset = -4 * 60; // Venezuela is UTC-4
  const activityMap: Record<string, { fecha: string; encomiendas: number; boletos: number }> = {};

  // Initialize map with last 30 days (ensures all days appear even with 0 activity)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const veTime = new Date(d.getTime() + (d.getTimezoneOffset() + tzOffset) * 60000);
    const dateStr = veTime.toISOString().split("T")[0];
    activityMap[dateStr] = { fecha: dateStr, encomiendas: 0, boletos: 0 };
  }

  encomiendasRes.data?.forEach((item) => {
    const d = new Date(item.created_at);
    const veTime = new Date(d.getTime() + (d.getTimezoneOffset() + tzOffset) * 60000);
    const dateStr = veTime.toISOString().split("T")[0];
    if (activityMap[dateStr]) activityMap[dateStr].encomiendas++;
  });

  boletosRes.data?.forEach((item) => {
    const d = new Date(item.created_at);
    const veTime = new Date(d.getTime() + (d.getTimezoneOffset() + tzOffset) * 60000);
    const dateStr = veTime.toISOString().split("T")[0];
    if (activityMap[dateStr]) activityMap[dateStr].boletos++;
  });

  return Object.values(activityMap).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function fetchTop5Cooperativas(): Promise<TopCooperativa[]> {
  const supabase = await createClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { start: startUTC } = getVenezuelaDayRange(thirtyDaysAgo);

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

  if (cooperativasRes.error) console.error("[fetchTop5Cooperativas] cooperativas:", cooperativasRes.error.message);
  if (encomiendasRes.error) console.error("[fetchTop5Cooperativas] encomiendas:", encomiendasRes.error.message);
  if (boletosRes.error) console.error("[fetchTop5Cooperativas] boletos:", boletosRes.error.message);

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
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { start: startUTC } = getVenezuelaDayRange(thirtyDaysAgo);

  const { data: encomiendas, error } = await supabase
    .from("encomiendas")
    .select("ciudad_origen, ciudad_destino")
    .gte("created_at", startUTC)
    .limit(10000);

  if (error) console.error("[fetchRutasPopulares]:", error.message);

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

  if (error) console.error("[fetchIncidenciasRecientes]:", error.message);

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

  if (error) console.error("[fetchCooperativasConBalance]:", error.message);

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
