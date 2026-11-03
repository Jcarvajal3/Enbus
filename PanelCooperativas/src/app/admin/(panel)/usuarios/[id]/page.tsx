export const dynamic = "force-dynamic";

import { fetchUsuarioById } from "@/lib/data/admin-usuarios";
import { notFound } from "next/navigation";
import { UsuarioDetailTabs } from "@/components/admin/usuarios/usuario-detail-tabs";
import { UsuarioActions } from "@/components/admin/usuarios/usuario-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { etiquetaRol } from "@/lib/estados";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function UsuarioDetailPage({ params }: PageProps) {
  const { id } = await params;
  const usuario = await fetchUsuarioById(id);

  if (!usuario) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Back Button / Breadcrumb */}
      <div>
        <Link 
          href="/admin/usuarios"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a usuarios
        </Link>
      </div>

      {/* Main Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card border p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2">
            <AvatarFallback className="bg-muted text-muted-foreground font-semibold text-xl">
              {usuario.nombre_completo.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{usuario.nombre_completo}</h1>
              <Badge variant="secondary">{etiquetaRol(usuario.role)}</Badge>
              {usuario.is_banned ? (
                <Badge variant="outline" className="border-destructive/40 text-destructive-text">
                  Suspendida
                </Badge>
              ) : (
                <Badge variant="outline">Activa</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              {usuario.email || <span className="text-muted-foreground">Sin correo</span>}
            </p>
          </div>
        </div>
        
        {/* Action buttons */}
        <UsuarioActions 
          usuarioId={usuario.id}
          nombre={usuario.nombre_completo}
          role={usuario.role}
          isBanned={usuario.is_banned} 
          encomiendasEnviadas={usuario.encomiendas_enviadas}
          encomiendasRecibidas={usuario.encomiendas_recibidas}
        />
      </div>

      {/* Detail Tabs */}
      <UsuarioDetailTabs usuario={usuario} />
    </div>
  );
}
