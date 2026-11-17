import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { formatFechaVE, hoyVE, rangoDiaVE, sumarDiasVE } from "@/lib/fechas";
import { resumirIngresos } from "@/lib/types/admin-dashboard";
import { formatMoney } from "@/lib/dinero";
import type { ChecklistCooperativa } from "@/components/checklist-puesta-en-marcha";
import { cargarBandeja } from "./actions";
import { ResumenVista, type EncomiendaReciente } from "./resumen-vista";

const SELECT_RECIENTES =
  "id, tracking_id, receiver_nombre, estado, created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino, origen_registro, remitente_nombre, sender:profiles!sender_id(nombre_completo)";
// Respaldo mientras la base no tenga las columnas de la fase 3 (migración 20260720000002).
const SELECT_RECIENTES_BASICO =
  "id, tracking_id, receiver_nombre, estado, created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino, sender:profiles!sender_id(nombre_completo)";

export default async function DashboardPage() {
  // getUserProfile() y obtenerTasaBCV() usan React cache(): el layout ya los
  // pidió, así que aquí se resuelven sin otra consulta.
  const [user, tasa] = await Promise.all([getUserProfile(), obtenerTasaBCV()]);
  if (!user) return null;

  const supabase = await createClient();
  const cooperativaId = user.cooperativa_id;
  const userRole = user.role;
  const esAdmin = userRole === "admin_cooperativa";
  // Día de hoy en Venezuela (UTC-4), sin depender de la zona horaria del servidor.
  const hoy = hoyVE();
  const { desde: hoyInicio, hasta: hoyFin } = rangoDiaVE(hoy);

  const cargarRecientes = async () => {
    const consulta = (select: string) =>
      supabase
        .from("encomiendas")
        .select(select)
        .eq("cooperativa_id", cooperativaId)
        .order("created_at", { ascending: false })
        .limit(20);
    const res = await consulta(SELECT_RECIENTES);
    // 42703 = columna inexistente: la migración de la fase 3 aún no se aplicó.
    return res.error?.code === "42703" ? consulta(SELECT_RECIENTES_BASICO) : res;
  };

  const leerPagosDelDia = async () => {
    const PAGINA = 1000;
    const MAX_PAGINAS = 50;
    const filas: { monto: number | string | null; monto_bs: number | string | null }[] = [];
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const { data, error } = await supabase
        .from("pagos")
        .select("id, monto, monto_bs")
        .eq("cooperativa_id", cooperativaId)
        .eq("verificado", true)
        .gte("verificado_at", hoyInicio)
        .lte("verificado_at", hoyFin)
        .order("id", { ascending: true })
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
      if (error) return { data: null, error };
      filas.push(...(data ?? []));
      if ((data ?? []).length < PAGINA) break;
    }
    return { data: filas, error: null };
  };

  // ── Todas las consultas en paralelo ────────────────────────────────────
  const [
    kpiRecibidas,
    kpiDespachadas,
    kpiBoletos,
    kpiPagos,
    recentData,
    adminData,
    checklistRes,
    bandeja,
  ] = await Promise.all([
    // KPI 1 — Encomiendas recibidas hoy
    supabase
      .from("encomiendas")
      .select("id", { count: "exact", head: true })
      .eq("cooperativa_id", cooperativaId)
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin)
      .not("estado", "eq", "PENDIENTE_DE_ESCANEO"),

    // KPI 2 — Encomiendas despachadas hoy
    supabase
      .from("encomienda_estado_historial")
      .select("id, encomiendas!inner(cooperativa_id)", { count: "exact", head: true })
      .eq("estado_nuevo", "EN_TRANSITO")
      .eq("encomiendas.cooperativa_id", cooperativaId)
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin),

    // KPI 3 — Boletos vendidos hoy
    supabase
      .from("boletos")
      .select("id", { count: "exact", head: true })
      .eq("cooperativa_id", cooperativaId)
      // Un boleto embarcado pasa a USADO: sigue siendo una venta del día.
      .in("estado", ["PAGADO", "USADO"])
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin),

    // KPI 4 — Ingresos del día: pagos verificados HOY (por verificado_at, no por la fecha
    // en que el cliente los registró), en USD de referencia y Bs a la tasa de cada pago.
    // PostgREST devuelve como máximo 1000 filas por consulta: se lee por páginas para
    // que un día con más de 1000 pagos no muestre un total recortado sin avisar.
    leerPagosDelDia(),

    // Encomiendas recientes
    cargarRecientes(),

    // Solo administrador: gráfico de actividad (comisiones ocultas temporalmente en el resumen)
    esAdmin
      ? Promise.all(
          Array.from({ length: 7 })
            .map((_, i) => sumarDiasVE(hoy, -(6 - i)))
            .map(async (dia) => {
              const { desde: start, hasta: end } = rangoDiaVE(dia);
              const [encRes, bolRes] = await Promise.all([
                supabase
                  .from("encomiendas")
                  .select("id", { count: "exact", head: true })
                  .eq("cooperativa_id", cooperativaId)
                  .gte("created_at", start)
                  .lte("created_at", end),
                supabase
                  .from("boletos")
                  .select("id", { count: "exact", head: true })
                  .eq("cooperativa_id", cooperativaId)
                  .in("estado", ["PAGADO", "USADO"])
                  .gte("created_at", start)
                  .lte("created_at", end),
              ]);
              return {
                date: formatFechaVE(dia, { day: "2-digit", month: "2-digit" }),
                encomiendas: encRes.count || 0,
                boletos: bolRes.count || 0,
              };
            })
        )
      : Promise.resolve(null),

    // Puesta en marcha (solo administrador)
    esAdmin ? supabase.rpc("fn_checklist_cooperativa") : Promise.resolve(null),

    // "Requiere tu atención" (#51): conteos de lo pendiente en una sola RPC
    cargarBandeja(),
  ]);

  if (kpiPagos.error) console.error("[DashboardPage] pagos:", kpiPagos.error);
  if (recentData.error) console.error("[DashboardPage] encomiendas recientes:", recentData.error);
  // Sin la migración de la fase 3 la RPC no existe: la tarjeta simplemente no se muestra.
  if (checklistRes?.error) console.error("[DashboardPage] checklist:", checklistRes.error);
  const checklist = (checklistRes && !checklistRes.error ? checklistRes.data : null) as ChecklistCooperativa | null;

  const kpi = (r: { count: number | null; error: unknown }) => (r.error ? "—" : String(r.count ?? 0));
  // Σ coalesce(monto_bs, monto × tasa de hoy) en Bs; cada pago a su propia tasa (sin la de hoy como referencia).
  const ingresos = resumirIngresos(kpiPagos.data, tasa?.tasa ?? null);

  return (
    <ResumenVista
      esAdmin={esAdmin}
      checklist={checklist}
      bandeja={bandeja}
      kpis={{ recibidas: kpi(kpiRecibidas), despachadas: kpi(kpiDespachadas), boletos: kpi(kpiBoletos) }}
      ingresos={kpiPagos.error ? null : formatMoney({ usd: ingresos.usd, bs: ingresos.bs, tasa: null })}
      // Un KPI que falla muestra "—" y un solo aviso encima de la fila (PU-14), nunca un 0 engañoso.
      kpisConError={[kpiRecibidas, kpiDespachadas, kpiBoletos, kpiPagos].some((r) => r.error)}
      chartData={adminData ?? []}
      encomiendasRecientes={(recentData.data ?? []) as unknown as EncomiendaReciente[]}
      recientesError={Boolean(recentData.error)}
    />
  );
}
