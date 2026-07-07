export const dynamic = "force-dynamic";

import { fetchCooperativas } from "@/lib/data/admin-cooperativas";
import { CooperativasTable } from "@/components/admin/cooperativas/cooperativas-table";
import { CreateCooperativaDialog } from "@/components/admin/cooperativas/create-cooperativa-dialog";

interface PageProps {
  searchParams: Promise<{ estado?: string; search?: string }>;
}

export default async function AdminCooperativasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const cooperativas = await fetchCooperativas({
    estado: params.estado,
    search: params.search
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cooperativas</h1>
          <p className="text-muted-foreground mt-1">
            Visualiza, edita, suspende o registra nuevas cooperativas afiliadas a EnBus.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CreateCooperativaDialog />
        </div>
      </div>

      {/* Main Content */}
      <CooperativasTable initialCooperativas={cooperativas} />
    </div>
  );
}
