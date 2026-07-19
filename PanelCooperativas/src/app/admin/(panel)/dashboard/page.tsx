import { PageHeader } from "@/components/page-header";
import { Package, Ticket, CurrencyDollar, Receipt, Buildings, Warning, ClipboardText } from "@phosphor-icons/react/dist/ssr";
import { formatCurrency } from "@/lib/utils";
import {
  fetchDashboardKPIs,
  fetchActivityLast30Days,
  fetchTop5Cooperativas,
  fetchRutasPopulares,
  fetchIncidenciasRecientes,
  fetchCooperativasConBalance,
} from "@/lib/data/admin-dashboard";
import { KPICard } from "@/components/admin/dashboard/kpi-card";
import { DashboardCharts } from "@/components/admin/dashboard/dashboard-charts";
import { IncidenciasRecientesTable } from "@/components/admin/dashboard/incidencias-recientes-table";
import { CooperativasBalanceTable } from "@/components/admin/dashboard/cooperativas-balance-table";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [
    kpis,
    activityData,
    topCooperativas,
    rutasPopulares,
    incidencias,
    cooperativasBalance,
  ] = await Promise.all([
    fetchDashboardKPIs(),
    fetchActivityLast30Days(),
    fetchTop5Cooperativas(),
    fetchRutasPopulares(),
    fetchIncidenciasRecientes(),
    fetchCooperativasConBalance(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel de Control"
        description="Resumen global de actividad y finanzas de EnBus"
      />

      {/* Grid of KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <KPICard
          title="Encomiendas Hoy"
          value={kpis.encomiendas_hoy}
          icon={Package}
          description="Registradas hoy"
        />
        <KPICard
          title="Boletos Hoy"
          value={kpis.boletos_hoy}
          icon={Ticket}
          description="Pagados hoy"
        />
        <KPICard
          title="Ingresos Brutos"
          value={formatCurrency(kpis.ingresos_brutos_hoy)}
          icon={CurrencyDollar}
          description="Verificados hoy"
        />
        <KPICard
          title="Comisiones Est."
          value={formatCurrency(kpis.comisiones_estimadas_hoy)}
          icon={Receipt}
          description="Estimadas hoy"
        />
        <KPICard
          title="Cooperativas Activas"
          value={kpis.cooperativas_activas}
          icon={Buildings}
          description="Total activas"
        />
        <KPICard
          title="Solicitudes Reg."
          value={kpis.solicitudes_pendientes}
          icon={ClipboardText}
          variant={kpis.solicitudes_pendientes > 0 ? "warning" : "default"}
          description="Pendientes"
        />
        <KPICard
          title="Alertas Amarillas"
          value={kpis.alertas_amarillas_abiertas}
          icon={Warning}
          variant={kpis.alertas_amarillas_abiertas > 0 ? "warning" : "default"}
          description="Sin resolver"
        />
      </div>

      {/* Charts — Client boundary, lazy-loaded with ssr:false for Recharts compat */}
      <DashboardCharts
        activityData={activityData}
        topCooperativas={topCooperativas}
        rutasPopulares={rutasPopulares}
      />

      {/* Incidencias & Balance Tables — plain RSC, no client deps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IncidenciasRecientesTable data={incidencias} />
        <CooperativasBalanceTable data={cooperativasBalance} />
      </div>
    </div>
  );
}
