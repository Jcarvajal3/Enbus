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
import { formatIngresos } from "@/lib/types/admin-dashboard";
import { esTasaDesactualizada } from "@/lib/types/pagos";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { hoyVE } from "@/lib/fechas";
import { KPICard } from "@/components/admin/dashboard/kpi-card";
import { DashboardCharts } from "@/components/admin/dashboard/dashboard-charts";
import { IncidenciasRecientesTable } from "@/components/admin/dashboard/incidencias-recientes-table";
import { CooperativasBalanceTable } from "@/components/admin/dashboard/cooperativas-balance-table";
import { TasaBCVCard } from "@/components/admin/dashboard/tasa-bcv-card";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // La tasa se lee primero: los KPIs la usan para convertir a Bs los pagos antiguos.
  const tasa = await obtenerTasaBCV();

  const [
    kpis,
    activityData,
    topCooperativas,
    rutasPopulares,
    incidencias,
    cooperativasBalance,
  ] = await Promise.all([
    fetchDashboardKPIs(tasa?.tasa ?? null),
    fetchActivityLast30Days(),
    fetchTop5Cooperativas(),
    fetchRutasPopulares(),
    fetchIncidenciasRecientes(),
    fetchCooperativasConBalance(),
  ]);

  const ingresos = formatIngresos(kpis.ingresos_hoy);
  const comisiones = formatIngresos(kpis.comisiones_hoy);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Resumen"
        description="Actividad y finanzas de EnBus hoy (hora de Venezuela)."
      />

      {/* Tasa BCV: arriba solo si hace falta atenderla (sin tasa o desactualizada). */}
      {esTasaDesactualizada(tasa) && <TasaBCVCard tasa={tasa} hoy={hoyVE()} variante="resumen" />}

      {/* Grid of KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <KPICard
          title="Encomiendas hoy"
          value={kpis.encomiendas_hoy}
          icon={Package}
          description="Registradas hoy"
        />
        <KPICard
          title="Boletos hoy"
          value={kpis.boletos_hoy}
          icon={Ticket}
          description="Pagados hoy"
        />
        <KPICard
          title="Ingresos brutos"
          value={ingresos.principal}
          detail={ingresos.secundario}
          icon={CurrencyDollar}
          description="Pagos aprobados hoy"
        />
        <KPICard
          title="Comisiones estimadas"
          value={comisiones.principal}
          detail={comisiones.secundario}
          icon={Receipt}
          description="Estimadas hoy"
        />
        <KPICard
          title="Cooperativas activas"
          value={kpis.cooperativas_activas}
          icon={Buildings}
          description="Total activas"
        />
        <KPICard
          title="Solicitudes"
          value={kpis.solicitudes_pendientes}
          icon={ClipboardText}
          variant={kpis.solicitudes_pendientes > 0 ? "warning" : "default"}
          description="En revisión"
        />
        <KPICard
          title="Más de 72 h en tránsito"
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
        <CooperativasBalanceTable data={cooperativasBalance} tasa={tasa} />
      </div>

      {/* Tasa BCV al día: al final, como referencia. */}
      {!esTasaDesactualizada(tasa) && <TasaBCVCard tasa={tasa} hoy={hoyVE()} variante="resumen" />}
    </div>
  );
}
