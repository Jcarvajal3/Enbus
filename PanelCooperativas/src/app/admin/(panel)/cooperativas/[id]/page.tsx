export const dynamic = "force-dynamic";

import { fetchCooperativaById } from "@/lib/data/admin-cooperativas";
import { notFound } from "next/navigation";
import { CooperativaDetailTabs } from "@/components/admin/cooperativas/cooperativa-detail-tabs";
import { CooperativaActions } from "@/components/admin/cooperativas/cooperativa-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { Buildings } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { PendienteAprobacion } from "@/components/admin/cooperativas/cooperativas-table";
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
      <PageHeader
        title={cooperativa.nombre}
        migas={[{ label: "Cooperativas", href: "/admin/cooperativas" }, { label: cooperativa.nombre }]}
        description={
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar className="size-10 border">
                <AvatarImage src={cooperativa.logo_url || ""} alt="" />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <Buildings className="size-5" aria-hidden />
                </AvatarFallback>
              </Avatar>
              {cooperativa.estado === "PENDIENTE" ? (
                <PendienteAprobacion className="flex-row items-center gap-2" />
              ) : (
                <StatusBadge status={cooperativa.estado} dominio="cooperativa" />
              )}
              <span className="font-mono text-sm">RIF: {cooperativa.rif}</span>
            </div>
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
        }
      >
        <CooperativaActions cooperativa={cooperativa} />
      </PageHeader>

      {/* Detail Tabs */}
      <CooperativaDetailTabs cooperativa={cooperativa} />
    </div>
  );
}
