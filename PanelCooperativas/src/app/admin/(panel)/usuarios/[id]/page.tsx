export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { fetchUsuarioById } from "@/lib/data/admin-usuarios";
import { PageHeader } from "@/components/page-header";
import { MigaObjeto } from "@/components/miga-objeto";
import { StatusBadge } from "@/components/status-badge";
import { UsuarioDetailTabs } from "@/components/admin/usuarios/usuario-detail-tabs";
import { UsuarioActions } from "@/components/admin/usuarios/usuario-actions";
import { etiquetaRol } from "@/lib/estados";
import { bajaPorCompletar, estadoCuenta } from "@/lib/types/admin-usuarios";

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
    <div className="flex flex-col gap-6">
      <MigaObjeto label={usuario.nombre_completo} />
      <PageHeader
        title={usuario.nombre_completo}
        estado={<StatusBadge status={estadoCuenta(usuario)} dominio="cuenta" />}
        description={`${etiquetaRol(usuario.role)} · ${usuario.email || "Sin correo"}`}
      >
        <UsuarioActions
          usuarioId={usuario.id}
          nombre={usuario.nombre_completo}
          email={usuario.email ?? null}
          role={usuario.role}
          isBanned={usuario.is_banned}
          bajaPendiente={bajaPorCompletar(usuario)}
          eliminada={Boolean(usuario.eliminada_at)}
        />
      </PageHeader>

      <UsuarioDetailTabs usuario={usuario} />
    </div>
  );
}
