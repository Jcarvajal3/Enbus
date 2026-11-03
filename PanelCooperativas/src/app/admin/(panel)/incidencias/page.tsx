export const dynamic = "force-dynamic";

import { fetchIncidencias } from "@/lib/data/admin-incidencias";
import { PageHeader } from "@/components/page-header";
import { IncidenciasTable } from "@/components/admin/incidencias/incidencias-table";
import { FILTROS_ESTADO_INCIDENCIA, type FiltroEstadoIncidencia } from "@/lib/types/admin-incidencias";

interface PageProps {
  searchParams: Promise<{ tipo?: string; estado?: string; q?: string; pagina?: string }>;
}

export default async function AdminIncidenciasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Vista por defecto: abiertas y en proceso. "all" (enlaces viejos) = todas.
  const estadoParam = params.estado === "all" ? "todas" : params.estado;
  const estado: FiltroEstadoIncidencia = (FILTROS_ESTADO_INCIDENCIA as readonly string[]).includes(estadoParam ?? "")
    ? (estadoParam as FiltroEstadoIncidencia)
    : "pendientes";
  const tipo = params.tipo && params.tipo !== "all" ? params.tipo : "all";
  const q = (params.q ?? "").trim().slice(0, 80);
  const pagina = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  // Filtros, búsqueda, orden de atención y paginación se resuelven en el servidor.
  const resultado = await fetchIncidencias({ tipo, estado, q, pagina });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Incidencias" description="Primero las de prioridad alta." />

      <IncidenciasTable
        // Sin `q` en la key: la búsqueda (BarraFiltros) no pierde el foco al escribir.
        key={`${estado}-${tipo}`}
        resultado={resultado}
        estado={estado}
        tipo={tipo}
        q={q}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
