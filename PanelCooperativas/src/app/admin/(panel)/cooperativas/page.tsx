export const dynamic = "force-dynamic";

import { fetchCooperativas } from "@/lib/data/admin-cooperativas";
import { PageHeader } from "@/components/page-header";
import { CooperativasTable } from "@/components/admin/cooperativas/cooperativas-table";
import { CreateCooperativaDialog } from "@/components/admin/cooperativas/create-cooperativa-dialog";

interface PageProps {
  /** `search` es el nombre anterior de `q` (enlaces viejos). */
  searchParams: Promise<{ estado?: string; q?: string; search?: string }>;
}

const ESTADOS = ["PENDIENTE", "RECHAZADA", "ACTIVA", "SUSPENDIDA", "DESACTIVADA"];

export default async function AdminCooperativasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const estado = params.estado && ESTADOS.includes(params.estado) ? params.estado : "";
  const q = (params.q ?? params.search ?? "").trim();
  const cooperativas = await fetchCooperativas({ estado: estado || undefined, search: q || undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Cooperativas">
        <CreateCooperativaDialog />
      </PageHeader>

      <CooperativasTable key={`${estado}-${q}`} initialCooperativas={cooperativas} estado={estado} q={q} />
    </div>
  );
}
