export const dynamic = "force-dynamic";

import { fetchUsuarios } from "@/lib/data/admin-usuarios";
import { fetchCooperativas } from "@/lib/data/admin-cooperativas";
import { UsuariosTable } from "@/components/admin/usuarios/usuarios-table";

interface PageProps {
  searchParams: Promise<{ 
    role?: string; 
    cooperativa_id?: string; 
    search?: string; 
  }>;
}

export default async function AdminUsuariosPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Fetch users with filters
  const usuarios = await fetchUsuarios({
    role: params.role,
    cooperativa_id: params.cooperativa_id,
    search: params.search,
  });

  // Fetch all cooperativas to populate the filter dropdown
  const allCooperativas = await fetchCooperativas();
  const cooperativasDropdown = allCooperativas
    .filter((c) => c.estado === "ACTIVA")
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground mt-1">
          Administración centralizada de usuarios, taquilleros y administradores de cooperativas.
        </p>
      </div>

      {/* Table & Filtering */}
      <UsuariosTable initialUsuarios={usuarios} cooperativas={cooperativasDropdown} />
    </div>
  );
}
