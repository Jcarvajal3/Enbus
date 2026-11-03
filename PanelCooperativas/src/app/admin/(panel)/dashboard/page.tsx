import { PageHeader } from "@/components/page-header";
import { Package, Ticket, CurrencyDollar, Receipt, Buildings, Warning, ClipboardText } from "@phosphor-icons/react/dist/ssr";
import {
  fetchDashboardKPIs,
  fetchActivityLast30Days,
  fetchTop5Cooperativas,
  fetchRutasPopulares,
  fetchIncidenciasRecientes,
  fetchCooperativasConBalance,
} from "@/lib/data/admin-dashboard";
import { calcularDelta, formatIngresos, type IngresosResumen } from "@/lib/types/admin-dashboard";
import { formatNumeroVE } from "@/lib/dinero";
import { Monto } from "@/components/monto";
import { KpiCard } from "@/components/kpi-card";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { ErrorRefrescar } from "@/components/admin/error-refrescar";
import { DashboardCharts } from "@/components/admin/dashboard/dashboard-charts";
import { IncidenciasRecientesTable } from "@/components/admin/dashboard/incidencias-recientes-table";
import { CooperativasBalanceTable } from "@/components/admin/dashboard/cooperativas-balance-table";

export const dynamic = "force-dynamic";

// El ErrorState de una tarjeta de KPI se apila (la columna es angosta) y ocupa su alto.
const ERROR_KPI = "h-full sm:flex-col sm:items-start sm:justify-between";

export default async function AdminDashboardPage() {
  // La tasa se lee primero: los KPIs la usan para convertir a Bs los pagos antiguos.
  const tasa = await obtenerTasaBCV();

  const [kpis, activityData, topCooperativas, rutasPopulares, incidencias, cooperativasBalance] = await Promise.all([
    fetchDashboardKPIs(tasa?.tasa ?? null),
    fetchActivityLast30Days(),
    fetchTop5Cooperativas(),
    fetchRutasPopulares(),
    fetchIncidenciasRecientes(),
    fetchCooperativasConBalance(),
  ]);

  const ingresos = formatIngresos(kpis.ingresos_hoy);
  const comisiones = formatIngresos(kpis.comisiones_hoy);
  // El delta de los montos compara el USD de referencia (no depende de la tasa de cada día).
  const deltaIngresos =
    kpis.ingresos_hoy.error || kpis.ayer.ingresos.error ? null : calcularDelta(kpis.ingresos_hoy.usd, kpis.ayer.ingresos.usd);
  const deltaComisiones =
    kpis.comisiones_hoy.error || kpis.ayer.comisiones.error
      ? null
      : calcularDelta(kpis.comisiones_hoy.usd, kpis.ayer.comisiones.usd);

  const solicitudes = kpis.solicitudes_pendientes;
  const alertas = kpis.alertas_amarillas_abiertas;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Resumen" description="Actividad y finanzas de EnBus hoy (hora de Venezuela)." />

      {/* Banda 1: Finanzas de hoy (montos en Bs con su referencia en USD). */}
      <section aria-labelledby="finanzas-hoy" className="flex flex-col gap-3">
        <h2 id="finanzas-hoy" className="text-lg font-semibold">
          Finanzas de hoy
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <KpiCard
            grande
            title="Ingresos brutos"
            value={<MontoKPI resumen={kpis.ingresos_hoy} texto={ingresos} />}
            detail={kpis.ingresos_hoy.error ? ingresos.secundario : kpis.ingresos_hoy.pagos > 0 ? "A la tasa de cada pago" : null}
            delta={deltaIngresos}
            icon={CurrencyDollar}
            description="Pagos aprobados hoy"
          />
          <KpiCard
            grande
            title="Comisiones estimadas"
            value={<MontoKPI resumen={kpis.comisiones_hoy} texto={comisiones} />}
            detail={kpis.comisiones_hoy.error ? comisiones.secundario : null}
            delta={deltaComisiones}
            icon={Receipt}
            description="Parte de EnBus en los pagos de hoy"
          />
        </div>
      </section>

      {/* Banda 2: Operación de hoy. Boletos antes que Encomiendas (D2). */}
      <section aria-labelledby="operacion-hoy" className="flex flex-col gap-3">
        <h2 id="operacion-hoy" className="text-lg font-semibold">
          Operación de hoy
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {kpis.error_boletos ? (
            <ErrorRefrescar titulo="No pudimos contar los boletos" className={ERROR_KPI} />
          ) : (
            <KpiCard
              title="Boletos"
              value={formatNumeroVE(kpis.boletos_hoy, 0)}
              delta={calcularDelta(kpis.boletos_hoy, kpis.ayer.boletos)}
              icon={Ticket}
              description="Pagados hoy"
            />
          )}
          {kpis.error_encomiendas ? (
            <ErrorRefrescar titulo="No pudimos contar las encomiendas" className={ERROR_KPI} />
          ) : (
            <KpiCard
              title="Encomiendas"
              value={formatNumeroVE(kpis.encomiendas_hoy, 0)}
              delta={calcularDelta(kpis.encomiendas_hoy, kpis.ayer.encomiendas)}
              icon={Package}
              description="Registradas hoy"
            />
          )}
          <KpiCard
            title="Cooperativas activas"
            value={kpis.error_cooperativas ? "—" : formatNumeroVE(kpis.cooperativas_activas, 0)}
            icon={Buildings}
            description="Pueden vender y recibir encomiendas"
            href="/admin/cooperativas?estado=ACTIVA"
            accion="Ver"
          />
          <KpiCard
            title="Solicitudes por revisar"
            value={kpis.error_solicitudes ? "—" : formatNumeroVE(solicitudes, 0)}
            icon={ClipboardText}
            variant={solicitudes > 0 ? "warning" : "default"}
            description={solicitudes > 0 ? "Esperan tu respuesta" : "Ninguna en espera"}
            href="/admin/solicitudes"
            accion={solicitudes > 0 ? "Revisar" : "Ver"}
          />
          <KpiCard
            title="Más de 72 h en tránsito"
            value={kpis.error_alertas ? "—" : formatNumeroVE(alertas, 0)}
            icon={Warning}
            variant={alertas > 0 ? "warning" : "default"}
            description="Encomiendas sin resolver"
            href="/admin/incidencias?tipo=ALERTA_AMARILLA"
            accion={alertas > 0 ? "Revisar" : "Ver"}
          />
        </div>
      </section>

      <DashboardCharts activityData={activityData} topCooperativas={topCooperativas} rutasPopulares={rutasPopulares} />

      {/* Dos tablas lado a lado solo con ancho de sobra: a 1024–1440 se cortaban columnas. */}
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <IncidenciasRecientesTable data={incidencias} />
        <CooperativasBalanceTable data={cooperativasBalance} tasa={tasa} />
      </div>
    </div>
  );
}

/** Monto de un KPI: Bs con su referencia en USD (`<Monto>`), o "—" si la consulta falló. */
function MontoKPI({ resumen, texto }: { resumen: IngresosResumen; texto: { principal: string } }) {
  if (resumen.error) return <>{texto.principal}</>;
  // Bs sumados a la tasa de cada pago: sin el sufijo "BCV dd/mm" (no hay una sola tasa).
  return <Monto usd={resumen.usd} bs={resumen.bs} tasa={null} size="lg" />;
}
