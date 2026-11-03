import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { formatFechaHoraCortaVE, formatFechaVE, hoyVE, rangoDiaVE, sumarDiasVE } from "@/lib/fechas";
import { resumirIngresos } from "@/lib/types/admin-dashboard";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Coins, WarningCircle, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import { KpiCard } from "@/components/kpi-card";
import { FilaVacia } from "@/components/fila-vacia";
import { formatMoney } from "@/lib/dinero";
import { ICONO_SECCION } from "@/lib/navigation";
import { ChecklistPuestaEnMarcha, type ChecklistCooperativa } from "@/components/checklist-puesta-en-marcha";
import dynamic from "next/dynamic";
import { formatCiudad } from "@/lib/ciudades";
import { telefonoWhatsApp } from "@/lib/ve";
import { CeldaEnlace } from "@/components/celda-enlace";
import { BandejaAtencion } from "./bandeja-atencion";
import { ErrorRecargable } from "./error-recargable";
import { cargarBandeja } from "./actions";

// Gráfico con recharts cargado aparte (~280 KB menos en la carga inicial)
const ActivityChart = dynamic(
  () => import("@/components/activity-chart").then((m) => ({ default: m.ActivityChart })),
  {
    loading: () => (
      <Card className="lg:col-span-2">
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
  "id, tracking_id, receiver_nombre, estado, created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino, origen_registro, remitente_nombre, sender:profiles!sender_id(nombre_completo)";
// Respaldo mientras la base no tenga las columnas de la fase 3 (migración 20260720000002).
const SELECT_RECIENTES_BASICO =
  "id, tracking_id, receiver_nombre, estado, created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino, sender:profiles!sender_id(nombre_completo)";

type EncomiendaReciente = {
  id: string;
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

/** WhatsApp de soporte de EnBus solo con dígitos (para wa.me), o null si no está configurado. */
function whatsappSoporte(): string | null {
  const crudo = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "";
  return telefonoWhatsApp(crudo) ?? (crudo.replace(/\D/g, "") || null);
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

    // "Requiere tu atención" (#51): conteos de lo pendiente en una sola RPC
    cargarBandeja(),
  ]);

  if (kpiPagos.error) console.error("[DashboardPage] pagos:", kpiPagos.error);
  if (recentData.error) console.error("[DashboardPage] encomiendas recientes:", recentData.error);
  if (adminData?.comisionesError) console.error("[DashboardPage] comisiones:", adminData.comisionesError);
  // Sin la migración de la fase 3 la RPC no existe: la tarjeta simplemente no se muestra.
  if (checklistRes?.error) console.error("[DashboardPage] checklist:", checklistRes.error);
  const checklist = (checklistRes && !checklistRes.error ? checklistRes.data : null) as ChecklistCooperativa | null;

  // Un KPI que falla muestra "—" y un solo aviso encima de la fila (PU-14), nunca un 0 engañoso.
  const kpi = (r: { count: number | null; error: unknown }) => (r.error ? "—" : String(r.count ?? 0));
  const kpisConError = [kpiRecibidas, kpiDespachadas, kpiBoletos, kpiPagos].some((r) => r.error);
  // Σ coalesce(monto_bs, monto × tasa de hoy) en Bs; cada pago a su propia tasa (sin la de hoy como referencia).
  const ingresos = resumirIngresos(kpiPagos.data, tasa?.tasa ?? null);
  const montoIngresos = formatMoney({ usd: ingresos.usd, bs: ingresos.bs, tasa: null });
  const soporte = whatsappSoporte();
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
      <PageHeader title="Resumen" />

      {checklist && <ChecklistPuestaEnMarcha checklist={checklist} />}

      <BandejaAtencion inicial={bandeja} />

      <section aria-labelledby="hoy-titulo" className="flex flex-col gap-3">
        <h2 id="hoy-titulo" className="text-lg font-semibold">
          Hoy
        </h2>
        {kpisConError && <ErrorRecargable titulo="No pudimos cargar algunos datos de hoy" />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Encomiendas recibidas" value={kpi(kpiRecibidas)} icon={ICONO_SECCION.taquillaEncomiendas} />
          <KpiCard title="Encomiendas despachadas" value={kpi(kpiDespachadas)} icon={ICONO_SECCION.despacho} />
          <KpiCard title="Boletos vendidos" value={kpi(kpiBoletos)} icon={ICONO_SECCION.taquillaBoletos} />
          <KpiCard
            title="Ingresos verificados"
            value={kpiPagos.error ? "—" : <span aria-label={montoIngresos.accesible}>{montoIngresos.principal}</span>}
            detail={kpiPagos.error ? null : montoIngresos.secundario}
            icon={Coins}
          />
        </div>
      </section>

      {esAdmin && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ActivityChart data={chartData} />

          <Card>
            <CardHeader>
              <CardTitle
                className={comisionPendiente && !adminData?.comisionesError ? "flex items-center gap-2 text-warning-text" : undefined}
              >
                {comisionPendiente && !adminData?.comisionesError && (
                  <WarningCircle className="size-5 shrink-0" weight="fill" aria-hidden />
                )}
                {comisionPendiente && !adminData?.comisionesError ? "Comisión pendiente con EnBus" : "Comisión con EnBus"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {adminData?.comisionesError ? (
                <ErrorRecargable titulo="No pudimos cargar tus comisiones" />
              ) : comisionPendiente ? (
                <>
                  <Monto usd={comisionPendiente.total} size="lg" />
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
                    {comisionPendiente.ciclos > 1 && (
                      <TonoBadge tono="pendiente">{`${comisionPendiente.ciclos} ciclos sin pagar`}</TonoBadge>
                    )}
                    <span>
                      {formatFechaVE(comisionPendiente.desde)} – {formatFechaVE(comisionPendiente.hasta)}
                    </span>
                  </div>
                  {soporte && (
                    <a
                      href={`https://wa.me/${soporte}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline"
                    >
                      <WhatsappLogo className="size-4" aria-hidden />
                      ¿Dudas para pagarla? Escríbenos
                    </a>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm font-medium text-success-text">
                  <CheckCircle className="size-5 shrink-0" weight="fill" aria-hidden />
                  Sin comisiones pendientes
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <section aria-labelledby="recientes-titulo" className="flex flex-col gap-3">
        <h2 id="recientes-titulo" className="text-lg font-semibold">
          Encomiendas recientes
        </h2>
        {recentData.error ? (
          <ErrorRecargable titulo="No pudimos cargar las encomiendas recientes" />
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead className="hidden lg:table-cell">Remitente</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead className="hidden lg:table-cell">Ruta</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {encomiendasRecientes.length > 0 ? (
                  encomiendasRecientes.map((enc) => (
                    <TableRow key={enc.id ?? enc.tracking_id} className="relative">
                      <CeldaEnlace
                        href={`/cooperativas/taquilla/encomiendas?encomienda=${encodeURIComponent(enc.id)}`}
                        etiqueta={`Ver encomienda ${enc.tracking_id}`}
                        className="font-mono text-sm text-foreground"
                      >
                        {enc.tracking_id}
                      </CeldaEnlace>
                      <TableCell className="hidden lg:table-cell">{nombreRemitente(enc)}</TableCell>
                      <TableCell>{enc.receiver_nombre}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {formatCiudad(enc.ciudad_origen)} → {formatCiudad(enc.ciudad_destino)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={enc.estado} dominio="encomienda" />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatFechaHoraCortaVE(enc.created_at)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <FilaVacia colSpan={6} icon={ICONO_SECCION.taquillaEncomiendas} titulo="Todavía no hay encomiendas" />
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
