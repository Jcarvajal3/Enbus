export const dynamic = "force-dynamic";

import { fetchCooperativaById } from "@/lib/data/admin-cooperativas";
import { notFound } from "next/navigation";
import { CooperativaDetailTabs } from "@/components/admin/cooperativas/cooperativa-detail-tabs";
import { CooperativaActions } from "@/components/admin/cooperativas/cooperativa-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { ArrowLeft, Buildings } from "@phosphor-icons/react/dist/ssr"; // Use SSR-safe icons
import Link from "next/link";
import { formatFechaVE } from "@/lib/fechas";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CooperativaDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cooperativa = await fetchCooperativaById(id);

  if (!cooperativa) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Back Button / Breadcrumb */}
      <div>
        <Link 
          href="/admin/cooperativas"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a cooperativas
        </Link>
      </div>

      {/* Main Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card border p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2">
            <AvatarImage src={cooperativa.logo_url || ""} alt={cooperativa.nombre} />
            <AvatarFallback className="bg-muted text-muted-foreground">
              <Buildings className="h-8 w-8" />
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{cooperativa.nombre}</h1>
              <StatusBadge status={cooperativa.estado} dominio="cooperativa" />
            </div>
            <p className="text-sm text-muted-foreground font-mono">RIF: {cooperativa.rif}</p>
            {cooperativa.motivo_estado && cooperativa.estado !== "ACTIVA" && cooperativa.estado !== "PENDIENTE" && (
              <p className="max-w-xl text-sm text-foreground">
                <span className="text-muted-foreground">Motivo: </span>
                {cooperativa.motivo_estado}
                {cooperativa.estado_cambiado_at && (
                  <span className="text-muted-foreground"> · desde el {formatFechaVE(cooperativa.estado_cambiado_at)}</span>
                )}
              </p>
            )}
          </div>
        </div>
        
        {/* Action buttons */}
        <CooperativaActions cooperativa={cooperativa} />
      </div>

      {/* Detail Tabs */}
      <CooperativaDetailTabs cooperativa={cooperativa} />
    </div>
  );
}
