export const dynamic = "force-dynamic";

import { fetchIncidenciaById } from "@/lib/data/admin-incidencias";
import { getUserProfile } from "@/lib/supabase/cached";
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
    getUserProfile()
  ]);

  if (!incidencia || !user) {
    notFound();
  }

  const currentUser = {
    id: user.id,
    nombre_completo: user.nombre_completo
  };

  return (
    <IncidenciaDetail incidencia={incidencia} currentUser={currentUser} />
  );
}
