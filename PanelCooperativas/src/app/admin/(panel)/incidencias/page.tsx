export const dynamic = "force-dynamic";

import { fetchIncidencias } from "@/lib/data/admin-incidencias";
import { IncidenciasTable } from "@/components/admin/incidencias/incidencias-table";

interface PageProps {
  searchParams: Promise<{ tipo?: string; estado?: string }>;
}

export default async function AdminIncidenciasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const incidencias = await fetchIncidencias({
    tipo: params.tipo,
    estado: params.estado,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Incidencias</h1>
        <p className="text-muted-foreground mt-1">
          Reportes de usuarios y alertas automáticas. Toma un caso para atenderlo y regístralo como resuelto al terminar.
        </p>
      </div>

      <IncidenciasTable data={incidencias} />
    </div>
  );
}
