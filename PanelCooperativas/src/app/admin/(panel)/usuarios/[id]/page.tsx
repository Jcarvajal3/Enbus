export const dynamic = "force-dynamic";

import { fetchUsuarioById } from "@/lib/data/admin-usuarios";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { UsuarioDetailTabs } from "@/components/admin/usuarios/usuario-detail-tabs";
import { UsuarioActions } from "@/components/admin/usuarios/usuario-actions";
import { Badge } from "@/components/ui/badge";
import { etiquetaRol } from "@/lib/estados";
import { formatFechaHoraVE } from "@/lib/fechas";
import { bajaPorCompletar } from "@/lib/types/admin-usuarios";

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
      <PageHeader
        title={usuario.nombre_completo}
        migas={[{ label: "Usuarios", href: "/admin/usuarios" }, { label: usuario.nombre_completo }]}
        description={
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{etiquetaRol(usuario.role)}</Badge>
              {usuario.eliminada_at ? (
                <Badge variant="secondary" className="bg-muted text-foreground">
                  Cuenta eliminada
                </Badge>
              ) : usuario.is_banned ? (
                <Badge variant="secondary" className="bg-destructive-light text-destructive-deep">
                  Suspendida
                </Badge>
              ) : (
                <Badge variant="outline">Activa</Badge>
              )}
              <span className="font-mono text-sm">{usuario.email || "Sin correo"}</span>
            </div>
            {usuario.eliminada_at && (
              <p className="text-sm">
                Eliminó su cuenta desde la app el {formatFechaHoraVE(usuario.eliminada_at)}.
                {usuario.baja?.motivo ? ` Motivo: ${usuario.baja.motivo}.` : ""}{" "}
                {bajaPorCompletar(usuario)
                  ? "Falta borrar su acceso: usa «Completar baja»."
                  : usuario.baja?.auth_eliminada_at
                    ? `Su acceso se borró el ${formatFechaHoraVE(usuario.baja.auth_eliminada_at)}.`
                    : ""}
              </p>
            )}
          </div>
        }
      >
        <UsuarioActions
          usuarioId={usuario.id}
          nombre={usuario.nombre_completo}
          email={usuario.email ?? null}
          role={usuario.role}
          isBanned={usuario.is_banned}
          bajaPendiente={bajaPorCompletar(usuario)}
          eliminada={Boolean(usuario.eliminada_at)}
          encomiendasEnviadas={usuario.encomiendas_enviadas}
          encomiendasRecibidas={usuario.encomiendas_recibidas}
        />
      </PageHeader>

      <UsuarioDetailTabs usuario={usuario} />
    </div>
  );
}
