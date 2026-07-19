import { PageHeader } from "@/components/page-header";
import { fetchSolicitudesPendientes } from "@/lib/data/admin-solicitudes";
import { SolicitudesTable } from "@/components/admin/solicitudes/solicitudes-table";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";

export const dynamic = "force-dynamic";

export default async function SolicitudesPage() {
  await requireSuperAdmin();
  const solicitudes = await fetchSolicitudesPendientes();

  return (
    <div className="flex flex-col gap-6 font-sans">
      <PageHeader
        title="Solicitudes de Registro"
        description="Revisa y aprueba las solicitudes de registro de nuevas cooperativas."
      />
      
      <SolicitudesTable solicitudes={solicitudes} />
    </div>
  );
}
