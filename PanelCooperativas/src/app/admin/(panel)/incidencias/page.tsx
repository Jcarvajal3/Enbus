export const dynamic = "force-dynamic";

import { fetchIncidencias } from "@/lib/data/admin-incidencias";
import { PageHeader } from "@/components/page-header";
import { IncidenciasTable } from "@/components/admin/incidencias/incidencias-table";
import { FILTROS_ESTADO_INCIDENCIA, type FiltroEstadoIncidencia } from "@/lib/types/admin-incidencias";

interface PageProps {
  searchParams: Promise<{ tipo?: string; estado?: string }>;
}

export default async function AdminIncidenciasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Vista por defecto: abiertas y en proceso. "all" (enlaces viejos) = todas.
  const estadoParam = params.estado === "all" ? "todas" : params.estado;
  const estado: FiltroEstadoIncidencia = (FILTROS_ESTADO_INCIDENCIA as readonly string[]).includes(estadoParam ?? "")
    ? (estadoParam as FiltroEstadoIncidencia)
    : "pendientes";
  const tipo = params.tipo && params.tipo !== "all" ? params.tipo : "all";

  const incidencias = await fetchIncidencias({ tipo, estado });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Incidencias" description="Primero las de prioridad alta." />

      <IncidenciasTable
        key={`${estado}-${tipo}`}
        data={incidencias}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
