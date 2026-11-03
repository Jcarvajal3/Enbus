export const dynamic = "force-dynamic";

import { fetchIncidencias } from "@/lib/data/admin-incidencias";
import { PageHeader } from "@/components/page-header";
import { IncidenciasTable } from "@/components/admin/incidencias/incidencias-table";
import { FILTROS_ESTADO_INCIDENCIA, type FiltroEstadoIncidencia } from "@/lib/types/admin-incidencias";

interface PageProps {
  searchParams: Promise<{ tipo?: string; estado?: string; q?: string }>;
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
    <div className="space-y-6">
      <PageHeader
        title="Incidencias"
        description="Reportes de usuarios y alertas automáticas, ordenados por prioridad y antigüedad. Toma un caso para atenderlo y regístralo como resuelto al terminar."
      />

      <IncidenciasTable
        // Al cambiar los filtros del servidor, la búsqueda local se reinicia desde la URL.
        key={`${estado}-${tipo}`}
        data={incidencias}
        estado={estado}
        tipo={tipo}
        q={params.q ?? ""}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
