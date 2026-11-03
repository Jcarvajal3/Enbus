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
  // El delta de los montos compara el USD de referencia (no depende de la tasa de cada día).
  const deltaIngresos = kpis.ingresos_hoy.error || kpis.ayer.ingresos.error
    ? null
    : calcularDelta(kpis.ingresos_hoy.usd, kpis.ayer.ingresos.usd);
  const deltaComisiones = kpis.comisiones_hoy.error || kpis.ayer.comisiones.error
    ? null
    : calcularDelta(kpis.comisiones_hoy.usd, kpis.ayer.comisiones.usd);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Resumen"
        description="Actividad y finanzas de EnBus hoy (hora de Venezuela)."
      />

      {/* Tasa BCV: arriba solo si hace falta atenderla (sin tasa o desactualizada). */}
      {esTasaDesactualizada(tasa) && <TasaBCVCard tasa={tasa} hoy={hoyVE()} variante="resumen" />}

      {/* Banda 1: Finanzas de hoy (tarjetas grandes, montos en Bs con su referencia en USD). */}
      <section aria-labelledby="finanzas-hoy" className="space-y-3">
        <h2 id="finanzas-hoy" className="text-lg font-semibold tracking-tight">Finanzas de hoy</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <KPICard
            grande
            title="Ingresos brutos"
            value={<MontoKPI resumen={kpis.ingresos_hoy} texto={ingresos} />}
            detail={kpis.ingresos_hoy.error ? ingresos.secundario : kpis.ingresos_hoy.pagos > 0 ? "A la tasa de cada pago" : null}
            delta={deltaIngresos}
            icon={CurrencyDollar}
            description="Pagos aprobados hoy"
          />
          <KPICard
            grande
            title="Comisiones estimadas"
            value={<MontoKPI resumen={kpis.comisiones_hoy} texto={comisiones} />}
            detail={kpis.comisiones_hoy.error ? comisiones.secundario : null}
            delta={deltaComisiones}
            icon={Receipt}
            description="Parte de EnBus en los pagos aprobados hoy"
          />
        </div>
      </section>

      {/* Banda 2: Operación de hoy. */}
      <section aria-labelledby="operacion-hoy" className="space-y-3">
        <h2 id="operacion-hoy" className="text-lg font-semibold tracking-tight">Operación de hoy</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KPICard
            title="Encomiendas"
            value={kpis.error_encomiendas ? "—" : formatNumeroVE(kpis.encomiendas_hoy, 0)}
            detail={kpis.error_encomiendas ? "No pudimos contarlas. Recarga la página." : null}
            delta={kpis.error_encomiendas ? null : calcularDelta(kpis.encomiendas_hoy, kpis.ayer.encomiendas)}
            icon={Package}
            description="Registradas hoy"
          />
          <KPICard
            title="Boletos"
            value={kpis.error_boletos ? "—" : formatNumeroVE(kpis.boletos_hoy, 0)}
            detail={kpis.error_boletos ? "No pudimos contarlos. Recarga la página." : null}
            delta={kpis.error_boletos ? null : calcularDelta(kpis.boletos_hoy, kpis.ayer.boletos)}
            icon={Ticket}
            description="Pagados hoy"
          />
          <KPICard
            title="Cooperativas activas"
            value={kpis.error_cooperativas ? "—" : formatNumeroVE(kpis.cooperativas_activas, 0)}
            icon={Buildings}
            description="Pueden vender y recibir encomiendas"
            href="/admin/cooperativas?estado=ACTIVA"
            accion="Ver cooperativas"
          />
          <KPICard
            title="Solicitudes por revisar"
            value={kpis.error_solicitudes ? "—" : formatNumeroVE(kpis.solicitudes_pendientes, 0)}
            icon={ClipboardText}
            variant={kpis.solicitudes_pendientes > 0 ? "warning" : "default"}
            description={kpis.solicitudes_pendientes > 0 ? "Cooperativas esperando tu respuesta" : "No hay solicitudes en espera"}
            href="/admin/solicitudes"
          />
          <KPICard
            title="Encomiendas con más de 72 h en tránsito"
            value={kpis.error_alertas ? "—" : formatNumeroVE(kpis.alertas_amarillas_abiertas, 0)}
            icon={Warning}
            variant={kpis.alertas_amarillas_abiertas > 0 ? "warning" : "default"}
            description={kpis.alertas_amarillas_abiertas > 0 ? "Sin resolver" : "Ninguna sin resolver"}
            href="/admin/incidencias?tipo=ALERTA_AMARILLA&estado=pendientes"
          />
        </div>
      </section>

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

/** Monto de un KPI: Bs con su referencia en USD (`<Monto>`), o "—" si la consulta falló. */
function MontoKPI({ resumen, texto }: { resumen: IngresosResumen; texto: { principal: string } }) {
  if (resumen.error) return <>{texto.principal}</>;
  // Bs sumados a la tasa de cada pago: sin el sufijo "BCV dd/mm" (no hay una sola tasa).
  return <Monto usd={resumen.usd} bs={resumen.bs} tasa={null} size="lg" />;
}
