// ─── Resumen: la vista (sin consultas) ──────────────────────────────────────
// La página reúne los datos en el servidor y esta vista los dibuja.

import dynamic from "next/dynamic";
import { Coins } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { SectionLabel } from "@/components/section-label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { ChecklistPuestaEnMarcha, type ChecklistCooperativa } from "@/components/checklist-puesta-en-marcha";
import type { MontoFormateado } from "@/lib/dinero";
import { ICONO_SECCION } from "@/lib/navigation";
import { BandejaAtencion } from "./bandeja-atencion";
import { EncomiendasRecientes } from "./encomiendas-recientes";
import { ErrorRecargable } from "./error-recargable";
import type { ResultadoBandeja } from "./actions";

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
          <Skeleton className="h-[240px] w-full md:h-[250px]" />
        </CardContent>
      </Card>
    ),
  }
);

export type EncomiendaReciente = {
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

export type DatosResumen = {
  esAdmin: boolean;
  checklist: ChecklistCooperativa | null;
  bandeja: ResultadoBandeja;
  /** "—" cuando el dato no se pudo cargar. */
  kpis: { recibidas: string; despachadas: string; boletos: string };
  /** null si la consulta de pagos falló. */
  ingresos: MontoFormateado | null;
  kpisConError: boolean;
  chartData: { date: string; encomiendas: number; boletos: number }[];
  encomiendasRecientes: EncomiendaReciente[];
  recientesError: boolean;
};

export function ResumenVista({
  esAdmin,
  checklist,
  bandeja,
  kpis,
  ingresos,
  kpisConError,
  chartData,
  encomiendasRecientes,
  recientesError,
}: DatosResumen) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <PageHeader title="Resumen" />

      {checklist && <ChecklistPuestaEnMarcha checklist={checklist} />}

      <BandejaAtencion inicial={bandeja} />

      <section aria-label="Hoy" className="flex flex-col gap-4">
        <SectionLabel>Hoy</SectionLabel>
        {kpisConError && <ErrorRecargable titulo="No pudimos cargar algunos datos de hoy" />}
        {/* Móvil: rejilla compacta de 2 columnas; escritorio: 2 y luego 4. */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <KpiCard title="Boletos vendidos" value={kpis.boletos} icon={ICONO_SECCION.taquillaBoletos} />
          <KpiCard
            title="Ingresos verificados"
            tono="mint"
            value={ingresos ? <span aria-label={ingresos.accesible}>{ingresos.principal}</span> : "—"}
            detail={ingresos?.secundario ?? null}
            icon={Coins}
          />
          <KpiCard
            title="Encomiendas recibidas"
            value={kpis.recibidas}
            icon={ICONO_SECCION.taquillaEncomiendas}
            tono="coral"
          />
          <KpiCard
            title="Encomiendas despachadas"
            value={kpis.despachadas}
            icon={ICONO_SECCION.despacho}
            tono="coral"
          />
        </div>
      </section>

      {/* La tarjeta «Comisión con EnBus» queda oculta temporalmente mientras se valida el modelo de negocio. */}
      {esAdmin && <ActivityChart data={chartData} />}

      <section aria-label="Encomiendas recientes" className="flex flex-col gap-4">
        <SectionLabel>Encomiendas recientes</SectionLabel>
        {recientesError ? (
          <ErrorRecargable titulo="No pudimos cargar las encomiendas recientes" />
        ) : (
          <EncomiendasRecientes items={encomiendasRecientes} />
        )}
      </section>
    </div>
  );
}
