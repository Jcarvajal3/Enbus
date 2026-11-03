export const dynamic = "force-dynamic";

import { fetchUsuarios } from "@/lib/data/admin-usuarios";
import { fetchCooperativas } from "@/lib/data/admin-cooperativas";
import { PageHeader } from "@/components/page-header";
import { UsuariosTable } from "@/components/admin/usuarios/usuarios-table";
import type { FiltrosUsuarios } from "@/lib/types/admin-usuarios";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    rol?: string;
    cooperativa?: string;
    pagina?: string;
    vista?: string;
    /** Nombres anteriores de los parámetros (enlaces viejos). */
    role?: string;
    cooperativa_id?: string;
    search?: string;
  }>;
}

export default async function AdminUsuariosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sinTodos = (v?: string) => (v && v !== "ALL" ? v : undefined);

  const filtros: FiltrosUsuarios = {
    q: (params.q ?? params.search ?? "").trim() || undefined,
    rol: sinTodos(params.rol ?? params.role),
    cooperativa: sinTodos(params.cooperativa ?? params.cooperativa_id),
    pagina: Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1),
    vista: params.vista === "bajas" ? "bajas" : "todas",
  };

  const [resultado, cooperativas] = await Promise.all([fetchUsuarios(filtros), fetchCooperativas()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Usuarios" />

      <UsuariosTable
        resultado={resultado}
        filtros={filtros}
        cooperativas={cooperativas.map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado }))}
      />
    </div>
  );
}
