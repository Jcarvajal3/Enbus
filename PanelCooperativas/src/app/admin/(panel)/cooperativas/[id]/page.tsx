export const dynamic = "force-dynamic";

import { fetchCooperativaById } from "@/lib/data/admin-cooperativas";
import { notFound } from "next/navigation";
import { CooperativaDetailTabs } from "@/components/admin/cooperativas/cooperativa-detail-tabs";
import { CooperativaActions } from "@/components/admin/cooperativas/cooperativa-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Buildings } from "@phosphor-icons/react/dist/ssr"; // Use SSR-safe icons
import Link from "next/link";
import type { EstadoCooperativa } from "@/lib/types/admin-cooperativas";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CooperativaDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cooperativa = await fetchCooperativaById(id);

  if (!cooperativa) {
    notFound();
  }

  const getEstadoBadge = (estado: EstadoCooperativa) => {
    switch (estado) {
      case "PENDIENTE":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Pendiente</Badge>;
      case "ACTIVA":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Activa</Badge>;
      case "SUSPENDIDA":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Suspendida</Badge>;
      case "DESACTIVADA":
        return <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Desactivada</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Button / Breadcrumb */}
      <div>
        <Link 
          href="/admin/cooperativas"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a cooperativas
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
              {getEstadoBadge(cooperativa.estado)}
            </div>
            <p className="text-sm text-muted-foreground font-mono">RIF: {cooperativa.rif}</p>
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
