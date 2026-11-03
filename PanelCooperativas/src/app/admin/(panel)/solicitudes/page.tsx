import { PageHeader } from "@/components/page-header";
import { fetchSolicitudes } from "@/lib/data/admin-solicitudes";
import { SolicitudesTable } from "@/components/admin/solicitudes/solicitudes-table";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";

export const dynamic = "force-dynamic";

export default async function SolicitudesPage() {
  await requireSuperAdmin();
  // Si la consulta falla, el error llega a (panel)/error.tsx con "Reintentar".
  const solicitudes = await fetchSolicitudes();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Solicitudes"
        description="Cooperativas que piden entrar a EnBus."
      />

      <SolicitudesTable solicitudes={solicitudes} />
    </div>
  );
}
