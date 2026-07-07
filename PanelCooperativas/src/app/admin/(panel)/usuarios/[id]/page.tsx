export const dynamic = "force-dynamic";

import { fetchUsuarioById } from "@/lib/data/admin-usuarios";
import { notFound } from "next/navigation";
import { UsuarioDetailTabs } from "@/components/admin/usuarios/usuario-detail-tabs";
import { UsuarioActions } from "@/components/admin/usuarios/usuario-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function UsuarioDetailPage({ params }: PageProps) {
  const { id } = await params;
  const usuario = await fetchUsuarioById(id);

  if (!usuario) {
    notFound();
  }

  const getRoleBadge = (role: typeof usuario.role) => {
    switch (role) {
      case "super_admin":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Super Admin</Badge>;
      case "admin_cooperativa":
        return <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20">Admin Coop</Badge>;
      case "taquillero":
        return <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20">Taquillero</Badge>;
      case "user":
        return <Badge className="bg-slate-500/10 text-muted-foreground border-slate-500/20">Cliente</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const getStatusBadge = (isBanned: boolean) => {
    if (isBanned) {
      return <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Suspendido</Badge>;
    }
    return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Activo</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Back Button / Breadcrumb */}
      <div>
        <Link 
          href="/admin/usuarios"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a usuarios
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
              {getRoleBadge(usuario.role)}
              {getStatusBadge(usuario.is_banned)}
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              {usuario.email || <span className="text-muted-foreground/60">Sin correo electrónico</span>}
            </p>
          </div>
        </div>
        
        {/* Action buttons */}
        <UsuarioActions 
          usuarioId={usuario.id} 
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
