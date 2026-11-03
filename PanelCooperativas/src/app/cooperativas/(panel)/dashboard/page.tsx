import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { formatFechaHoraVE, formatFechaVE, hoyVE, rangoDiaVE, sumarDiasVE } from "@/lib/fechas";
import { formatIngresos, resumirIngresos } from "@/lib/types/admin-dashboard";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TruckTrailer, Ticket, CurrencyDollar, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import { ChecklistPuestaEnMarcha, type ChecklistCooperativa } from "@/components/checklist-puesta-en-marcha";
import dynamic from "next/dynamic";
import { formatCiudad } from "@/lib/ciudades";

// Gráfico con recharts cargado aparte (~280 KB menos en la carga inicial)
const ActivityChart = dynamic(
  () => import("@/components/activity-chart").then((m) => ({ default: m.ActivityChart })),
  {
    loading: () => (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle>Actividad</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    ),
  }
);

const SELECT_RECIENTES =
  "tracking_id, receiver_nombre, estado, created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino, origen_registro, remitente_nombre, sender:profiles!sender_id(nombre_completo)";
// Respaldo mientras la base no tenga las columnas de la fase 3 (migración 20260720000002).
const SELECT_RECIENTES_BASICO =
  "tracking_id, receiver_nombre, estado, created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino, sender:profiles!sender_id(nombre_completo)";

type EncomiendaReciente = {
  tracking_id: string;
  receiver_nombre: string | null;
  estado: string;
  created_at: string;
  ciudad_origen: string | null;
  ciudad_destino: string | null;
  origen_registro?: string | null;
  remitente_nombre?: string | null;
  sender: unknown;
};

/** Columna DATE 'YYYY-MM-DD' → "dd/mm/aaaa", sin convertir de zona horaria (no se desplaza un día). */
function formatDia(fecha: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Quién envía: en el alta presencial `sender_id` es el empleado; el remitente real está en `remitente_nombre`. */
function nombreRemitente(enc: EncomiendaReciente) {
  if (enc.origen_registro === "TAQUILLA" && enc.remitente_nombre) return enc.remitente_nombre;
  const embed = enc.sender;
  const sender = (Array.isArray(embed) ? embed[0] : embed) as { nombre_completo?: string | null } | null;
  return enc.remitente_nombre || sender?.nombre_completo || "Sin nombre";
}

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

  // ── Todas las consultas en paralelo ────────────────────────────────────
  const [
    kpiRecibidas,
    kpiDespachadas,
    kpiBoletos,
    kpiPagos,
    recentData,
    adminData,
    checklistRes,
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
      .eq("estado", "PAGADO")
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin),

    // KPI 4 — Ingresos del día: pagos verificados HOY (por verificado_at, no por la fecha
    // en que el cliente los registró), en USD de referencia y Bs a la tasa de cada pago.
    supabase
      .from("pagos")
      .select("monto, monto_bs")
      .eq("cooperativa_id", cooperativaId)
      .eq("verificado", true)
      .gte("verificado_at", hoyInicio)
      .lte("verificado_at", hoyFin),

    // Encomiendas recientes
    cargarRecientes(),

    // Solo administrador: gráfico + comisiones (en paralelo entre sí)
    esAdmin
      ? (async () => {
        // Últimos 7 días de Venezuela, de más antiguo a hoy
        const last7Days = Array.from({ length: 7 }).map((_, i) => sumarDiasVE(hoy, -(6 - i)));

        const [chartResults, comisionesResult] = await Promise.all([
          Promise.all(
            last7Days.map(async (dia) => {
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
                  .eq("estado", "PAGADO")
                  .gte("created_at", start)
                  .lte("created_at", end),
              ]);
              return {
                date: formatFechaVE(dia, { day: "2-digit", month: "2-digit" }),
                encomiendas: encRes.count || 0,
                boletos: bolRes.count || 0,
              };
            })
          ),
          // Comisiones pendientes: todos los ciclos sin pagar (el admin de EnBus ve la misma suma)
          supabase
            .from("comisiones_ciclo")
            .select("monto_comision, periodo_inicio, periodo_fin, pagado")
            .eq("cooperativa_id", cooperativaId)
            .eq("pagado", false)
            .order("periodo_inicio", { ascending: true }),
        ]);

        return { chartData: chartResults, comisiones: comisionesResult.data, comisionesError: comisionesResult.error };
      })()
      : Promise.resolve(null),

    // Puesta en marcha (solo administrador)
    esAdmin ? supabase.rpc("fn_checklist_cooperativa") : Promise.resolve(null),
  ]);

  if (kpiPagos.error) console.error("[DashboardPage] pagos:", kpiPagos.error);
  if (recentData.error) console.error("[DashboardPage] encomiendas recientes:", recentData.error);
  if (adminData?.comisionesError) console.error("[DashboardPage] comisiones:", adminData.comisionesError);
  // Sin la migración de la fase 3 la RPC no existe: la tarjeta simplemente no se muestra.
  if (checklistRes?.error) console.error("[DashboardPage] checklist:", checklistRes.error);
  const checklist = (checklistRes && !checklistRes.error ? checklistRes.data : null) as ChecklistCooperativa | null;

  const kpi = (r: { count: number | null; error: unknown }) => (r.error ? "—" : String(r.count ?? 0));
  // Σ coalesce(monto_bs, monto × tasa de hoy) en Bs; los pagos sin monto_bs son anteriores a la fase 2.
  // Si la consulta falla, se muestra "—" y un aviso en vez de un 0 engañoso.
  const ingresos = formatIngresos({
    ...resumirIngresos(kpiPagos.data, tasa?.tasa ?? null),
    error: Boolean(kpiPagos.error),
  });
  const encomiendasRecientes = (recentData.data ?? []) as unknown as EncomiendaReciente[];
  const chartData = adminData?.chartData ?? [];
  const ciclosPendientes = (adminData?.comisiones ?? []) as {
    monto_comision: number | string;
    periodo_inicio: string;
    periodo_fin: string;
  }[];
  const comisionPendiente =
    ciclosPendientes.length > 0
      ? {
          total: ciclosPendientes.reduce((suma, c) => suma + Number(c.monto_comision ?? 0), 0),
          ciclos: ciclosPendientes.length,
          desde: ciclosPendientes[0].periodo_inicio,
          hasta: ciclosPendientes[ciclosPendientes.length - 1].periodo_fin,
        }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Resumen" description="Lo que pasó hoy en tu cooperativa." />

      {checklist && <ChecklistPuestaEnMarcha checklist={checklist} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encomiendas recibidas</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" weight="regular" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi(kpiRecibidas)}</div>
            <p className="text-xs text-muted-foreground">{kpiRecibidas.error ? "No pudimos cargar el dato. Recarga la página." : "Hoy"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encomiendas despachadas</CardTitle>
            <TruckTrailer className="h-4 w-4 text-muted-foreground" weight="regular" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi(kpiDespachadas)}</div>
            <p className="text-xs text-muted-foreground">{kpiDespachadas.error ? "No pudimos cargar el dato. Recarga la página." : "Hoy"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Boletos vendidos</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" weight="regular" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi(kpiBoletos)}</div>
            <p className="text-xs text-muted-foreground">{kpiBoletos.error ? "No pudimos cargar el dato. Recarga la página." : "Hoy"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos del día</CardTitle>
            <CurrencyDollar className="h-4 w-4 text-muted-foreground" weight="regular" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{ingresos.principal}</div>
            <p className="text-xs text-muted-foreground tabular-nums">{ingresos.secundario}</p>
            <p className="text-xs text-muted-foreground mt-1">Pagos verificados hoy</p>
          </CardContent>
        </Card>
      </div>

      {esAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ActivityChart data={chartData} />

          <Card className="col-span-1 flex flex-col justify-center">
            <CardHeader>
              <CardTitle>Comisiones pendientes</CardTitle>
            </CardHeader>
            <CardContent>
              {adminData?.comisionesError ? (
                <p className="text-sm text-muted-foreground">
                  No pudimos cargar tus comisiones. Recarga la página.
                </p>
              ) : comisionPendiente ? (
                <>
                  <Monto
                    usd={comisionPendiente.total}
                    tasa={tasa}
                    size="lg"
                    className="text-destructive-text"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    {comisionPendiente.ciclos === 1 ? "Período" : `${comisionPendiente.ciclos} ciclos sin pagar`}:{" "}
                    {formatDia(comisionPendiente.desde)} — {formatDia(comisionPendiente.hasta)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Se paga a EnBus en bolívares a la tasa BCV del día del pago.
                  </p>
                </>
              ) : (
                <p className="flex items-center gap-2 font-medium text-success-text">
                  <CheckCircle className="size-5" weight="fill" aria-hidden />
                  Sin comisiones pendientes
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Encomiendas recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código de seguimiento</TableHead>
                  <TableHead>Remitente</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentData.error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No pudimos cargar las encomiendas recientes. Recarga la página.
                    </TableCell>
                  </TableRow>
                ) : encomiendasRecientes.length > 0 ? (
                  encomiendasRecientes.map((enc) => (
                    <TableRow key={enc.tracking_id}>
                      <TableCell className="font-mono text-xs font-medium">{enc.tracking_id}</TableCell>
                      <TableCell>{nombreRemitente(enc)}</TableCell>
                      <TableCell>{enc.receiver_nombre}</TableCell>
                      <TableCell>
                        {formatCiudad(enc.ciudad_origen)} → {formatCiudad(enc.ciudad_destino)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={enc.estado} dominio="encomienda" />
                      </TableCell>
                      <TableCell>
                        {formatFechaHoraVE(enc.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Todavía no hay encomiendas. Cuando recibas la primera en taquilla, aparecerá aquí.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
