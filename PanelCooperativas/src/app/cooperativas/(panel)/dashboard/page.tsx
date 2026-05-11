import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { formatCurrency, dateFormatterDayMonth, dateFormatterShort } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TruckTrailer, Ticket, CurrencyDollar } from "@phosphor-icons/react/dist/ssr";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

// Lazy-load recharts-based chart — ~280KB saved from initial bundle
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

function getVenezuelaDayRange(date: Date) {
  const tzOffset = -4 * 60; // Venezuela is UTC-4

  // Convert current time to Venezuela time
  const veTime = new Date(date.getTime() + (date.getTimezoneOffset() + tzOffset) * 60000);

  // Set to start of day (00:00:00)
  const startOfDay = new Date(veTime);
  startOfDay.setHours(0, 0, 0, 0);

  // Set to end of day (23:59:59.999)
  const endOfDay = new Date(veTime);
  endOfDay.setHours(23, 59, 59, 999);

  // Convert back to UTC for database queries
  const startUTC = new Date(startOfDay.getTime() - (date.getTimezoneOffset() + tzOffset) * 60000);
  const endUTC = new Date(endOfDay.getTime() - (date.getTimezoneOffset() + tzOffset) * 60000);

  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

export default async function DashboardPage() {
  // getUserProfile() is cached via React cache() — the layout already fetched it,
  // so this resolves instantly (0ms, no network call)
  const user = await getUserProfile();
  if (!user) return null;

  const supabase = await createClient();
  const cooperativaId = user.cooperativa_id;
  const userRole = user.role;
  const now = new Date();
  const { start: hoyInicio, end: hoyFin } = getVenezuelaDayRange(now);

  // ── Todas las queries en paralelo ──────────────────────────────────────
  const [
    kpiRecibidas,
    kpiDespachadas,
    kpiBoletos,
    kpiPagos,
    recentData,
    adminData,
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

    // KPI 4 — Ingresos del día
    supabase
      .from("pagos")
      .select("monto")
      .eq("cooperativa_id", cooperativaId)
      .eq("verificado", true)
      .gte("created_at", hoyInicio)
      .lte("created_at", hoyFin),

    // Encomiendas Recientes
    supabase
      .from("encomiendas")
      .select("tracking_id, receiver_nombre, estado, created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino, sender:profiles!sender_id(nombre_completo)")
      .eq("cooperativa_id", cooperativaId)
      .order("created_at", { ascending: false })
      .limit(20),

    // Admin-only data: chart + comisiones (en paralelo entre sí)
    userRole === "admin_cooperativa"
      ? (async () => {
        const last7Days = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - (6 - i));
          return d;
        });

        const [chartResults, comisionesResult] = await Promise.all([
          // 7 days of chart data — all 14 queries fire in parallel
          Promise.all(
            last7Days.map(async (date) => {
              const { start, end } = getVenezuelaDayRange(date);
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
                date: dateFormatterDayMonth.format(date),
                encomiendas: encRes.count || 0,
                boletos: bolRes.count || 0,
              };
            })
          ),
          // Comisiones pendientes
          supabase
            .from("comisiones_ciclo")
            .select("monto_comision, periodo_inicio, periodo_fin, pagado")
            .eq("cooperativa_id", cooperativaId)
            .eq("pagado", false)
            .order("periodo_inicio", { ascending: false })
            .limit(1),
        ]);

        return { chartData: chartResults, comisiones: comisionesResult.data };
      })()
      : Promise.resolve(null),
  ]);

  const encomiendasRecibidas = kpiRecibidas.count;
  const encomiendasDespachadas = kpiDespachadas.count;
  const boletosVendidos = kpiBoletos.count;
  const ingresos = kpiPagos.data?.reduce((sum, p) => sum + Number(p.monto), 0) || 0;
  const encomiendasRecientes = recentData.data;
  const chartData = adminData?.chartData ?? [];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const comisionPendiente: any = adminData?.comisiones?.[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Resumen de actividad de hoy" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encomiendas Recibidas</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" weight="regular" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{encomiendasRecibidas || 0}</div>
            <p className="text-xs text-muted-foreground">Hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encomiendas Despachadas</CardTitle>
            <TruckTrailer className="h-4 w-4 text-muted-foreground" weight="regular" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{encomiendasDespachadas || 0}</div>
            <p className="text-xs text-muted-foreground">Hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Boletos Vendidos</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" weight="regular" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{boletosVendidos || 0}</div>
            <p className="text-xs text-muted-foreground">Hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos del Día</CardTitle>
            <CurrencyDollar className="h-4 w-4 text-muted-foreground" weight="regular" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(ingresos)}</div>
            <p className="text-xs text-muted-foreground">Hoy</p>
          </CardContent>
        </Card>
      </div>

      {userRole === "admin_cooperativa" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ActivityChart data={chartData} />

          <Card className="col-span-1 flex flex-col justify-center">
            <CardHeader>
              <CardTitle>Comisiones Pendientes</CardTitle>
            </CardHeader>
            <CardContent>
              {comisionPendiente ? (
                <>
                  <div className="text-3xl font-bold text-destructive">
                    {formatCurrency(Number(comisionPendiente.monto_comision))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Periodo: {dateFormatterShort.format(new Date(comisionPendiente.periodo_inicio))} — {dateFormatterShort.format(new Date(comisionPendiente.periodo_fin))}
                  </p>
                </>
              ) : (
                <div className="flex items-center text-emerald-500 font-medium gap-2">
                  <span>Sin comisiones pendientes ✓</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Encomiendas Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking ID</TableHead>
                  <TableHead>Remitente</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {encomiendasRecientes && encomiendasRecientes.length > 0 ? (
                  encomiendasRecientes.map((enc) => (
                    <TableRow key={enc.tracking_id}>
                      <TableCell className="font-medium">{enc.tracking_id}</TableCell>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <TableCell>{(enc.sender as any)?.nombre_completo || "N/A"}</TableCell>
                      <TableCell>{enc.receiver_nombre}</TableCell>
                      <TableCell>
                        <span className="capitalize">{enc.ciudad_origen?.toLowerCase()}</span> → <span className="capitalize">{enc.ciudad_destino?.toLowerCase()}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={enc.estado} />
                      </TableCell>
                      <TableCell>
                        {dateFormatterShort.format(new Date(enc.created_at))}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No hay encomiendas recientes.
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
