export const dynamic = "force-dynamic";

import { fetchIncidenciaById } from "@/lib/data/admin-incidencias";
import { requireSuperAdmin } from "@/lib/data/admin-auth";
import { notFound } from "next/navigation";
import { IncidenciaDetail } from "@/components/admin/incidencias/incidencia-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function IncidenciaDetailPage({ params }: PageProps) {
  const { id } = await params;

  // Validate UUID format to prevent Supabase errors from malformed route params
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) {
    notFound();
  }
  
  const [incidencia, user] = await Promise.all([
    fetchIncidenciaById(id),
    requireSuperAdmin(),
  ]);

  if (!incidencia) {
    notFound();
  }

  const currentUser = {
    id: user.id,
    nombre_completo: user.nombre_completo
  };

  return (
    <div className="space-y-6">
      <IncidenciaDetail 
        incidencia={incidencia} 
        currentUser={currentUser} 
      />
    </div>
  );
}
